import { Router, Request, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { resolvePythonPath } from '../services/acestep.js';
import { ensureLocalAceStepServer, resolveAceStepDir } from '../services/local-acestep.js';
import multer from 'multer';
import path from 'path';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { execSync, spawn } from 'child_process';
import { randomUUID } from 'crypto';

const router = Router();
type AceStepWrappedResponse<T> = {
  data: T | null;
  code?: number;
  error?: string | null;
};

type AceStepDatasetSample = {
  index?: number;
  filename?: string;
  audio_path?: string | null;
  caption?: string;
  genre?: string;
  prompt_override?: string | null;
  lyrics?: string;
  bpm?: number | null;
  keyscale?: string;
  timesignature?: string;
  duration?: number | null;
  language?: string;
  is_instrumental?: boolean;
  raw_lyrics?: string;
  labeled?: boolean;
};

type AceStepDatasetLoadResponse = {
  message?: string;
  dataset_name?: string;
  num_samples?: number;
  labeled_count?: number;
  samples?: AceStepDatasetSample[];
};

const DATAFRAME_HEADERS = ['#', 'Filename', 'Duration', 'Lyrics', 'Labeled', 'BPM', 'Key', 'Caption'];

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.ogg', '.opus', '.m4a', '.aac', '.mp4', '.webm'];
const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mpeg3',
  'audio/x-mpeg-3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
  'audio/opus',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/webm',
  'video/mp4',
];

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB per file
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (AUDIO_EXTENSIONS.includes(ext) || AUDIO_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext || file.mimetype}. Allowed: ${AUDIO_EXTENSIONS.join(', ')}`));
    }
  },
});

function sanitizeUploadFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const base = path.basename(filename, ext);
  const safeBase = base.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim() || 'audio';
  return `${safeBase}${ext}`;
}

function getUniqueUploadPath(destDir: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const base = path.basename(originalName, ext);
  let candidate = path.join(destDir, `${base}${ext}`);
  let suffix = 1;

  while (existsSync(candidate)) {
    candidate = path.join(destDir, `${base}-${suffix}${ext}`);
    suffix += 1;
  }

  return candidate;
}

// Get audio duration via ffprobe
function getAudioDuration(filePath: string): number {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    const duration = parseFloat(result.trim());
    return isNaN(duration) ? 0 : Math.round(duration);
  } catch {
    return 0;
  }
}

// Resolve ACE-Step base directory
function getAceStepDir(): string {
  return resolveAceStepDir();
}

function resolveDatasetJsonPath(datasetPath: string): string {
  const trimmed = datasetPath.trim();
  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }

  const normalized = trimmed.replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalized.startsWith('datasets/')) {
    return path.join(config.datasets.dir, normalized.slice('datasets/'.length));
  }

  return path.resolve(getAceStepDir(), trimmed);
}

function getAceStepApiUrl(pathname: string): string {
  return new URL(pathname, config.acestep.apiUrl).toString();
}

async function aceStepApiRequest<T>(
  pathname: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<T> {
  await ensureLocalAceStepServer(config.acestep.apiUrl);

  const headers = new Headers(init.headers ?? {});
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(getAceStepApiUrl(pathname), {
    ...init,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await response.json().catch(() => null) as AceStepWrappedResponse<T> | null;

  if (!response.ok) {
    const errorMessage = payload?.error || (payload?.data as any)?.message || `ACE-Step API request failed: ${response.status}`;
    throw new Error(String(errorMessage));
  }

  if (!payload) {
    throw new Error('ACE-Step API returned an empty response');
  }

  if ((payload.code && payload.code >= 400) || payload.error) {
    throw new Error(payload.error || `ACE-Step API returned code ${payload.code}`);
  }

  if (payload.data == null) {
    throw new Error('ACE-Step API returned no data');
  }

  return payload.data;
}

function readDatasetSettingsFromJson(datasetPath: string): {
  datasetName: string;
  customTag: string;
  tagPosition: 'prepend' | 'append' | 'replace';
  allInstrumental: boolean;
  genreRatio: number;
} {
  const defaults = {
    datasetName: path.basename(datasetPath, path.extname(datasetPath)),
    customTag: '',
    tagPosition: 'replace' as const,
    allInstrumental: true,
    genreRatio: 0,
  };

  try {
    const parsed = JSON.parse(readFileSync(datasetPath, 'utf-8')) as {
      metadata?: {
        name?: string;
        custom_tag?: string;
        tag_position?: 'prepend' | 'append' | 'replace';
        all_instrumental?: boolean;
        genre_ratio?: number;
      };
    };
    return {
      datasetName: parsed.metadata?.name || defaults.datasetName,
      customTag: parsed.metadata?.custom_tag || '',
      tagPosition: parsed.metadata?.tag_position || defaults.tagPosition,
      allInstrumental: parsed.metadata?.all_instrumental ?? defaults.allInstrumental,
      genreRatio: parsed.metadata?.genre_ratio ?? defaults.genreRatio,
    };
  } catch {
    return defaults;
  }
}

function toTrainingSample(sample: AceStepDatasetSample | undefined, index = 0) {
  if (!sample) return null;
  return {
    index: sample.index ?? index,
    audio: sample.audio_path || null,
    filename: sample.filename || '',
    caption: sample.caption || '',
    genre: sample.genre || '',
    promptOverride: sample.prompt_override || 'Use Global Ratio',
    lyrics: sample.lyrics || '',
    bpm: sample.bpm ?? 0,
    key: sample.keyscale || '',
    timeSignature: sample.timesignature || '',
    duration: sample.duration ?? 0,
    language: sample.language || 'unknown',
    instrumental: sample.is_instrumental ?? false,
    rawLyrics: sample.raw_lyrics || '',
  };
}

function buildDataframeFromSamples(samples: AceStepDatasetSample[]) {
  return {
    headers: DATAFRAME_HEADERS,
    data: samples.map((sample, index) => ([
      index + 1,
      sample.filename || '',
      `${sample.duration ?? 0}s`,
      sample.lyrics || '',
      sample.labeled ? '✅' : '❌',
      sample.bpm ?? '',
      sample.keyscale || '',
      sample.caption || '',
    ])),
  };
}

function formatDatasetResponse(payload: AceStepDatasetLoadResponse, datasetPath: string) {
  const samples = payload.samples || [];
  const settings = readDatasetSettingsFromJson(datasetPath);
  return {
    status: payload.message || `Loaded ${samples.length} samples`,
    dataframe: buildDataframeFromSamples(samples),
    sampleCount: payload.num_samples ?? samples.length,
    sample: toTrainingSample(samples[0], 0),
    settings,
  };
}

// ================== NEW ROUTES ==================

// POST /api/training/upload-audio — Upload audio files for a dataset
router.post('/upload-audio', authMiddleware, (req: AuthenticatedRequest, res: Response, next) => {
  audioUpload.array('audio', 50)(req, res, (err: any) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Invalid file upload' });
      return;
    }
    next();
  });
}, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No audio files uploaded' });
      return;
    }

    const datasetName = (req.body?.datasetName as string) || 'default';
    const uploadDir = path.join(config.datasets.uploadsDir, datasetName);
    await mkdir(uploadDir, { recursive: true });

    const savedFiles = [];
    for (const file of files) {
      const safeName = sanitizeUploadFilename(file.originalname);
      const destination = getUniqueUploadPath(uploadDir, safeName);
      await writeFile(destination, file.buffer);

      savedFiles.push({
        filename: path.basename(destination),
        originalName: file.originalname,
        size: file.size,
        path: destination,
      });
    }

    res.json({
      files: savedFiles,
      uploadDir,
      count: savedFiles.length,
    });
  } catch (error) {
    console.error('[Training] Upload audio error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Upload failed' });
  }
});

// POST /api/training/build-dataset — Scan audio directory + create dataset JSON
router.post('/build-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      datasetName = 'my_lora_dataset',
      customTag = '',
      tagPosition = 'prepend',
      allInstrumental = true,
    } = req.body;

    const audioDir = path.join(config.datasets.uploadsDir, datasetName);
    if (!existsSync(audioDir)) {
      res.status(400).json({ error: `Audio directory not found: uploads/${datasetName}` });
      return;
    }

    // Scan for audio files
    const entries = readdirSync(audioDir);
    const audioFiles = entries.filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (audioFiles.length === 0) {
      res.status(400).json({ error: 'No audio files found in directory' });
      return;
    }

    // Build samples in Gradio's exact format
    const samples = audioFiles.map(filename => {
      const audioPath = path.join(audioDir, filename);
      const duration = getAudioDuration(audioPath);
      const baseName = path.basename(filename, path.extname(filename));

      // Check for companion .txt lyrics file
      let rawLyrics = '';
      const lyricsPath = path.join(audioDir, `${baseName}.txt`);
      if (existsSync(lyricsPath)) {
        try {
          rawLyrics = readFileSync(lyricsPath, 'utf-8').trim();
        } catch { /* ignore */ }
      }

      const isInstrumental = allInstrumental || !rawLyrics;

      return {
        id: randomUUID().slice(0, 8),
        audio_path: audioPath,
        filename,
        caption: '',
        genre: '',
        lyrics: isInstrumental ? '[Instrumental]' : rawLyrics,
        raw_lyrics: rawLyrics,
        formatted_lyrics: '',
        bpm: null as number | null,
        keyscale: '',
        timesignature: '',
        duration,
        language: isInstrumental ? 'instrumental' : 'unknown',
        is_instrumental: isInstrumental,
        custom_tag: customTag,
        labeled: false,
        prompt_override: null as string | null,
      };
    });

    // Build dataset JSON
    const dataset = {
      metadata: {
        name: datasetName,
        custom_tag: customTag,
        tag_position: tagPosition,
        created_at: new Date().toISOString(),
        num_samples: samples.length,
        all_instrumental: allInstrumental,
        genre_ratio: 0,
      },
      samples,
    };

    // Save JSON to datasets dir
    await mkdir(config.datasets.dir, { recursive: true });
    const jsonPath = path.join(config.datasets.dir, `${datasetName}.json`);
    await writeFile(jsonPath, JSON.stringify(dataset, null, 2), 'utf-8');

    // Load the dataset into the ACE-Step API server state.
    try {
      const payload = await aceStepApiRequest<AceStepDatasetLoadResponse>('/v1/dataset/load', {
        method: 'POST',
        body: JSON.stringify({ dataset_path: jsonPath }),
      });
      res.json({
        ...formatDatasetResponse(payload, jsonPath),
        datasetPath: jsonPath,
      });
    } catch (apiError) {
      console.warn('[Training] ACE-Step dataset load failed, returning dataset JSON only:', apiError);
      res.json({
        status: `Dataset saved (${samples.length} samples). ACE-Step dataset API not available for live preview.`,
        dataframe: buildDataframeFromSamples(samples),
        sampleCount: samples.length,
        sample: samples.length > 0 ? {
          index: 0,
          audio: samples[0].audio_path,
          filename: samples[0].filename,
          caption: samples[0].caption,
          genre: samples[0].genre,
          promptOverride: samples[0].prompt_override ?? 'Use Global Ratio',
          lyrics: samples[0].lyrics,
          bpm: samples[0].bpm,
          key: samples[0].keyscale,
          timeSignature: samples[0].timesignature,
          duration: samples[0].duration,
          language: samples[0].language,
          instrumental: samples[0].is_instrumental,
          rawLyrics: samples[0].raw_lyrics,
        } : null,
        settings: {
          datasetName,
          customTag,
          tagPosition,
          allInstrumental,
          genreRatio: 0,
        },
        datasetPath: jsonPath,
      });
    }
  } catch (error) {
    console.error('[Training] Build dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to build dataset' });
  }
});

// GET /api/training/audio — Proxy audio files from datasets directory
router.get('/audio', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    let filePath: string;
    const aceStepDir = getAceStepDir();

    if (req.query.path) {
      filePath = req.query.path as string;
    } else if (req.query.file) {
      // Relative path within datasets dir
      filePath = path.join(config.datasets.dir, req.query.file as string);
    } else {
      res.status(400).json({ error: 'path or file parameter required' });
      return;
    }

    // Path traversal protection
    const resolved = path.resolve(filePath);
    if (resolved.includes('..') || !resolved.startsWith(aceStepDir)) {
      res.status(403).json({ error: 'Access denied: path outside ACE-Step directory' });
      return;
    }

    if (!existsSync(resolved)) {
      res.status(404).json({ error: 'Audio file not found' });
      return;
    }

    // Determine content type
    const ext = path.extname(resolved).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.wav': 'audio/wav',
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.ogg': 'audio/ogg',
      '.opus': 'audio/opus',
    };

    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.sendFile(resolved);
  } catch (error) {
    console.error('[Training] Audio proxy error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to serve audio' });
  }
});

// POST /api/training/preprocess — Spawn Python preprocessing script
router.post('/preprocess', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetPath, outputDir } = req.body;
    if (!datasetPath) {
      res.status(400).json({ error: 'datasetPath is required' });
      return;
    }

    const aceStepDir = getAceStepDir();
    const scriptPath = path.resolve(__dirname, '../../scripts/preprocess_dataset.py');
    const pythonPath = resolvePythonPath(aceStepDir);
    const resolvedOutput = outputDir || path.join(config.datasets.dir, 'preprocessed_tensors');

    // Ensure output dir exists
    await mkdir(resolvedOutput, { recursive: true });

    // Spawn Python process
    const child = spawn(pythonPath, [
      scriptPath,
      '--dataset', datasetPath,
      '--output', resolvedOutput,
      '--json',
    ], {
      cwd: aceStepDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        // Try to parse JSON output
        try {
          const result = JSON.parse(stdout.trim().split('\n').pop() || '{}');
          res.json({ status: 'Preprocessing complete', ...result });
        } catch {
          res.json({ status: 'Preprocessing complete', output: stdout.trim() });
        }
      } else {
        res.status(500).json({
          error: 'Preprocessing failed',
          code,
          stderr: stderr.trim(),
          stdout: stdout.trim(),
        });
      }
    });

    child.on('error', (err: Error) => {
      res.status(500).json({ error: `Failed to spawn process: ${err.message}` });
    });
  } catch (error) {
    console.error('[Training] Preprocess error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Preprocessing failed' });
  }
});

// POST /api/training/scan-directory — Scan a directory for audio files (Node.js implementation)
router.post('/scan-directory', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      audioDir,
      datasetName = 'my_lora_dataset',
      customTag = '',
      tagPosition = 'prepend',
      allInstrumental = true,
    } = req.body;

    if (!audioDir || typeof audioDir !== 'string') {
      res.status(400).json({ error: 'audioDir is required' });
      return;
    }

    // Resolve path — if relative, resolve from ACE-Step dir
    const aceStepDir = getAceStepDir();
    const resolvedDir = path.isAbsolute(audioDir)
      ? audioDir
      : path.resolve(aceStepDir, audioDir);

    if (!existsSync(resolvedDir)) {
      res.status(400).json({ error: `Directory not found: ${audioDir}` });
      return;
    }

    // Scan for audio files
    const entries = readdirSync(resolvedDir);
    const audioFiles = entries.filter(f => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()));
    if (audioFiles.length === 0) {
      res.status(400).json({ error: 'No audio files found in directory' });
      return;
    }

    // Build table data matching Gradio's format: [#, Filename, Duration, Lyrics, Labeled, BPM, Key, Caption]
    const tableHeaders = ['#', 'Filename', 'Duration', 'Lyrics', 'Labeled', 'BPM', 'Key', 'Caption'];
    const tableData = audioFiles.map((filename, i) => {
      const audioPath = path.join(resolvedDir, filename);
      const duration = getAudioDuration(audioPath);
      const baseName = path.basename(filename, path.extname(filename));

      // Check for companion .txt lyrics file
      let lyrics = allInstrumental ? '[Instrumental]' : '';
      const lyricsPath = path.join(resolvedDir, `${baseName}.txt`);
      if (existsSync(lyricsPath)) {
        try {
          lyrics = readFileSync(lyricsPath, 'utf-8').trim().slice(0, 50) + '...';
        } catch { /* ignore */ }
      }

      return [i + 1, filename, `${duration}s`, lyrics, '❌', '', '', ''];
    });

    res.json({
      status: `Found ${audioFiles.length} audio files`,
      dataframe: {
        headers: tableHeaders,
        data: tableData,
      },
      sampleCount: audioFiles.length,
      audioDir: resolvedDir,
    });
  } catch (error) {
    console.error('[Training] Scan directory error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to scan directory' });
  }
});

router.post('/auto-label', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      skipMetas = false,
      formatLyrics = false,
      transcribeLyrics = false,
      onlyUnlabeled = false,
    } = req.body;

    const payload = await aceStepApiRequest<{ message?: string; samples?: AceStepDatasetSample[] }>('/v1/dataset/auto_label', {
      method: 'POST',
      body: JSON.stringify({
        skip_metas: skipMetas,
        format_lyrics: formatLyrics,
        transcribe_lyrics: transcribeLyrics,
        only_unlabeled: onlyUnlabeled,
      }),
    }, 10 * 60_000);

    const samples = payload.samples || [];
    res.json({
      dataframe: buildDataframeFromSamples(samples),
      status: payload.message || 'Auto-label completed',
    });
  } catch (error) {
    console.error('[Training] Auto-label error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Auto-label failed' });
  }
});

router.post('/init-model', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      checkpoint,
      configPath,
      device = 'auto',
      initLlm = false,
      lmModelPath = '',
      backend = 'pt',
      useFlashAttention = false,
      offloadToCpu = false,
      offloadDitToCpu = false,
      compileModel = false,
      quantization = false,
    } = req.body;

    const model = (configPath || checkpoint || '').trim() || undefined;
    const payload = await aceStepApiRequest<{
      message?: string;
      loaded_model?: string;
      loaded_lm_model?: string;
      llm_initialized?: boolean;
    }>('/v1/init', {
      method: 'POST',
      body: JSON.stringify({
        model,
        init_llm: initLlm,
        lm_model_path: lmModelPath || undefined,
      }),
    }, 5 * 60_000);

    const notes = [
      payload.message || 'Model initialization completed',
      device && device !== 'auto' ? `Requested device: ${device}` : '',
      backend ? `Requested backend: ${backend}` : '',
      useFlashAttention ? 'Requested flash attention' : '',
      offloadToCpu ? 'Requested CPU offload' : '',
      offloadDitToCpu ? 'Requested DiT CPU offload' : '',
      compileModel ? 'Requested compile model' : '',
      quantization ? 'Requested quantization' : '',
    ].filter(Boolean);

    res.json({
      status: notes.join('\n'),
      modelReady: !!payload.loaded_model,
    });
  } catch (error) {
    console.error('[Training] Init model error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Model init failed' });
  }
});

// GET /api/training/checkpoints — List available model checkpoints
router.get('/checkpoints', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const aceStepDir = getAceStepDir();
    const checkpointDir = path.join(aceStepDir, 'checkpoints');
    if (!existsSync(checkpointDir)) {
      res.json({ checkpoints: [], configs: [] });
      return;
    }

    // List checkpoint directories
    const entries = readdirSync(checkpointDir);
    const checkpoints = entries.filter(e => {
      const fullPath = path.join(checkpointDir, e);
      return statSync(fullPath).isDirectory();
    });

    // List config directories (acestep-v15-*)
    const configDirs = entries.filter(e =>
      e.startsWith('acestep-v15') && statSync(path.join(checkpointDir, e)).isDirectory()
    );

    res.json({ checkpoints, configs: configDirs });
  } catch (error) {
    console.error('[Training] List checkpoints error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list checkpoints' });
  }
});

// GET /api/training/lora-checkpoints — List LoRA training checkpoints in output dir
router.get('/lora-checkpoints', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const outputDir = (req.query.dir as string) || './lora_output';
    const aceStepDir = getAceStepDir();
    const resolvedDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.resolve(aceStepDir, outputDir);

    if (!existsSync(resolvedDir)) {
      res.json({ checkpoints: [] });
      return;
    }

    const entries = readdirSync(resolvedDir);
    const checkpointsDir = path.join(resolvedDir, 'checkpoints');
    const checkpoints: string[] = [];

    if (existsSync(checkpointsDir)) {
      const cpEntries = readdirSync(checkpointsDir);
      cpEntries.forEach(e => {
        if (statSync(path.join(checkpointsDir, e)).isDirectory()) {
          checkpoints.push(path.join(checkpointsDir, e));
        }
      });
    }

    // Also check for "final" directory
    const finalDir = path.join(resolvedDir, 'final');
    if (existsSync(finalDir)) {
      checkpoints.push(finalDir);
    }

    res.json({ checkpoints, outputDir: resolvedDir });
  } catch (error) {
    console.error('[Training] List LoRA checkpoints error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list checkpoints' });
  }
});

// ================== EXISTING ROUTES ==================

// POST /api/training/load-dataset — Load an existing dataset JSON for preprocessing
router.post('/load-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetPath } = req.body;
    if (!datasetPath || typeof datasetPath !== 'string') {
      res.status(400).json({ error: 'datasetPath is required' });
      return;
    }
    // Reject path traversal
    if (datasetPath.includes('..')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const resolvedDatasetPath = resolveDatasetJsonPath(datasetPath);
    if (!existsSync(resolvedDatasetPath)) {
      res.status(404).json({ error: `Dataset file not found: ${resolvedDatasetPath}` });
      return;
    }

    const payload = await aceStepApiRequest<AceStepDatasetLoadResponse>('/v1/dataset/load', {
      method: 'POST',
      body: JSON.stringify({ dataset_path: resolvedDatasetPath }),
    });
    res.json(formatDatasetResponse(payload, resolvedDatasetPath));
  } catch (error) {
    console.error('[Training] Load dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load dataset' });
  }
});

// GET /api/training/sample-preview — Get preview data for a specific sample
router.get('/sample-preview', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const idx = parseInt(req.query.idx as string) || 0;
    const sample = await aceStepApiRequest<AceStepDatasetSample>(`/v1/dataset/sample/${idx}`);
    res.json(toTrainingSample(sample, idx));
  } catch (error) {
    console.error('[Training] Sample preview error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get sample preview' });
  }
});

// POST /api/training/save-sample — Save edits to a dataset sample
router.post('/save-sample', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { sampleIdx, caption, genre, promptOverride, lyrics, bpm, key, timeSignature, language, instrumental } = req.body;
    const idx = sampleIdx ?? 0;
    const payload = await aceStepApiRequest<{ message?: string }>(`/v1/dataset/sample/${idx}`, {
      method: 'PUT',
      body: JSON.stringify({
        sample_idx: idx,
        caption: caption ?? '',
        genre: genre ?? '',
        prompt_override: promptOverride ?? 'Use Global Ratio',
        lyrics: lyrics ?? '',
        bpm: bpm ?? 120,
        keyscale: key ?? '',
        timesignature: timeSignature ?? '',
        language: language ?? 'instrumental',
        is_instrumental: instrumental ?? true,
      }),
    });

    const samplesPayload = await aceStepApiRequest<{ samples?: AceStepDatasetSample[] }>('/v1/dataset/samples');
    res.json({
      dataframe: buildDataframeFromSamples(samplesPayload.samples || []),
      status: payload.message || 'Sample updated',
    });
  } catch (error) {
    console.error('[Training] Save sample error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save sample edit' });
  }
});

// POST /api/training/update-settings — Update dataset global settings
// Settings are applied directly when saving (via REST API), so no Gradio call needed here.
router.post('/update-settings', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true });
});

// POST /api/training/save-dataset — Save the dataset to a JSON file
router.post('/save-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { savePath, datasetName, customTag, tagPosition, allInstrumental, genreRatio } = req.body;

    const resolvedPath = (savePath ?? `./datasets/${datasetName ?? 'my_lora_dataset'}.json`).trim();

    // Use REST API to avoid @gradio/client Radio serialization issues
    const apiUrl = config.acestep.apiUrl;
    const body: Record<string, unknown> = {
      save_path: resolvedPath,
      dataset_name: datasetName ?? 'my_lora_dataset',
    };
    if (customTag !== undefined) body.custom_tag = customTag;
    if (tagPosition !== undefined) body.tag_position = tagPosition;
    if (allInstrumental !== undefined) body.all_instrumental = allInstrumental;
    if (genreRatio !== undefined) body.genre_ratio = genreRatio;

    const data = await aceStepApiRequest<{ message?: string; save_path?: string }>(new URL('/v1/dataset/save', apiUrl).pathname, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    res.json({
      status: data.message ?? 'Saved',
      path: data.save_path ?? resolvedPath,
    });
  } catch (error) {
    console.error('[Training] Save dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save dataset' });
  }
});

// POST /api/training/load-tensors — Load preprocessed tensors for training
router.post('/load-tensors', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tensorDir } = req.body;
    const data = await aceStepApiRequest<{ message?: string }>('/v1/training/load_tensor_info', {
      method: 'POST',
      body: JSON.stringify({
        tensor_dir: tensorDir ?? './datasets/preprocessed_tensors',
      }),
    });
    res.json({ status: data.message ?? 'Loaded training dataset' });
  } catch (error) {
    console.error('[Training] Load tensors error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load training dataset' });
  }
});

// POST /api/training/start — Start LoRA training
router.post('/start', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      tensorDir, rank, alpha, dropout, learningRate,
      epochs, batchSize, gradientAccumulation, saveEvery,
      shift, seed, outputDir, resumeCheckpoint,
    } = req.body;

    const data = await aceStepApiRequest<Record<string, unknown>>('/v1/training/start', {
      method: 'POST',
      body: JSON.stringify({
        tensor_dir: tensorDir ?? './datasets/preprocessed_tensors',
        lora_rank: rank ?? 64,
        lora_alpha: alpha ?? 128,
        lora_dropout: dropout ?? 0.1,
        learning_rate: learningRate ?? 0.0003,
        train_epochs: epochs ?? 1000,
        train_batch_size: batchSize ?? 1,
        gradient_accumulation: gradientAccumulation ?? 1,
        save_every_n_epochs: saveEvery ?? 200,
        training_shift: shift ?? 3.0,
        training_seed: seed ?? 42,
        lora_output_dir: outputDir ?? './lora_output',
        resume_checkpoint: resumeCheckpoint ?? null,
      }),
    }, 60_000);

    res.json({
      progress: String(data.message ?? 'Training started'),
      log: '',
      metrics: data,
    });
  } catch (error) {
    console.error('[Training] Start training error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start training' });
  }
});

// POST /api/training/stop — Stop current training
router.post('/stop', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await aceStepApiRequest<{ message?: string }>('/v1/training/stop', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    res.json({ status: data.message ?? 'Stopping training...' });
  } catch (error) {
    console.error('[Training] Stop training error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop training' });
  }
});

// GET /api/training/status — Poll current training status
router.get('/status', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await aceStepApiRequest<{
      is_training?: boolean;
      should_stop?: boolean;
      current_step?: number;
      current_loss?: number | null;
      status?: string;
      config?: Record<string, unknown>;
      tensor_dir?: string;
      loss_history?: Array<{ step?: number; loss?: number }>;
      tensorboard_url?: string | null;
      tensorboard_logdir?: string | null;
      training_log?: string;
      start_time?: number | null;
      current_epoch?: number;
      steps_per_second?: number;
      estimated_time_remaining?: number;
      error?: string | null;
    }>('/v1/training/status');

    res.json({
      isTraining: data.is_training ?? false,
      shouldStop: data.should_stop ?? false,
      currentStep: data.current_step ?? 0,
      currentLoss: data.current_loss ?? null,
      status: data.status ?? 'Idle',
      config: data.config ?? {},
      tensorDir: data.tensor_dir ?? '',
      lossHistory: data.loss_history ?? [],
      tensorboardUrl: data.tensorboard_url ?? null,
      tensorboardLogdir: data.tensorboard_logdir ?? null,
      trainingLog: data.training_log ?? '',
      startTime: data.start_time ?? null,
      currentEpoch: data.current_epoch ?? 0,
      stepsPerSecond: data.steps_per_second ?? 0,
      estimatedTimeRemaining: data.estimated_time_remaining ?? 0,
      error: data.error ?? null,
    });
  } catch (error) {
    console.error('[Training] Status error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch training status' });
  }
});

// POST /api/training/export — Export trained LoRA weights
router.post('/export', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { exportPath, loraOutputDir } = req.body;
    const data = await aceStepApiRequest<{ message?: string }>('/v1/training/export', {
      method: 'POST',
      body: JSON.stringify({
        export_path: exportPath ?? './lora_output/final_lora',
        lora_output_dir: loraOutputDir ?? './lora_output',
      }),
    });
    res.json({ status: data.message ?? 'Export completed' });
  } catch (error) {
    console.error('[Training] Export LoRA error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to export LoRA' });
  }
});

// POST /api/training/import-dataset — Import train/test split
router.post('/import-dataset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { datasetType } = req.body;
    res.status(501).json({
      error: `Dataset import type '${datasetType ?? 'train'}' is not exposed by the ACE-Step REST API used by this app.`,
    });
  } catch (error) {
    console.error('[Training] Import dataset error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to import dataset' });
  }
});

export default router;
