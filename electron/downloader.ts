import https from 'https';
import http from 'http';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { MODEL_PACKAGES, ModelPackage, hfResolveUrl, HF_REPO_ID, HF_REVISION } from './models';

export interface DownloadProgressEvent {
  phase: 'checking' | 'downloading' | 'complete' | 'error' | 'skipped';
  packageId: string;
  packageName: string;
  currentFile: string;
  fileIndex: number;
  totalFiles: number;
  fileBytesDownloaded: number;
  fileBytesTotal: number;
  packageBytesDownloaded: number;
  packageBytesTotal: number;
  overallPercentage: number;
  error?: string;
}

type ProgressCallback = (event: DownloadProgressEvent) => void;

/**
 * Follows HTTP redirects and resolves with the final response stream.
 */
function getFollowRedirects(url: string, maxRedirects = 10): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'OTunesByOyama/1.0' },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects === 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        resolve(getFollowRedirects(res.headers.location, maxRedirects - 1));
      } else if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      } else {
        resolve(res);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Downloads a single file with progress callbacks.
 * Supports resume via Range header if a partial file exists.
 */
async function downloadFile(
  url: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
): Promise<void> {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });

  let existingSize = 0;
  try {
    const stat = await fsp.stat(destPath);
    existingSize = stat.size;
  } catch {
    // File doesn't exist yet
  }

  const client = url.startsWith('https') ? https : http;

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'User-Agent': 'OTunesByOyama/1.0' };
    if (existingSize > 0) {
      headers['Range'] = `bytes=${existingSize}-`;
    }

    const doRequest = (reqUrl: string, redirectCount = 0): void => {
      if (redirectCount > 10) { reject(new Error('Too many redirects')); return; }
      const reqClient = reqUrl.startsWith('https') ? https : http;
      const req = reqClient.get(reqUrl, { headers }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location, redirectCount + 1);
          return;
        }
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          reject(new Error(`HTTP ${res.statusCode} downloading ${path.basename(destPath)}`));
          return;
        }

        const isResume = res.statusCode === 206;
        const totalBytes = isResume
          ? existingSize + parseInt(res.headers['content-range']?.split('/')[1] ?? '0', 10)
          : parseInt(res.headers['content-length'] ?? '0', 10);

        let downloaded = isResume ? existingSize : 0;
        const writeStream = fs.createWriteStream(destPath, { flags: isResume ? 'a' : 'w' });

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          onProgress(downloaded, totalBytes);
        });
        res.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        res.on('error', reject);
      });
      req.on('error', reject);
    };

    doRequest(url);
  });
}

export class ModelDownloader {
  private skippedPackages = new Set<string>();
  private downloadedPackages: string[] = [];

  constructor(private onProgress: ProgressCallback) {}

  skip(packageId: string): void {
    this.skippedPackages.add(packageId);
  }

  getDownloadedPackages(): string[] {
    return this.downloadedPackages;
  }

  /**
   * Downloads all non-skipped model packages to modelsDir.
   * @param modelsDir  Absolute path to the Ace-Step1.5 folder.
   */
  async downloadAll(modelsDir: string): Promise<void> {
    const packages = MODEL_PACKAGES.filter(
      (p) => p.required || !this.skippedPackages.has(p.id),
    );

    const totalBytes = packages.reduce(
      (acc, pkg) => acc + pkg.files.reduce((a, f) => a + (f.sizeBytes ?? 0), 0),
      0,
    );
    let overallDownloaded = 0;

    for (const pkg of packages) {
      if (this.skippedPackages.has(pkg.id) && !pkg.required) {
        this.emit(pkg, 'skipped', '', 0, pkg.files.length, 0, 0, 0, 0, 100);
        continue;
      }

      await this.downloadPackage(pkg, modelsDir, (pkgDownloaded, pkgTotal) => {
        const pct = totalBytes > 0 ? Math.round(((overallDownloaded + pkgDownloaded) / totalBytes) * 100) : 100;
        // overall percentage is updated per-chunk inside downloadPackage
        void pct;
      });
      overallDownloaded += pkg.files.reduce((a, f) => a + (f.sizeBytes ?? 0), 0);
      this.downloadedPackages.push(pkg.id);
    }
  }

  private async downloadPackage(
    pkg: ModelPackage,
    modelsDir: string,
    onPkgProgress: (downloaded: number, total: number) => void,
  ): Promise<void> {
    const pkgTotal = pkg.files.reduce((a, f) => a + (f.sizeBytes ?? 0), 0);
    let pkgDownloaded = 0;

    for (let i = 0; i < pkg.files.length; i++) {
      const file = pkg.files[i];
      const destPath = path.join(modelsDir, file.path);

      // Skip if file already exists and has the expected size
      try {
        const stat = await fsp.stat(destPath);
        if (file.sizeBytes && stat.size >= file.sizeBytes * 0.99) {
          pkgDownloaded += file.sizeBytes ?? 0;
          this.emit(pkg, 'downloading', file.path, i, pkg.files.length,
            file.sizeBytes ?? 0, file.sizeBytes ?? 0,
            pkgDownloaded, pkgTotal, this.overallPct(pkgDownloaded, pkgTotal));
          continue;
        }
      } catch {
        // Doesn't exist yet — continue to download
      }

      const url = hfResolveUrl(HF_REPO_ID, HF_REVISION, file.path);
      let lastEmit = 0;

      try {
        await downloadFile(url, destPath, (fileDownloaded, fileTotal) => {
          const now = Date.now();
          if (now - lastEmit > 250) {
            lastEmit = now;
            this.emit(
              pkg, 'downloading', file.path, i, pkg.files.length,
              fileDownloaded, fileTotal || file.sizeBytes || 0,
              pkgDownloaded + fileDownloaded, pkgTotal,
              this.overallPct(pkgDownloaded + fileDownloaded, pkgTotal),
            );
          }
        });
        pkgDownloaded += file.sizeBytes ?? 0;
        onPkgProgress(pkgDownloaded, pkgTotal);
      } catch (err) {
        this.emit(pkg, 'error', file.path, i, pkg.files.length, 0, 0,
          pkgDownloaded, pkgTotal, 0, (err as Error).message);
        throw err;
      }
    }

    this.emit(pkg, 'complete', '', pkg.files.length, pkg.files.length,
      pkgTotal, pkgTotal, pkgTotal, pkgTotal, 100);
  }

  private overallPct(downloaded: number, total: number): number {
    return total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 50;
  }

  private emit(
    pkg: ModelPackage,
    phase: DownloadProgressEvent['phase'],
    currentFile: string,
    fileIndex: number,
    totalFiles: number,
    fileBytesDownloaded: number,
    fileBytesTotal: number,
    packageBytesDownloaded: number,
    packageBytesTotal: number,
    overallPercentage: number,
    error?: string,
  ): void {
    this.onProgress({
      phase,
      packageId: pkg.id,
      packageName: pkg.name,
      currentFile,
      fileIndex,
      totalFiles,
      fileBytesDownloaded,
      fileBytesTotal,
      packageBytesDownloaded,
      packageBytesTotal,
      overallPercentage,
      error,
    });
  }
}
