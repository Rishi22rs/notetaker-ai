const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onInteraction(callback) {
    ipcRenderer.on('overlay:interactive', (_event, enabled) => callback(enabled));
  },
  onStatus(callback) {
    ipcRenderer.on('browser:status', (_event, text) => callback(text));
  }
});
