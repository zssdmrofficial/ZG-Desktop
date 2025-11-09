// src/index.ts
import { app, BrowserWindow, ipcMain, BrowserView } from 'electron';

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
let isLoadingUrl = false; // 【新增】狀態鎖，防止重複導航

// ... (createWindow, switchToView, getZoomFactor, resizeActiveView 函式保持不變) ...

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    height: DEFAULT_WINDOW_HEIGHT,
    width: DEFAULT_WINDOW_WIDTH,
    autoHideMenuBar: true,
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

// 【主要修改處】
ipcMain.on('navigate-to-url', async (event, url: string) => {
  // 如果沒有主視窗，或正在載入中，則忽略這次的請求
  if (!mainWindow || isLoadingUrl) {
    if (isLoadingUrl) {
      console.log('Navigation is already in progress. Ignoring new request.');
    }
    return;
  }

  isLoadingUrl = true; // 上鎖
  mainWindow.webContents.send('show-loading-indicator');

  try {
    // 在載入新網址前，清除 externalView 的快取
    await externalView.webContents.session.clearCache();
    console.log(`Cache cleared. Navigating to: ${url}`);
    
    // 執行載入操作
    await externalView.webContents.loadURL(url);
    
    // 成功載入後再切換視圖和顯示按鈕
    switchToView(externalView);
    mainWindow.webContents.send('show-back-button');

  } catch (error) {
    // 捕捉任何錯誤，特別是 ERR_ABORTED
    // 這裡我們只在控制台記錄它，而不是讓應用程式崩潰
    if (error.code === 'ERR_ABORTED') {
      console.log('Navigation was aborted.');
    } else {
      console.error(`Failed to load URL "${url}":`, error);
    }
  } finally {
    // 無論成功或失敗，最後都要解鎖
    isLoadingUrl = false;
    if (mainWindow) {
      mainWindow.webContents.send('hide-loading-indicator');
    }
  }
});

ipcMain.on('go-back-home', () => {
  if (!mainWindow) return;
  // 如果正在載入外部頁面時點擊返回，中止它
  if (externalView.webContents.isLoading()) {
    externalView.webContents.stop();
  }
  switchToView(homeView);
  mainWindow.webContents.send('hide-back-button');
  mainWindow.webContents.send('hide-loading-indicator'); // 確保返回首頁後隱藏載入狀態
});

// ... (app event listeners 保持不變) ...
app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
