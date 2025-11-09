// src/index.ts
import { app, BrowserWindow, ipcMain, BrowserView, protocol } from 'electron';
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
const OFFLINE_PROTOCOL = 'app-offline';

const offlineCacheManager = new OfflineCacheManager(() => app.getPath('userData'), targetWebsites);

protocol.registerSchemesAsPrivileged([
  {
    scheme: OFFLINE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

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

const loadOfflineCopy = async (entryPath: string, originalUrl: string): Promise<void> => {
  const targetView = externalView;
  if (!targetView) throw new Error('External view is not ready.');

  const offlineUrl = buildOfflineUrl(entryPath, originalUrl);
  await targetView.webContents.loadURL(offlineUrl);
};

const buildOfflineUrl = (entryPath: string, originalUrl: string): string => {
  const parsedUrl = new URL(originalUrl);
  const hash = parsedUrl.hash ? parsedUrl.hash.replace(/^#/, '') : undefined;
  const siteRoot = offlineCacheManager.getSiteRootForOrigin(parsedUrl.origin);
  if (!siteRoot) {
    throw new Error(`Offline cache root is unavailable for origin ${parsedUrl.origin}.`);
  }

  const relativePath = path.relative(siteRoot, entryPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Offline entry ${entryPath} is outside the expected cache root ${siteRoot}.`);
  }

  const encodedPath = relativePath
    .split(path.sep)
    .map(segment => encodeURIComponent(segment))
    .join('/');

  const url = `${OFFLINE_PROTOCOL}://${parsedUrl.host}/${encodedPath}`;
  return hash ? `${url}#${hash}` : url;
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
      await loadOfflineCopy(offlineEntry, url);
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
  await registerOfflineProtocol();
  createWindow();
  void offlineCacheManager.refreshAllSites();
};

const registerOfflineProtocol = async (): Promise<void> => {
  protocol.registerFileProtocol(OFFLINE_PROTOCOL, (request, callback) => {
    try {
      const requestUrl = new URL(request.url);
      const host = requestUrl.host;
      const siteRoot = offlineCacheManager.getSiteRootForHost(host);
      if (!siteRoot) {
        console.warn(`[OfflineProtocol] Host "${host}" is not recognized.`);
        callback({ error: -6 });
        return;
      }

      const decodedPath = decodeURIComponent(requestUrl.pathname);
      const relativePath = decodedPath.replace(/^\/+/, '').replace(/\//g, path.sep);
      const resolvedPath = path.resolve(siteRoot, relativePath);
      const normalizedRoot = path.resolve(siteRoot);
      const normalizedResolvedPath = path.resolve(resolvedPath);
      const isInsideRoot =
        normalizedResolvedPath === normalizedRoot ||
        normalizedResolvedPath.startsWith(`${normalizedRoot}${path.sep}`);

      if (!isInsideRoot) {
        console.warn(`[OfflineProtocol] Blocked path traversal attempt for host "${host}".`);
        callback({ error: -10 });
        return;
      }

      callback(normalizedResolvedPath);
    } catch (error) {
      console.error('[OfflineProtocol] Failed to process request:', error);
      callback({ error: -2 });
    }
  });
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
