// src/index.ts
import { app, BrowserWindow, ipcMain, BrowserView } from 'electron';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
// 【新增】宣告 home.html 的路徑變數
declare const HOME_VIEW_WEBPACK_ENTRY: string;


const HEADER_HEIGHT = 50;
let mainWindow: BrowserWindow;
let homeView: BrowserView;
let externalView: BrowserView;
let activeView: BrowserView | null = null;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    height: 800,
    width: 1280,
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
  
  mainWindow.on('resize', () => resizeActiveView());
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
  const bounds = mainWindow.getBounds();
  const viewBounds = { x: 0, y: HEADER_HEIGHT, width: bounds.width, height: bounds.height - HEADER_HEIGHT };
  
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
