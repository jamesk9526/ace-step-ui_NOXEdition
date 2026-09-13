import { ChildProcess, spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const ACESTEP_DIR_NAMES = ['Ace-Step1.5', 'ACE-Step-1.5'];
const LOCAL_HOSTS = new Set(['127.0.0.1', '0.0.0.0', 'localhost']);

let aceStepProcess: ChildProcess | null = null;
let startupPromise: Promise<boolean> | null = null;
let cleanupRegistered = false;

function normalizeAceStepPath(input: string): string {
  return path.isAbsolute(input) ? input : path.resolve(repoRoot, input);
}

function scoreAceStepDir(dir: string): number {
  const isWindows = process.platform === 'win32';
  const apiExe = isWindows
    ? path.join(dir, 'env', 'Scripts', 'acestep-api.exe')
    : path.join(dir, 'env', 'bin', 'acestep-api');
  const embeddedPython = isWindows
    ? path.join(dir, 'python_embeded', 'python.exe')
    : path.join(dir, 'python_embeded', 'python');
  const uvBin = isWindows
    ? path.join(dir, '.uv', 'uv.exe')
    : path.join(dir, '.uv', 'uv');

  let score = 0;
  if (existsSync(apiExe)) score += 100;
  if (existsSync(embeddedPython)) score += 80;
  if (existsSync(uvBin)) score += 60;
  if (existsSync(path.join(dir, 'checkpoints'))) score += 30;
  if (existsSync(path.join(dir, 'env'))) score += 20;
  if (existsSync(path.join(dir, 'datasets'))) score += 10;
  if (existsSync(path.join(dir, 'output'))) score += 5;
  return score;
}

export function resolveAceStepDir(): string {
  const envPath = process.env.ACESTEP_PATH?.trim();
  if (envPath) {
    const resolved = normalizeAceStepPath(envPath);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  const candidates = ACESTEP_DIR_NAMES
    .map((name) => path.join(repoRoot, name))
    .filter((candidate) => existsSync(candidate))
    .sort((a, b) => scoreAceStepDir(b) - scoreAceStepDir(a));

  if (candidates.length > 0) {
    return candidates[0];
  }

  return path.join(repoRoot, ACESTEP_DIR_NAMES[0]);
}

export function resolveAceStepDatasetsDir(): string {
  return path.join(resolveAceStepDir(), 'datasets');
}

export function resolveAceStepUploadsDir(): string {
  return path.join(resolveAceStepDatasetsDir(), 'uploads');
}

function getLocalUrlInfo(urlString: string): { url: URL; host: string; port: number } | null {
  try {
    const url = new URL(urlString);
    if (!LOCAL_HOSTS.has(url.hostname)) {
      return null;
    }
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    const host = url.hostname === '0.0.0.0' ? '127.0.0.1' : url.hostname;
    return { url, host, port };
  } catch {
    return null;
  }
}

async function checkAceStepAvailable(urlString: string): Promise<boolean> {
  const info = getLocalUrlInfo(urlString);
  if (!info) return false;

  const origin = `${info.url.protocol}//${info.host}:${info.port}`;
  const candidates = [
    `${origin}/health`,
    `${origin}/v1/models`,
    `${origin}/`,
  ];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { signal: AbortSignal.timeout(5000) });
      if (response.ok || response.status < 500) {
        return true;
      }
    } catch {
      // Ignore and try the next candidate.
    }
  }

  return false;
}

function getLaunchCommand(aceStepDir: string, port: number): { command: string; args: string[] } | null {
  const isWindows = process.platform === 'win32';
  const bootstrapScript = path.join(repoRoot, 'server', 'scripts', 'acestep_api_bootstrap.py');
  const envPython = isWindows
    ? path.join(aceStepDir, 'env', 'Scripts', 'python.exe')
    : path.join(aceStepDir, 'env', 'bin', 'python');
  if (existsSync(envPython) && existsSync(bootstrapScript)) {
    return {
      command: envPython,
      args: [bootstrapScript, '--port', String(port)],
    };
  }

  const apiExe = isWindows
    ? path.join(aceStepDir, 'env', 'Scripts', 'acestep-api.exe')
    : path.join(aceStepDir, 'env', 'bin', 'acestep-api');
  if (existsSync(apiExe)) {
    return { command: apiExe, args: ['--port', String(port)] };
  }

  const embeddedPython = isWindows
    ? path.join(aceStepDir, 'python_embeded', 'python.exe')
    : path.join(aceStepDir, 'python_embeded', 'python');
  const embeddedScript = path.join(aceStepDir, 'acestep', 'api_server.py');
  if (existsSync(embeddedPython) && existsSync(embeddedScript)) {
    const scriptArg = isWindows ? 'acestep\\api_server.py' : 'acestep/api_server.py';
    return { command: embeddedPython, args: [scriptArg, '--port', String(port)] };
  }

  const uvBin = isWindows
    ? path.join(aceStepDir, '.uv', 'uv.exe')
    : path.join(aceStepDir, '.uv', 'uv');
  const uvCommand = existsSync(uvBin) ? uvBin : 'uv';
  return { command: uvCommand, args: ['run', 'acestep-api', '--port', String(port)] };
}

function registerCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const shutdown = () => {
    if (aceStepProcess && aceStepProcess.exitCode === null) {
      aceStepProcess.kill();
    }
  };

  process.once('exit', shutdown);
  process.once('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });
}

async function waitForAceStep(urlString: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkAceStepAvailable(urlString)) {
      return true;
    }

    if (aceStepProcess && aceStepProcess.exitCode !== null) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

export async function ensureLocalAceStepServer(urlString: string): Promise<boolean> {
  const info = getLocalUrlInfo(urlString);
  if (!info) {
    return false;
  }

  if (await checkAceStepAvailable(urlString)) {
    return true;
  }

  if (startupPromise) {
    return startupPromise;
  }

  startupPromise = (async () => {
    const aceStepDir = resolveAceStepDir();
    const launch = getLaunchCommand(aceStepDir, info.port);

    if (!launch) {
      console.warn(`[ACE-Step] No local launch command available for ${aceStepDir}`);
      return false;
    }

    if (aceStepProcess?.exitCode === null) {
      return waitForAceStep(urlString, 120_000);
    }

    console.log(`[ACE-Step] Starting local API from ${aceStepDir}`);
    try {
      aceStepProcess = spawn(launch.command, launch.args, {
        cwd: aceStepDir,
        env: {
          ...process.env,
          ACESTEP_PATH: aceStepDir,
          ACESTEP_PROJECT_ROOT: aceStepDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      console.error('[ACE-Step] Failed to spawn local API process:', error);
      aceStepProcess = null;
      return false;
    }

    registerCleanup();

    aceStepProcess.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.log(`[ACE-Step] ${text}`);
    });

    aceStepProcess.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) console.error(`[ACE-Step] ${text}`);
    });

    aceStepProcess.on('exit', (code) => {
      console.log(`[ACE-Step] Local API exited with code ${code}`);
      aceStepProcess = null;
    });

    aceStepProcess.on('error', (error) => {
      console.error('[ACE-Step] Failed to start local API:', error);
    });

    const ready = await waitForAceStep(urlString, 120_000);
    if (!ready) {
      console.warn(`[ACE-Step] Local API did not become ready at ${urlString}`);
    }
    return ready;
  })().finally(() => {
    startupPromise = null;
  });

  return startupPromise;
}
