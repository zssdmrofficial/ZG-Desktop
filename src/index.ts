// src/index.ts
import { app, BrowserWindow, ipcMain, BrowserView } from 'electron';
import * as path from 'path';
import { OfflineCacheManager } from './offlineCache';
import { targetWebsites, NAVIGATION_TIMEOUT_MS } from './shared/websites';

// ... (��L declare �M�`�Ʃw�q�O������) ...
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const HOME_VIEW_WEBPACK_ENTRY: string;

const HEADER_HEIGHT = 50;
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 800;

const offlineCacheManager = new OfflineCacheManager(() => app.getPath('userData'), targetWebsites);

let mainWindow: BrowserWindow | null = null;
let homeView: BrowserView | null = null;
let externalView: BrowserView | null = null;
let activeView: BrowserView | null = null;
let isLoadingUrl = false;

const createWindow = (): void => {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets/icon.ico')
    : path.join(__dirname, '../../src/assets/icon.ico');

  mainWindow = new BrowserWindow({
    height: DEFAULT_WINDOW_HEIGHT,
    width: DEFAULT_WINDOW_WIDTH,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  homeView = new BrowserView({
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });
  homeView.webContents.loadURL(HOME_VIEW_WEBPACK_ENTRY);
  homeView.setAutoResize({ width: true, height: true });

  externalView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
    },
  });
  externalView.setAutoResize({ width: true, height: true });

  mainWindow.once('ready-to-show', () => {
    if (homeView) {
      switchToView(homeView);
    }
  });

  let resizeTimeout: NodeJS.Timeout;
  mainWindow.on('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => resizeActiveView(), 100);
  });

  mainWindow.on('closed', () => {
    activeView = null;
    mainWindow = null;
    homeView = null;
    externalView = null;
  });
};

const switchToView = (view: BrowserView) => {
  if (!mainWindow || activeView === view) return;

  if (activeView) {
    mainWindow.removeBrowserView(activeView);
  }

  activeView = view;
  mainWindow.addBrowserView(view);
  resizeActiveView();
  view.webContents.focus();
};

const resizeActiveView = () => {
  if (!mainWindow || !activeView) return;

  const bounds = mainWindow.getContentBounds();
  const viewBounds = {
    x: 0,
    y: HEADER_HEIGHT,
    width: Math.max(bounds.width, 1),
    height: Math.max(bounds.height - HEADER_HEIGHT, 1),
  };

  activeView.setBounds(viewBounds);
};

type NavigationResult = 'online' | 'timeout';

const loadExternalUrlWithTimeout = async (url: string): Promise<NavigationResult> => {
  const targetView = externalView;
  if (!targetView) throw new Error('External view is not ready.');

  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      targetView.webContents.stop();
      resolve('timeout');
    }, NAVIGATION_TIMEOUT_MS);

    targetView.webContents
      .loadURL(url)
      .then(() => {
        if (timedOut) {
          return;
        }
        clearTimeout(timeoutId);
        resolve('online');
      })
      .catch(error => {
        if (timedOut) {
          return;
        }
        clearTimeout(timeoutId);
        reject(error);
      });
  });
};

const loadOfflineCopy = async (entryPath: string): Promise<void> => {
  const targetView = externalView;
  if (!targetView) throw new Error('External view is not ready.');
  await targetView.webContents.loadFile(entryPath);
};

ipcMain.on('navigate-to-url', async (_event, url: string) => {
  if (!mainWindow || !externalView) return;
  if (isLoadingUrl) {
    console.log('Navigation is already in progress. Ignoring new request.');
    return;
  }

  isLoadingUrl = true;
  mainWindow.webContents.send('show-loading-indicator');

  try {
    await externalView.webContents.session.clearCache();
    console.log(`Navigating to: ${url}`);

    let usedOfflineCopy = false;
    const fallbackToOffline = async (reason: string): Promise<void> => {
      const offlineEntry = await offlineCacheManager.getOfflineEntry(url);
      if (!offlineEntry) {
        throw new Error(`Offline cache unavailable for ${url} (${reason}).`);
      }
      usedOfflineCopy = true;
      await loadOfflineCopy(offlineEntry);
      console.warn(`[Navigation] Falling back to offline cache for ${url} (${reason})`);
    };

    let navigationResult: NavigationResult | null = null;
    try {
      navigationResult = await loadExternalUrlWithTimeout(url);
    } catch (error) {
      const errorDetails = error instanceof Error ? error.message : String(error);
      await fallbackToOffline(`encountered an error: ${errorDetails}`);
    }

    if (navigationResult === 'timeout') {
      await fallbackToOffline(`timed out after ${NAVIGATION_TIMEOUT_MS / 1000} seconds`);
    }

    switchToView(externalView);
    mainWindow.webContents.send('show-back-button');
    if (usedOfflineCopy) {
      mainWindow.webContents.send('offline-cache-mode');
    } else {
      mainWindow.webContents.send('online-mode');
    }
  } catch (error) {
    console.error(`Failed to load URL "${url}":`, error);
  } finally {
    isLoadingUrl = false;
    mainWindow?.webContents.send('hide-loading-indicator');
  }
});

ipcMain.on('go-back-home', () => {
  if (!mainWindow || !homeView || !externalView) return;
  if (externalView.webContents.isLoading()) {
    externalView.webContents.stop();
  }
  switchToView(homeView);
  mainWindow.webContents.send('online-mode');
  mainWindow.webContents.send('hide-back-button');
  mainWindow.webContents.send('hide-loading-indicator');
});

ipcMain.handle('refresh-offline-cache', async () => offlineCacheManager.refreshAllSites());

const bootstrap = async () => {
  await offlineCacheManager.initializeFromDisk();
  createWindow();
  void offlineCacheManager.refreshAllSites();
};

app
  .whenReady()
  .then(bootstrap)
  .catch(error => {
    console.error('Failed to bootstrap application', error);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
