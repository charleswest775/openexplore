import { contextBridge, ipcRenderer } from 'electron';

const api = {
  rpc: async (method: string, params: Record<string, unknown> = {}) => {
    const response = await ipcRenderer.invoke('rpc', method, params);
    if (response && response.error) {
      throw new Error(response.error);
    }
    return response.result;
  },

  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  saveFile: (defaultPath: string) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  exportDir: () => ipcRenderer.invoke('dialog:exportDir'),

  getRecentBackups: () => ipcRenderer.invoke('store:getRecentBackups'),
  addRecentBackup: (backup: { path: string; deviceName: string; date: string; model: string }) =>
    ipcRenderer.invoke('store:addRecentBackup', backup),

  getDefaultBackupPaths: () => ipcRenderer.invoke('getDefaultBackupPaths'),

  sidecarStatus: () => ipcRenderer.invoke('sidecar:status'),
  sidecarRestart: () => ipcRenderer.invoke('sidecar:restart'),

  onMenuEvent: (event: string, callback: () => void) => {
    ipcRenderer.on(`menu:${event}`, callback);
    return () => ipcRenderer.removeListener(`menu:${event}`, callback);
  },

  platform: process.platform,
};

contextBridge.exposeInMainWorld('api', api);
