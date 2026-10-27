// Ponte da janela da TV: recebe comandos do notebook e devolve o estado do vídeo.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tvBridge', {
  onCmd: (cb) => ipcRenderer.on('tv:cmd', (_, c) => cb(c)),
  emit: (ev) => ipcRenderer.send('tv:event', ev),
  toggleFullscreen: () => ipcRenderer.send('tv:fullscreen')
});
