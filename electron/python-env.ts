import { exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import https from 'https';
import { promisify } from 'util';

const execAsync = promisify(exec);

export type StatusCallback = (msg: { step: string; status: 'info' | 'ok' | 'error' | 'log'; detail?: string }) => void;

/**
 * Handles finding / installing Python + uv, creating the virtualenv,
 * and installing the ACE-Step Python package with its dependencies.
 */
export class PythonEnvSetup {
  constructor(
    private aceStepDir: string, // e.g. /path/to/Ace-Step1.5
    private onStatus: StatusCallback,
  ) {}

  async setup(): Promise<void> {
    this.emit('Checking Python installation…', 'info');
    const pythonPath = await this.findPython();
    if (!pythonPath) {
      throw new Error('Python 3.10+ is required but was not found. Please install Python from https://python.org and re-run setup.');
    }
    this.emit(`Found Python: ${pythonPath}`, 'ok');

    const uvPath = await this.ensureUv();
    this.emit(`uv package manager: ${uvPath}`, 'ok');

    await this.createVenv(uvPath, pythonPath);
    await this.installRequirements(uvPath);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findPython(): Promise<string | null> {
    const candidates =
      process.platform === 'win32'
        ? ['python', 'python3', 'py']
        : ['python3', 'python'];

    // Also check an embedded python bundled with the app
    const embedded = path.join(this.aceStepDir, 'python_embeded', 'python.exe');
    if (fs.existsSync(embedded)) return embedded;

    for (const cmd of candidates) {
      try {
        const { stdout } = await execAsync(`${cmd} --version`);
        const ver = stdout.trim().match(/Python (\d+)\.(\d+)/);
        if (ver && (parseInt(ver[1]) > 3 || (parseInt(ver[1]) === 3 && parseInt(ver[2]) >= 10))) {
          const { stdout: which } = await execAsync(
            process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
          );
          return which.split('\n')[0].trim();
        }
      } catch {
        // not found / wrong version
      }
    }
    return null;
  }

  /** Ensures uv is on PATH or installed to the aceStepDir/uv directory. */
  private async ensureUv(): Promise<string> {
    // Check if uv is already available
    try {
      const { stdout } = await execAsync('uv --version');
      this.emit(`uv found: ${stdout.trim()}`, 'info');
      return 'uv';
    } catch {
      // Not on PATH — download the binary
    }

    this.emit('Installing uv package manager…', 'info');
    const uvDir = path.join(this.aceStepDir, '.uv');
    await fsp.mkdir(uvDir, { recursive: true });

    const uvBin =
      process.platform === 'win32'
        ? path.join(uvDir, 'uv.exe')
        : path.join(uvDir, 'uv');

    if (!fs.existsSync(uvBin)) {
      const tag = 'latest';
      const asset =
        process.platform === 'win32'
          ? 'uv-x86_64-pc-windows-msvc.zip'
          : process.platform === 'darwin'
            ? 'uv-aarch64-apple-darwin.tar.gz'
            : 'uv-x86_64-unknown-linux-gnu.tar.gz';

      const uvUrl = `https://github.com/astral-sh/uv/releases/${tag}/download/${asset}`;
      const archivePath = path.join(uvDir, asset);

      await this.downloadFile(uvUrl, archivePath);
      await this.extractArchive(archivePath, uvDir);
    }

    if (!fs.existsSync(uvBin)) {
      throw new Error(`Failed to install uv to ${uvBin}`);
    }

    // Make executable on Linux/macOS
    if (process.platform !== 'win32') {
      await fsp.chmod(uvBin, 0o755);
    }

    return uvBin;
  }

  private async createVenv(uvPath: string, pythonPath: string): Promise<void> {
    const venvDir = path.join(this.aceStepDir, 'env');
    if (fs.existsSync(path.join(venvDir, 'pyvenv.cfg'))) {
      this.emit('Virtual environment already exists.', 'ok');
      return;
    }
    this.emit('Creating Python virtual environment…', 'info');
    await this.runCommand(uvPath, ['venv', '--python', pythonPath, venvDir]);
    this.emit('Virtual environment created.', 'ok');
  }

  private async installRequirements(uvPath: string): Promise<void> {
    this.emit('Installing ACE-Step and dependencies…', 'info');
    this.emit('This may take several minutes on first install.', 'log');

    const venvDir = path.join(this.aceStepDir, 'env');

    // Install torch + torchaudio (try CUDA 12.1 first, fall back to CPU)
    const torchIndex = 'https://download.pytorch.org/whl/cu121';
    try {
      await this.runCommand(
        uvPath,
        ['pip', 'install', '--python', venvDir,
          'torch', 'torchaudio', '--index-url', torchIndex],
        { logOutput: true },
      );
      this.emit('PyTorch (CUDA 12.1) installed.', 'ok');
    } catch {
      this.emit('CUDA torch failed — trying CPU-only build…', 'info');
      await this.runCommand(
        uvPath,
        ['pip', 'install', '--python', venvDir, 'torch', 'torchaudio'],
        { logOutput: true },
      );
      this.emit('PyTorch (CPU) installed.', 'ok');
    }

    // Install the acestep package itself
    await this.runCommand(
      uvPath,
      ['pip', 'install', '--python', venvDir, 'acestep', 'gradio>=4.0.0', 'accelerate'],
      { logOutput: true },
    );
    this.emit('ACE-Step Python package installed.', 'ok');
  }

  // ── Low-level helpers ────────────────────────────────────────────────────

  private runCommand(
    bin: string,
    args: string[],
    opts: { logOutput?: boolean } = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, { cwd: this.aceStepDir });
      const output: string[] = [];

      const handleData = (data: Buffer) => {
        const text = data.toString();
        if (opts.logOutput) {
          this.onStatus({ step: text.trim(), status: 'log' });
        }
        output.push(text);
      };

      proc.stdout.on('data', handleData);
      proc.stderr.on('data', handleData);

      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Command exited with code ${code}:\n${output.join('')}`));
      });
      proc.on('error', reject);
    });
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const doRequest = (reqUrl: string, redirects = 0) => {
        if (redirects > 10) { reject(new Error('Too many redirects')); return; }
        https.get(reqUrl, { headers: { 'User-Agent': 'OTunesByOyama/1.0' } }, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.headers.location) {
            doRequest(res.headers.location, redirects + 1);
            return;
          }
          const ws = fs.createWriteStream(dest);
          res.pipe(ws);
          ws.on('finish', resolve);
          ws.on('error', reject);
        }).on('error', reject);
      };
      doRequest(url);
    });
  }

  private async extractArchive(archivePath: string, destDir: string): Promise<void> {
    if (archivePath.endsWith('.zip')) {
      // Use PowerShell on Windows
      await execAsync(
        `powershell -NoProfile -Command "Expand-Archive -Force '${archivePath}' '${destDir}'"`,
      );
    } else {
      await execAsync(`tar -xzf "${archivePath}" -C "${destDir}" --strip-components=1`);
    }
  }

  private emit(step: string, status: 'info' | 'ok' | 'error' | 'log', detail?: string): void {
    this.onStatus({ step, status, detail });
  }
}
