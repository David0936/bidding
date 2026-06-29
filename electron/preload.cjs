const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyBiddingDesktop', {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-updates'),
});
