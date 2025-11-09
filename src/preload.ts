// src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  navigate: (url: string) => ipcRenderer.send('navigate-to-url', url),
  goHome: () => ipcRenderer.send('go-back-home'),
  refreshOfflineCache: () => ipcRenderer.invoke('refresh-offline-cache'),
  onShowBackButton: (callback: () => void) => ipcRenderer.on('show-back-button', callback),
  onHideBackButton: (callback: () => void) => ipcRenderer.on('hide-back-button', callback),
  onShowLoadingIndicator: (callback: () => void) => ipcRenderer.on('show-loading-indicator', callback),
  onHideLoadingIndicator: (callback: () => void) => ipcRenderer.on('hide-loading-indicator', callback),
  onOfflineMode: (callback: () => void) => ipcRenderer.on('offline-cache-mode', callback),
  onOnlineMode: (callback: () => void) => ipcRenderer.on('online-mode', callback),
});
