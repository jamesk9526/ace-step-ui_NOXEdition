import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';

type LogCallback = (source: 'backend' | 'acestep', line: string) => void;

/** Waits until a TCP port is accepting connections, up to timeoutMs. */
function waitForPort(port: number, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      const sock = net.createConnection({ port, host: '127.0.0.1' });
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Port ${port} not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });
    };
    tryConnect();
  });
}

export class ProcessManager {
  private backendProc: ChildProcess | null = null;
  private aceStepProc: ChildProcess | null = null;
  private onLog: LogCallback;

  constructor(onLog: LogCallback = () => {}) {
    this.onLog = onLog;
  }

  /**
   * Starts the Node.js Express backend.
   * @param serverDir Absolute path to the `server/` folder.
   */
  async startBackend(serverDir: string): Promise<void> {
    const isBuilt = fs.existsSync(path.join(serverDir, 'dist', 'index.js'));
    const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    if (isBuilt) {
      this.backendProc = spawn('node', ['dist/index.js'], { cwd: serverDir, env: process.env });
    } else {
      this.backendProc = spawn(cmd, ['tsx', 'src/index.ts'], { cwd: serverDir, env: process.env });
    }

    this.backendProc.stdout?.on('data', (d: Buffer) =>
      this.onLog('backend', d.toString().trim()));
    this.backendProc.stderr?.on('data', (d: Buffer) =>
      this.onLog('backend', d.toString().trim()));

    this.backendProc.on('exit', (code) => {
      this.onLog('backend', `Backend exited with code ${code}`);
    });

    await waitForPort(3001).catch(() => {
      this.onLog('backend', 'Backend did not start in time — continuing anyway.');
    });
  }

  /**
   * Starts the ACE-Step Gradio API server.
   * @param aceStepDir Absolute path to the Ace-Step1.5 folder.
   */
  async startAceStepAPI(aceStepDir: string): Promise<void> {
    const env = { ...process.env, ACESTEP_PATH: aceStepDir };

    // Prefer python_embeded (ComfyUI-style portable) if present, otherwise use the venv
    const embeddedPython = path.join(aceStepDir, 'python_embeded', 'python.exe');
    let command: string;
    let args: string[];

    if (process.platform === 'win32' && fs.existsSync(embeddedPython)) {
      command = embeddedPython;
      args = ['acestep\\api_server.py', '--port', '8001'];
    } else {
      // Use uv run which respects the local venv
      const uvBin = process.platform === 'win32'
        ? path.join(aceStepDir, '.uv', 'uv.exe')
        : path.join(aceStepDir, '.uv', 'uv');

      const uvCmd = fs.existsSync(uvBin) ? uvBin : 'uv';
      command = uvCmd;
      args = ['run', 'acestep-api', '--port', '8001'];
    }

    this.aceStepProc = spawn(command, args, { cwd: aceStepDir, env });
    this.aceStepProc.stdout?.on('data', (d: Buffer) =>
      this.onLog('acestep', d.toString().trim()));
    this.aceStepProc.stderr?.on('data', (d: Buffer) =>
      this.onLog('acestep', d.toString().trim()));

    this.aceStepProc.on('exit', (code) => {
      this.onLog('acestep', `ACE-Step API exited with code ${code}`);
    });

    await waitForPort(8001, 120_000).catch(() => {
      this.onLog('acestep', 'ACE-Step API not ready in 120s — continuing anyway.');
    });
  }

  killAll(): void {
    [this.backendProc, this.aceStepProc].forEach((proc) => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
        // Force-kill after 3s
        setTimeout(() => { if (proc && !proc.killed) proc.kill('SIGKILL'); }, 3000);
      }
    });
    this.backendProc = null;
    this.aceStepProc = null;
  }
}
