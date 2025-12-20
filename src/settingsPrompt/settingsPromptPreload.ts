import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsPromptAPI', {
  getData: () => ipcRenderer.invoke('settings-prompt:get-data'),
  close: () => ipcRenderer.invoke('settings-prompt:close'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  setAutoUpdateEnabled: (enabled: boolean) => ipcRenderer.invoke('settings-prompt:set-auto-update', enabled),
});
