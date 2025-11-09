// src/index.ts
import { app, BrowserWindow, ipcMain, BrowserView } from 'electron';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
// 【新增】宣告 home.html 的路徑變數
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

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    height: DEFAULT_WINDOW_HEIGHT,
    width: DEFAULT_WINDOW_WIDTH,
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
  // 【修正】使用 Webpack 提供的正確路徑來載入 home.html
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
    // 使用 clearTimeout 來防止在快速連續觸發時執行過多次 (debounce)
    clearTimeout(resizeTimeout);
    // 將 resizeActiveView 的呼叫放入 setTimeout 中
    resizeTimeout = setTimeout(() => resizeActiveView(), 100); // 延遲 100 毫秒通常足夠
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

const getZoomFactor = (width: number, height: number): number => {
  const widthScale = width / BASE_CONTENT_WIDTH;
  const heightScale = height / BASE_CONTENT_HEIGHT;
  const zoomFactor = Math.min(widthScale, heightScale);

  // Clamp to a safe range so repeated resizing never overflows nor shrinks to zero.
  return Math.min(Math.max(zoomFactor, MIN_ZOOM_FACTOR), MAX_ZOOM_FACTOR);
};

const resizeActiveView = () => {
  if (!mainWindow || !activeView) return;
  
  // 獲取主視窗的內容區域尺寸
  const bounds = mainWindow.getContentBounds();
  
  // 設定 BrowserView 的邊界，使其填滿扣除頭部高度後的剩餘空間
  const viewBounds = {
    x: 0,
    y: HEADER_HEIGHT,
    width: Math.max(bounds.width, 1), // 確保寬度至少為 1
    height: Math.max(bounds.height - HEADER_HEIGHT, 1), // 確保高度至少為 1
  };

  // 只需設定 BrowserView 的邊界即可
  // 它會自動改變大小，內部的網頁內容會根據新尺寸自然重排
  activeView.setBounds(viewBounds);
};

ipcMain.on('navigate-to-url', (event, url: string) => {
  if (!mainWindow) return;
  externalView.webContents.loadURL(url);
  switchToView(externalView);
  mainWindow.webContents.send('show-back-button');
});

ipcMain.on('go-back-home', () => {
  if (!mainWindow) return;
  switchToView(homeView);
  mainWindow.webContents.send('hide-back-button');
});

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
