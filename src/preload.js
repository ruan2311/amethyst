// Ponte segura entre a interface e o processo principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('amethyst', {
  getLibrary: () => ipcRenderer.invoke('lib:get'),
  addFolder: () => ipcRenderer.invoke('lib:addFolder'),
  removeFolder: (folder) => ipcRenderer.invoke('lib:removeFolder', folder),
  rescan: () => ipcRenderer.invoke('lib:rescan'),
  updateSong: (id, patch) => ipcRenderer.invoke('lib:updateSong', id, patch),
  setArtistGenre: (artist, genre) => ipcRenderer.invoke('lib:setArtistGenre', artist, genre),
  played: (id) => ipcRenderer.invoke('lib:played', id),
  addHistory: (entry) => ipcRenderer.invoke('lib:addHistory', entry),
  clearHistory: () => ipcRenderer.invoke('lib:clearHistory'),
  saveSettings: (s) => ipcRenderer.invoke('lib:saveSettings', s),
  fetchGenres: () => ipcRenderer.invoke('lib:fetchGenres'),
  saveThumb: (id, dataUrl, duration) => ipcRenderer.invoke('lib:saveThumb', id, dataUrl, duration),
  getAnalysis: (id) => ipcRenderer.invoke('lib:getAnalysis', id),
  saveAnalysis: (id, data) => ipcRenderer.invoke('lib:saveAnalysis', id, data),
  getLyrics: (id) => ipcRenderer.invoke('lyrics:get', id),
  saveLyrics: (id, data) => ipcRenderer.invoke('lyrics:save', id, data),
  fetchLyrics: (id) => ipcRenderer.invoke('lyrics:fetch', id),
  showFile: (id) => ipcRenderer.invoke('app:showFile', id),
  version: () => ipcRenderer.invoke('app:version'),
  onProgress: (cb) => ipcRenderer.on('lib:progress', (_, p) => cb(p)),
  tvOpen: () => ipcRenderer.invoke('tv:open'),
  tvClose: () => ipcRenderer.invoke('tv:close'),
  tvStatus: () => ipcRenderer.invoke('tv:status'),
  tvDisplays: () => ipcRenderer.invoke('tv:displays'),
  tvSetDisplay: (id) => ipcRenderer.invoke('tv:setDisplay', id),
  tvFullscreen: () => ipcRenderer.send('tv:fullscreen'),
  tvCmd: (cmd) => ipcRenderer.send('tv:cmd', cmd),
  onTvEvent: (cb) => ipcRenderer.on('tv:event', (_, e) => cb(e)),
  onTvStatus: (cb) => ipcRenderer.on('tv:status', (_, s) => cb(s))
});
