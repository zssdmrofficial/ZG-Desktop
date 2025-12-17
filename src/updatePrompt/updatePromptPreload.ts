import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('updatePromptAPI', {
  getData: () => ipcRenderer.invoke('update-prompt:get-data'),
  close: () => ipcRenderer.invoke('update-prompt:close'),
  startDownload: () => ipcRenderer.invoke('update-prompt:start-download'),
  install: () => ipcRenderer.invoke('update-prompt:install'),
  openExternal: (url: string) => ipcRenderer.invoke('update-prompt:open-external', url),
  onDownloadProgress: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on('update-prompt:download-progress', listener);
    return () => ipcRenderer.removeListener('update-prompt:download-progress', listener);
  },
  onDownloadError: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on('update-prompt:download-error', listener);
    return () => ipcRenderer.removeListener('update-prompt:download-error', listener);
  },
  onDownloadComplete: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on('update-prompt:download-complete', listener);
    return () => ipcRenderer.removeListener('update-prompt:download-complete', listener);
  },
  onInstalling: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on('update-prompt:installing', listener);
    return () => ipcRenderer.removeListener('update-prompt:installing', listener);
  },
  onInstallError: (callback: (payload: unknown) => void) => {
    const listener = (_event: unknown, payload: unknown) => callback(payload);
    ipcRenderer.on('update-prompt:install-error', listener);
    return () => ipcRenderer.removeListener('update-prompt:install-error', listener);
  },
});

