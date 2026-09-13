import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';
import log from 'electron-log';
import { ModelDownloader } from './downloader';
import { PythonEnvSetup } from './python-env';
import { ProcessManager } from './process-manager';
import { MODEL_PACKAGES } from './models';

// ── Store schema ─────────────────────────────────────────────────────────────
interface AppStore {
  setupComplete: boolean;
  downloadedPackages: string[];
  pythonReady: boolean;
  skippedPackages: string[];
}

const store = new Store<AppStore>({
  defaults: {
    setupComplete: false,
    downloadedPackages: [],
    pythonReady: false,
    skippedPackages: [],
  },
});

// ── Paths ─────────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';

/** Root of the repo / installed app resources. */
function getAppRoot(): string {
  if (isDev) return path.join(__dirname, '..');
  // In production, resources/ lives at process.resourcesPath
  return process.resourcesPath;
}

function getAceStepDir(): string {
  // In dev: repo/Ace-Step1.5 — in prod: %APPDATA%/OTunes/Ace-Step1.5
  if (isDev) return path.join(getAppRoot(), 'Ace-Step1.5');
  return path.join(app.getPath('userData'), 'Ace-Step1.5');
}

function getServerDir(): string {
  if (isDev) return path.join(getAppRoot(), 'server');
  return path.join(process.resourcesPath, 'server');
}

// ── Windows ───────────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;

const processManager = new ProcessManager((source, line) => {
  log.info(`[${source}] ${line}`);
  mainWindow?.webContents.send('backend-log', { source, line });
});

function createSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 860,
    height: 620,
    resizable: false,
    center: true,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  if (isDev) setupWindow.webContents.openDevTools({ mode: 'detach' });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle('get-setup-status', () => ({
  setupComplete: store.get('setupComplete'),
  downloadedPackages: store.get('downloadedPackages'),
  pythonReady: store.get('pythonReady'),
  skippedPackages: store.get('skippedPackages'),
  packages: MODEL_PACKAGES.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    required: p.required,
    estimatedSize: p.estimatedSize,
    downloaded: store.get('downloadedPackages').includes(p.id),
  })),
}));

ipcMain.handle('skip-model', (_e, packageId: string) => {
  const skipped = store.get('skippedPackages');
  if (!skipped.includes(packageId)) {
    store.set('skippedPackages', [...skipped, packageId]);
  }
});

ipcMain.handle('start-python-setup', async (event) => {
  const aceStepDir = getAceStepDir();
  const setup = new PythonEnvSetup(aceStepDir, (msg) => {
    event.sender.send('python-status', msg);
    log.info('[python-setup]', msg.step);
  });

  try {
    await setup.setup();
    store.set('pythonReady', true);
    return { success: true };
  } catch (err) {
    log.error('[python-setup] error:', err);
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle('start-model-download', async (event, packageIds: string[]) => {
  const aceStepDir = getAceStepDir();
  const skipped = store.get('skippedPackages');

  const downloader = new ModelDownloader((progress) => {
    event.sender.send('download-progress', progress);
  });

  // Mark packages not in packageIds as skipped
  MODEL_PACKAGES.forEach((p) => {
    if (!packageIds.includes(p.id) && !p.required) {
      downloader.skip(p.id);
    }
  });
  skipped.forEach((id) => downloader.skip(id));

  try {
    await downloader.downloadAll(aceStepDir);
    const downloaded = [
      ...store.get('downloadedPackages'),
      ...downloader.getDownloadedPackages(),
    ];
    store.set('downloadedPackages', [...new Set(downloaded)]);
    return { success: true };
  } catch (err) {
    log.error('[downloader] error:', err);
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.handle('open-main-app', async () => {
  store.set('setupComplete', true);

  const aceStepDir = getAceStepDir();
  const serverDir = getServerDir();

  if (setupWindow) {
    setupWindow.close();
    setupWindow = null;
  }

  createMainWindow();

  // Start backend services in the background
  processManager.startBackend(serverDir).catch((e) => log.error('Backend start error:', e));
  processManager.startAceStepAPI(aceStepDir).catch((e) => log.error('ACE-Step start error:', e));
});

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  log.info('App starting. setup complete:', store.get('setupComplete'));

  if (!store.get('setupComplete')) {
    createSetupWindow();
  } else {
    createMainWindow();
    const aceStepDir = getAceStepDir();
    const serverDir = getServerDir();
    processManager.startBackend(serverDir).catch((e) => log.error('Backend:', e));
    processManager.startAceStepAPI(aceStepDir).catch((e) => log.error('ACE-Step:', e));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  processManager.killAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  processManager.killAll();
});
