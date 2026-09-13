import { contextBridge, ipcRenderer } from 'electron';

/**
 * All IPC calls that the renderer (React app + setup window) may make.
 * Exposed as `window.electronAPI`.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ── Setup ────────────────────────────────────────────────────────────────
  getSetupStatus: (): Promise<{
    setupComplete: boolean;
    downloadedPackages: string[];
    pythonReady: boolean;
  }> => ipcRenderer.invoke('get-setup-status'),

  startPythonSetup: (): Promise<void> => ipcRenderer.invoke('start-python-setup'),

  startModelDownload: (packageIds: string[]): Promise<void> =>
    ipcRenderer.invoke('start-model-download', packageIds),

  skipModel: (packageId: string): Promise<void> =>
    ipcRenderer.invoke('skip-model', packageId),

  openMainApp: (): Promise<void> => ipcRenderer.invoke('open-main-app'),

  // ── Progress listeners ──────────────────────────────────────────────────
  onDownloadProgress: (cb: (event: any) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on('download-progress', listener);
    return () => ipcRenderer.removeListener('download-progress', listener);
  },

  onPythonStatus: (cb: (event: any) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: any) => cb(data);
    ipcRenderer.on('python-status', listener);
    return () => ipcRenderer.removeListener('python-status', listener);
  },

  onSetupComplete: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.once('setup-complete', listener);
    return () => ipcRenderer.removeListener('setup-complete', listener);
  },

  // ── App info ────────────────────────────────────────────────────────────
  platform: process.platform as NodeJS.Platform,
  appVersion: process.env.APP_VERSION ?? '1.0.0',
});
