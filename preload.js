'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  scan: () => ipcRenderer.invoke('library:scan'),
  addFolder: () => ipcRenderer.invoke('library:add-folder'),
  removeFolder: (folder) => ipcRenderer.invoke('library:remove-folder', folder),
  updateTracks: (payload) => ipcRenderer.invoke('tracks:update', payload),
  pickCover: () => ipcRenderer.invoke('cover:pick'),
  saveSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  getThemeSync: () => { try { return ipcRenderer.sendSync('theme:get-sync'); } catch (_) { return 'dark'; } },
  getLangSync: () => { try { return ipcRenderer.sendSync('lang:get-sync'); } catch (_) { return 'id'; } },
  reveal: (file) => ipcRenderer.invoke('shell:reveal', file),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  winMinimize: () => ipcRenderer.invoke('win:minimize'),
  winClose: () => ipcRenderer.invoke('win:close'),
  abStatus: () => ipcRenderer.invoke('ab:status'),
  abPresets: () => ipcRenderer.invoke('ab:presets'),
  abPrepare: (payload) => ipcRenderer.invoke('ab:prepare', payload),
  abCancel: () => ipcRenderer.invoke('ab:cancel'),
  abClear: () => ipcRenderer.invoke('ab:clear'),
  onAbProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('ab:progress', h);
    return () => ipcRenderer.removeListener('ab:progress', h);
  },

  // YouTube Downloader & Konversi Audio
  ytdlStatus: () => ipcRenderer.invoke('ytdl:status'),
  ytdlInfo: (url) => ipcRenderer.invoke('ytdl:info', url),
  ytdlDownload: (payload) => ipcRenderer.invoke('ytdl:download', payload),
  ytdlCancel: () => ipcRenderer.invoke('ytdl:cancel'),
  ytdlDefaultFolder: () => ipcRenderer.invoke('ytdl:default-folder'),
  onYtdlProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('ytdl:progress', h);
    return () => ipcRenderer.removeListener('ytdl:progress', h);
  },
  // Google Drive Cloud Streaming & Cache
  gdriveStatus: () => ipcRenderer.invoke('gdrive:status'),
  gdriveSaveUrl: (url) => ipcRenderer.invoke('gdrive:save-url', url),
  gdriveAddUrl: (url) => ipcRenderer.invoke('gdrive:add-url', url),
  gdriveRemoveUrl: (url) => ipcRenderer.invoke('gdrive:remove-url', url),
  gdriveSetMaxCache: (max) => ipcRenderer.invoke('gdrive:set-max-cache', max),
  gdriveSync: (url) => ipcRenderer.invoke('gdrive:sync', url),
  gdriveClearCache: () => ipcRenderer.invoke('gdrive:clear-cache'),
  gdriveOpenFolder: (type) => ipcRenderer.invoke('gdrive:open-folder', type),
  gdrivePrefetch: (fileId, path) => ipcRenderer.invoke('gdrive:prefetch', { fileId, path }),
  gdriveTrackStatus: (fileId) => ipcRenderer.invoke('gdrive:track-status', fileId),
  onGdriveProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('gdrive:progress', h);
    return () => ipcRenderer.removeListener('gdrive:progress', h);
  },

  mediaUrl: (file) => 'media://local/?p=' + encodeURIComponent(file),
  onScanProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('scan:progress', h);
    return () => ipcRenderer.removeListener('scan:progress', h);
  },

  // Lirik
  getLyrics: (payload) => ipcRenderer.invoke('lyrics:get', payload),
  saveManualLyrics: (payload) => ipcRenderer.invoke('lyrics:save-manual', payload),

  // Playlist
  playlists: () => ipcRenderer.invoke('playlist:list'),
  createPlaylist: (name) => ipcRenderer.invoke('playlist:create', { name }),
  renamePlaylist: (id, name) => ipcRenderer.invoke('playlist:rename', { id, name }),
  deletePlaylist: (id) => ipcRenderer.invoke('playlist:delete', id),
  addToPlaylist: (id, ids) => ipcRenderer.invoke('playlist:add-tracks', { id, ids }),
  removeFromPlaylist: (id, trackId) => ipcRenderer.invoke('playlist:remove-track', { id, trackId }),
  setPlaylistCover: (id) => ipcRenderer.invoke('playlist:set-cover', id),
  clearPlaylistCover: (id) => ipcRenderer.invoke('playlist:clear-cover', id),

  // Statistik
  recordPlay: (id) => ipcRenderer.invoke('stats:record-play', id),
  addListenMs: (id, ms) => ipcRenderer.invoke('stats:add-ms', { id, ms }),
  getStats: () => ipcRenderer.invoke('stats:get'),
  resetStats: () => ipcRenderer.invoke('stats:reset'),

  // Mode mini & Dynamic Island (satu jendela yang sama, bukan jendela terpisah lagi)
  enterMini: (origin) => ipcRenderer.invoke('win:enter-mini', origin),
  exitMini: () => ipcRenderer.invoke('win:exit-mini'),
  setMiniMenuOpen: (open) => ipcRenderer.invoke('win:mini-menu', open),
  enterIsland: (origin) => ipcRenderer.invoke('win:enter-island', origin),
  setIslandExpanded: (expanded) => ipcRenderer.invoke('win:island-expand', expanded),
  exitIsland: () => ipcRenderer.invoke('win:exit-island'),
  startWindowDrag: () => ipcRenderer.send('win:drag-start'),
  stopWindowDrag: () => ipcRenderer.send('win:drag-stop'),
  onIslandDock: (cb) => {
    const h = (_e, docked) => cb(docked);
    ipcRenderer.on('win:island-dock', h);
    return () => ipcRenderer.removeListener('win:island-dock', h);
  },
  remoteStatus: () => ipcRenderer.invoke('remote:status'),
  remoteToggle: () => ipcRenderer.invoke('remote:toggle'),
  saveImage: (payload) => ipcRenderer.invoke('image:save', payload),
  onModeChanging: (cb) => {
    const h = (_e, mode) => cb(mode);
    ipcRenderer.on('win:mode-changing', h);
    return () => ipcRenderer.removeListener('win:mode-changing', h);
  },

  // Pintasan Keyboard Global (Global Shortcuts)
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  resetShortcuts: () => ipcRenderer.invoke('shortcuts:reset'),
  onShortcutAction: (cb) => {
    const h = (_e, act) => cb(act);
    ipcRenderer.on('shortcut:action', h);
    return () => ipcRenderer.removeListener('shortcut:action', h);
  },
});
