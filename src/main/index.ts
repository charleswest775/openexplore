import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import * as path from 'path';
import { SidecarManager } from './sidecar';
import { createMenu } from './menu';
import Store from 'electron-store';

const store = new Store({
  schema: {
    recentBackups: {
      type: 'array',
      default: [],
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          deviceName: { type: 'string' },
          date: { type: 'string' },
          model: { type: 'string' },
        },
      },
    },
    windowBounds: {
      type: 'object',
      default: { width: 1400, height: 900 },
    },
  },
});

let mainWindow: BrowserWindow | null = null;
let sidecar: SidecarManager | null = null;

function createWindow() {
  const bounds = store.get('windowBounds') as { width: number; height: number; x?: number; y?: number };

  mainWindow = new BrowserWindow({
    width: bounds.width || 1400,
    height: bounds.height || 900,
    x: bounds.x,
    y: bounds.y,
    minWidth: 900,
    minHeight: 600,
    title: 'OpenExplore',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // In development, load from Vite dev server
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('resize', () => {
    if (mainWindow) {
      const [width, height] = mainWindow.getSize();
      const [x, y] = mainWindow.getPosition();
      store.set('windowBounds', { width, height, x, y });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  Menu.setApplicationMenu(createMenu(mainWindow));
}

function setupSidecar() {
  sidecar = new SidecarManager();
  sidecar.start();
}

function setupIPC() {
  // Bridge: renderer → main → sidecar (JSON-RPC)
  // Returns { result } or { error } to avoid Electron's noisy unhandled rejection logging
  ipcMain.handle('rpc', async (_event, method: string, params: Record<string, unknown>) => {
    if (!sidecar) {
      return { error: 'Sidecar not running' };
    }
    try {
      const result = await sidecar.call(method, params);
      return { result };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { error: msg };
    }
  });

  // Native folder picker
  ipcMain.handle('dialog:openFolder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select iPhone Backup Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Save dialog for exports
  ipcMain.handle('dialog:saveFile', async (_event, defaultPath: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath,
      title: 'Export',
    });
    if (result.canceled) return null;
    return result.filePath;
  });

  // Export directory picker
  ipcMain.handle('dialog:exportDir', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Export Directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Recent backups
  ipcMain.handle('store:getRecentBackups', () => {
    return store.get('recentBackups', []);
  });

  ipcMain.handle('store:addRecentBackup', (_event, backup: { path: string; deviceName: string; date: string; model: string }) => {
    const recent = store.get('recentBackups', []) as Array<{ path: string }>;
    const filtered = recent.filter((b) => b.path !== backup.path);
    filtered.unshift(backup);
    store.set('recentBackups', filtered.slice(0, 10));
  });

  // Get default backup locations
  ipcMain.handle('getDefaultBackupPaths', () => {
    const home = app.getPath('home');
    const platform = process.platform;

    if (platform === 'darwin') {
      return [path.join(home, 'Library', 'Application Support', 'MobileSync', 'Backup')];
    } else if (platform === 'win32') {
      const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      return [
        path.join(appdata, 'Apple Computer', 'MobileSync', 'Backup'),
        path.join(appdata, 'Apple', 'MobileSync', 'Backup'),
      ];
    }
    return [];
  });

  // Sidecar status
  ipcMain.handle('sidecar:status', () => {
    return sidecar?.isRunning() ?? false;
  });

  ipcMain.handle('sidecar:restart', async () => {
    if (sidecar) {
      sidecar.stop();
    }
    sidecar = new SidecarManager();
    sidecar.start();
    return true;
  });
}

app.whenReady().then(() => {
  setupSidecar();
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  sidecar?.stop();
});
