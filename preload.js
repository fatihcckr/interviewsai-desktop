const { contextBridge, ipcRenderer } = require('electron');
const { remote } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  onDeepLink: (callback) => ipcRenderer.on('deep-link', (_, data) => callback(data)),
  sessionId: null,
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  }
});