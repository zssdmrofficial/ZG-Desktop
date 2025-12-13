import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('updatePromptAPI', {
  getData: () => ipcRenderer.invoke('update-prompt:get-data'),
  action: (action: 'update' | 'close') => ipcRenderer.invoke('update-prompt:action', action),
  openExternal: (url: string) => ipcRenderer.invoke('update-prompt:open-external', url),
});

