// src/index.ts
import { app, BrowserWindow, ipcMain, BrowserView } from 'electron';
import * as path from 'path';

// ... (其他 declare 和常數定義保持不變) ...
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const HOME_VIEW_WEBPACK_ENTRY: string;

const HEADER_HEIGHT = 50;
const DEFAULT_WINDOW_WIDTH = 1280;
const DEFAULT_WINDOW_HEIGHT = 800;
const BASE_CONTENT_WIDTH = DEFAULT_WINDOW_WIDTH;
const BASE_CONTENT_HEIGHT = DEFAULT_WINDOW_HEIGHT - HEADER_HEIGHT;
const MIN_ZOOM_FACTOR = 0.25;
const MAX_ZOOM_FACTOR = 4;

let mainWindow: BrowserWindow;
let homeView: BrowserView;
let externalView: BrowserView;
let activeView: BrowserView | null = null;
let isLoadingUrl = false;

// ... (switchToView, resizeActiveView 函式保持不變) ...

const createWindow = (): void => {
  // 【主要修改處】
  // 根據應用程式是否被打包來決定圖示的正確路徑
  // 這是為了解決 Webpack 環境下 __dirname 指向 .webpack/main 的問題
  const iconPath = app.isPackaged
    // 在正式環境中，資源會被打包到 resources 資料夾下
    ? path.join(process.resourcesPath, 'assets/icon.ico')
    // 在開發環境中，我們需要從 .webpack/main 目錄回溯到專案根目錄，再找到 src/assets
    : path.join(__dirname, '../../src/assets/icon.ico');

  mainWindow = new BrowserWindow({
    height: DEFAULT_WINDOW_HEIGHT,
    width: DEFAULT_WINDOW_WIDTH,
    autoHideMenuBar: true,
    icon: iconPath, // 使用上面動態決定的路徑
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
    switchToView(homeView);
  });
  
  let resizeTimeout: NodeJS.Timeout;
  mainWindow.on('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => resizeActiveView(), 100);
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


ipcMain.on('navigate-to-url', async (event, url: string) => {
  if (!mainWindow || isLoadingUrl) {
    if (isLoadingUrl) {
      console.log('Navigation is already in progress. Ignoring new request.');
    }
    return;
  }

  isLoadingUrl = true;
  mainWindow.webContents.send('show-loading-indicator');

  try {
    await externalView.webContents.session.clearCache();
    console.log(`Cache cleared. Navigating to: ${url}`);
    
    await externalView.webContents.loadURL(url);
    
    switchToView(externalView);
    mainWindow.webContents.send('show-back-button');

  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const code = (error as { code?: string }).code;
      if (code === 'ERR_ABORTED') {
        console.log('Navigation was aborted.');
      } else {
        console.error(`Failed to load URL "${url}":`, error);
      }
    } else {
      console.error(`Failed to load URL "${url}":`, error);
    }
  }
});

ipcMain.on('go-back-home', () => {
  if (!mainWindow) return;
  if (externalView.webContents.isLoading()) {
    externalView.webContents.stop();
  }
  switchToView(homeView);
  mainWindow.webContents.send('hide-back-button');
  mainWindow.webContents.send('hide-loading-indicator');
});


app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});