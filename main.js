'use strict';
const { app, BrowserWindow, Menu, ipcMain, dialog, protocol, shell, screen, Tray, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { Readable } = require('stream');

const { JsonStore } = require('./lib/store');
const { scan } = require('./lib/scanner');
const { applyPatch, writeToFile, importCover } = require('./lib/tags');
const transcode = require('./lib/transcode');
const lyricsSvc = require('./lib/lyrics');
const ytdl = require('./lib/ytdl');
const remoteServer = require('./lib/remoteServer');
const gdrive = require('./lib/gdrive');

// Untuk pengujian / mode portabel: ARMUSE_DATA_DIR (atau RD_DATA_DIR) menimpa lokasi data aplikasi.
if (process.env.ARMUSE_DATA_DIR || process.env.RD_DATA_DIR) {
  app.setPath('userData', process.env.ARMUSE_DATA_DIR || process.env.RD_DATA_DIR);
}

// Skema khusus media:// agar <audio> dan <img> bisa membaca file lokal (dengan dukungan Range/seek).
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: true } },
]);

const MIME = {
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
};

const DEFAULT_SHORTCUTS = {
  enabled: true,
  toggleIsland: 'Alt+I',
  toggleMini: 'Alt+M',
  playPause: 'Alt+Space',
  nextTrack: 'Alt+Right',
  prevTrack: 'Alt+Left',
  toggleWindow: 'Alt+A',
};

const DEFAULT_SETTINGS = {
  folders: [],
  volume: 0.8,
  shuffle: false,
  repeat: 'off',
  sort: { albums: 'title', songs: 'title' },
  eq: { enabled: true, preamp: 0, gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preset: 'Flat', custom: {} },
  theme: 'dark',  // 'dark' | 'light' | 'glass'
  lang: 'id',     // 'id' | 'en' | 'ja'
  shortcuts: { ...DEFAULT_SHORTCUTS },
};

let win = null;
let library; // JsonStore: { tracks: { id: track } }
let settings; // JsonStore
let playlists; // JsonStore: { playlists: { id: { id, name, trackIds, created } } }
let stats; // JsonStore: { totalMs: 0, tracks: { id: { count, ms, last } } }
let coversDir;
let lyricsCacheDir;
let scanning = false;

function initStores() {
  const dir = app.getPath('userData');
  coversDir = path.join(dir, 'covers');
  fs.mkdirSync(coversDir, { recursive: true });
  library = new JsonStore(path.join(dir, 'library.json'), { tracks: {} });
  settings = new JsonStore(path.join(dir, 'settings.json'), DEFAULT_SETTINGS);
  playlists = new JsonStore(path.join(dir, 'playlists.json'), { playlists: {} });
  stats = new JsonStore(path.join(dir, 'stats.json'), { totalMs: 0, tracks: {} });
  lyricsCacheDir = path.join(dir, 'lyrics-cache');
  library.load();
  settings.load();
  // Migrasi: tema "kaca" (glass-dark/glass-light) sudah dihapus dari aplikasi — kembalikan ke gelap.
  if (settings.data.theme === 'glass-light' || settings.data.theme === 'glass-dark') { settings.data.theme = 'dark'; settings.save(); }
  playlists.load();
  stats.load();
  gdrive.init(dir, settings, stats);
}

const allTracks = () => Object.values(library.data.tracks);

// ---------- protokol media:// ----------
function registerMediaProtocol() {
  protocol.handle('media', async (request) => {
    try {
      const file = new URL(request.url).searchParams.get('p');
      if (file && (file.startsWith('gdrive://') || file.startsWith('https://drive.google.com/'))) {
        return gdrive.handleMediaRequest(file, request, MIME);
      }
      const type = file && MIME[path.extname(file).toLowerCase()];
      if (!type) return new Response('Forbidden', { status: 403 });

      const stat = await fsp.stat(file);
      const size = stat.size;
      let start = 0;
      let end = size - 1;
      let status = 200;
      const range = request.headers.get('range');
      const m = range && /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        if (m[1] === '' && m[2] !== '') { start = Math.max(0, size - parseInt(m[2], 10)); }
        else {
          if (m[1] !== '') start = parseInt(m[1], 10);
          if (m[2] !== '') end = Math.min(parseInt(m[2], 10), size - 1);
        }
        if (start > end || start >= size) return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        status = 206;
      }
      const headers = {
        'Content-Type': type,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      };
      if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      const body = Readable.toWeb(fs.createReadStream(file, { start, end }));
      return new Response(body, { status, headers });
    } catch (_) {
      return new Response('Not found', { status: 404 });
    }
  });
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('library:load', () => ({ tracks: allTracks(), settings: settings.data }));

  // ---------- Perbandingan kualitas (A/B): buat versi terkompresi lewat ffmpeg ----------
  const abDir = () => path.join(app.getPath('userData'), 'ab-cache');
  ipcMain.handle('ab:status', async () => ({ ...transcode.status(), cache: await transcode.cacheInfo(abDir()) }));
  ipcMain.handle('ab:presets', () => transcode.presetList());
  ipcMain.handle('ab:prepare', async (event, { id, preset }) => {
    const t = library.data.tracks[id];
    if (!t) return { ok: false, error: 'Lagu tidak ditemukan di pustaka.' };
    return transcode.prepare({
      track: t, presetId: preset, cacheDir: abDir(),
      onProgress: (pct) => event.sender.send('ab:progress', { id, pct }),
    });
  });
  ipcMain.handle('ab:cancel', () => transcode.cancel());
  ipcMain.handle('ab:clear', () => transcode.clearCache(abDir()));

  // ---------- Unduh & Konversi YouTube ----------
  ipcMain.handle('ytdl:status', () => ytdl.status());
  ipcMain.handle('ytdl:info', async (_e, url) => ytdl.getInfo(url));
  ipcMain.handle('ytdl:download', async (event, { url, format, destDir }) => {
    let targetDir = destDir;
    if (!targetDir) {
      targetDir = (settings.data.folders && settings.data.folders[0]) || app.getPath('music');
    }
    const res = await ytdl.download({
      url,
      format,
      destDir: targetDir,
      onProgress: (p) => event.sender.send('ytdl:progress', p),
    });
    if (res.ok && targetDir) {
      const set = new Set(settings.data.folders);
      if (!set.has(targetDir)) {
        set.add(targetDir);
        settings.data.folders = [...set];
        settings.flush();
      }
    }
    return res;
  });
  ipcMain.handle('ytdl:cancel', () => ytdl.cancel());
  ipcMain.handle('ytdl:default-folder', () => {
    return (settings.data.folders && settings.data.folders[0]) || app.getPath('music');
  });

  ipcMain.handle('library:scan', async (event) => {
    if (scanning) return { busy: true };
    scanning = true;
    try {
      const cloudTracks = Object.values(library.data.tracks).filter((t) => t.path.startsWith('gdrive://') || t.cloud);
      const res = await scan({
        folders: settings.data.folders,
        existing: library.data.tracks,
        coversDir,
        onProgress: (p) => event.sender.send('scan:progress', p),
      });
      const merged = [...cloudTracks, ...res.tracks];
      library.data.tracks = Object.fromEntries(merged.map((t) => [t.id, t]));
      library.flush();
      return { tracks: merged, failed: res.failed, offline: res.offline };
    } finally {
      scanning = false;
    }
  });

  ipcMain.handle('library:add-folder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Pilih folder musik', properties: ['openDirectory', 'multiSelections'] });
    if (r.canceled) return { added: 0, settings: settings.data };
    const set = new Set(settings.data.folders);
    let added = 0;
    for (const f of r.filePaths) if (!set.has(f)) { set.add(f); added++; }
    settings.data.folders = [...set];
    settings.flush();
    return { added, settings: settings.data };
  });

  ipcMain.handle('library:remove-folder', (_e, folder) => {
    settings.data.folders = settings.data.folders.filter((f) => f !== folder);
    const keep = {};
    for (const t of allTracks()) if (!t.path.startsWith(folder)) keep[t.id] = t;
    library.data.tracks = keep;
    settings.flush();
    library.flush();
    return { tracks: allTracks(), settings: settings.data };
  });

  ipcMain.handle('tracks:update', async (_e, { ids, patch, writeFile }) => {
    const out = [];
    let written = 0;
    const skipped = [];
    for (const id of ids) {
      const t = library.data.tracks[id];
      if (!t) continue;
      applyPatch(t, patch);
      if (writeFile) {
        try {
          const r = await writeToFile(t, patch);
          if (r.ok) { if (r.written.length || patch.cover) written++; } else skipped.push(path.basename(t.path));
        } catch (err) { skipped.push(path.basename(t.path)); }
      }
      out.push(t);
    }
    library.save();
    return { tracks: out, written, skipped };
  });

  ipcMain.handle('cover:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Pilih gambar sampul',
      properties: ['openFile'],
      filters: [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return importCover(r.filePaths[0], coversDir);
  });

  // ---------- Google Drive Cloud Streaming & Cache ----------
  ipcMain.handle('gdrive:status', () => gdrive.getStats());
  ipcMain.handle('gdrive:save-url', (_e, url) => {
    settings.data.gdriveFolderUrl = url;
    if (!settings.data.gdriveFolderUrls) settings.data.gdriveFolderUrls = [];
    if (url && !settings.data.gdriveFolderUrls.includes(url)) {
      settings.data.gdriveFolderUrls.push(url);
    }
    settings.save();
    return gdrive.getStats();
  });
  ipcMain.handle('gdrive:add-url', (_e, url) => {
    const clean = (url || '').trim();
    if (!clean) return gdrive.getStats();
    if (!Array.isArray(settings.data.gdriveFolderUrls)) {
      settings.data.gdriveFolderUrls = settings.data.gdriveFolderUrl ? [settings.data.gdriveFolderUrl] : [];
    }
    if (!settings.data.gdriveFolderUrls.includes(clean)) {
      settings.data.gdriveFolderUrls.push(clean);
      if (!settings.data.gdriveFolderUrl) settings.data.gdriveFolderUrl = clean;
      settings.save();
    }
    return gdrive.getStats();
  });
  ipcMain.handle('gdrive:remove-url', (_e, url) => {
    if (!Array.isArray(settings.data.gdriveFolderUrls)) {
      settings.data.gdriveFolderUrls = settings.data.gdriveFolderUrl ? [settings.data.gdriveFolderUrl] : [];
    }
    settings.data.gdriveFolderUrls = settings.data.gdriveFolderUrls.filter(u => u !== url);
    if (settings.data.gdriveFolderUrl === url) {
      settings.data.gdriveFolderUrl = settings.data.gdriveFolderUrls[0] || '';
    }
    settings.save();
    return gdrive.getStats();
  });
  ipcMain.handle('gdrive:set-max-cache', (_e, max) => {
    const num = parseInt(max, 10);
    if (!isNaN(num) && num >= 10 && num <= 5000) {
      settings.data.gdriveMaxCache = num;
      settings.save();
      gdrive.evictIfNeeded(num);
    }
    return gdrive.getStats();
  });
  ipcMain.handle('gdrive:sync', async (event, url) => {
    if (url) {
      if (!Array.isArray(settings.data.gdriveFolderUrls)) settings.data.gdriveFolderUrls = [];
      if (!settings.data.gdriveFolderUrls.includes(url)) settings.data.gdriveFolderUrls.push(url);
      settings.data.gdriveFolderUrl = url;
      settings.save();
    }
    const urls = url ? [url] : (settings.data.gdriveFolderUrls && settings.data.gdriveFolderUrls.length ? settings.data.gdriveFolderUrls : [settings.data.gdriveFolderUrl].filter(Boolean));
    return gdrive.syncAll(urls, (prog) => {
      event.sender.send('gdrive:progress', prog);
    }, library, stats);
  });
  ipcMain.handle('gdrive:clear-cache', () => gdrive.clearCache());
  ipcMain.handle('gdrive:open-folder', (_e, type) => gdrive.openFolder(type));
  ipcMain.handle('gdrive:prefetch', (_e, { fileId, path }) => gdrive.prefetch(fileId, path));
  ipcMain.handle('gdrive:track-status', (_e, fileId) => gdrive.getTrackStatus(fileId));

  ipcMain.handle('settings:set', (_e, partial) => {
    if (partial && partial.shortcuts) {
      settings.data.shortcuts = {
        ...DEFAULT_SHORTCUTS,
        ...(settings.data.shortcuts || {}),
        ...partial.shortcuts,
      };
      const rest = { ...partial };
      delete rest.shortcuts;
      Object.assign(settings.data, rest);
      settings.save();
      registerGlobalShortcuts();
      return true;
    }
    Object.assign(settings.data, partial);
    settings.save();
    return true;
  });

  ipcMain.handle('shortcuts:get', () => ({
    ...DEFAULT_SHORTCUTS,
    ...((settings && settings.data && settings.data.shortcuts) || {}),
  }));

  ipcMain.handle('shortcuts:reset', () => {
    settings.data.shortcuts = { ...DEFAULT_SHORTCUTS };
    settings.save();
    registerGlobalShortcuts();
    return { ...DEFAULT_SHORTCUTS };
  });

  // Sinkron (bukan Promise) — dipanggil theme-init.js SEBELUM stylesheet dimuat,
  // supaya tema & bahasa yang tersimpan langsung terpasang tanpa kedipan dulu.
  ipcMain.on('theme:get-sync', (e) => {
    e.returnValue = (settings && settings.data && settings.data.theme) || 'dark';
  });
  ipcMain.on('lang:get-sync', (e) => {
    e.returnValue = (settings && settings.data && settings.data.lang) || 'id';
  });

  ipcMain.handle('shell:reveal', (_e, file) => { shell.showItemInFolder(file); });
  ipcMain.handle('shell:open-external', async (_e, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) {
      await shell.openExternal(url.trim());
      return true;
    }
    return false;
  });


  // ---------- Remote Server (iPhone & Smartphone Streamer) ----------
  ipcMain.handle('remote:status', async () => {
    const st = remoteServer.status();
    const qrSvg = await remoteServer.getQrSvg();
    return { ...st, qrSvg };
  });
  ipcMain.handle('remote:toggle', async () => {
    if (remoteServer.running) {
      await remoteServer.stop();
    } else {
      await remoteServer.start();
    }
    const st = remoteServer.status();
    const qrSvg = await remoteServer.getQrSvg();
    return { ...st, qrSvg };
  });

  // ---------- Lirik ----------
  // Cek lirik mandiri (ditulis pengguna) dulu; kalau tidak ada, cek cache/lrclib.net.
  // online=false dipakai saat lagu mulai diputar (tidak memaksa akses internet);
  // online=true hanya saat pengguna menekan tombol "Cari lirik online".
  ipcMain.handle('lyrics:get', async (_e, { id, online = false, query = null }) => {
    const t = library.data.tracks[id];
    if (!t) return { found: false };
    if (!query && t.custom.lyrics && Object.keys(t.custom.lyrics).length) {
      return { manual: true, byLang: t.custom.lyrics };
    }
    return lyricsSvc.get({ track: t, cacheDir: lyricsCacheDir, online, query });
  });

  ipcMain.handle('lyrics:save-manual', (_e, { id, lang, text }) => {
    const t = library.data.tracks[id];
    if (!t) return { ok: false };
    t.custom.lyrics = t.custom.lyrics || {};
    if (text && text.trim()) t.custom.lyrics[lang] = text;
    else delete t.custom.lyrics[lang];
    library.save();
    return { ok: true };
  });

  // ---------- Playlist ----------
  const sortedPlaylists = () => Object.values(playlists.data.playlists).sort((a, b) => a.created - b.created);
  ipcMain.handle('playlist:list', () => sortedPlaylists());

  ipcMain.handle('playlist:create', (_e, { name }) => {
    const id = 'pl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    playlists.data.playlists[id] = { id, name: (name || 'Playlist baru').trim() || 'Playlist baru', trackIds: [], created: Date.now() };
    playlists.flush();
    return playlists.data.playlists[id];
  });

  ipcMain.handle('playlist:rename', (_e, { id, name }) => {
    const p = playlists.data.playlists[id];
    if (p && name && name.trim()) { p.name = name.trim(); playlists.flush(); }
    return sortedPlaylists();
  });

  ipcMain.handle('playlist:delete', (_e, id) => {
    delete playlists.data.playlists[id];
    playlists.flush();
    return sortedPlaylists();
  });

  ipcMain.handle('playlist:add-tracks', (_e, { id, ids }) => {
    const p = playlists.data.playlists[id];
    if (!p) return null;
    const set = new Set(p.trackIds);
    for (const tid of ids) if (!set.has(tid)) { p.trackIds.push(tid); set.add(tid); }
    playlists.flush();
    return p;
  });

  ipcMain.handle('playlist:remove-track', (_e, { id, trackId }) => {
    const p = playlists.data.playlists[id];
    if (!p) return null;
    p.trackIds = p.trackIds.filter((tid) => tid !== trackId);
    playlists.flush();
    return p;
  });

  ipcMain.handle('playlist:set-cover', async (_e, id) => {
    const p = playlists.data.playlists[id];
    if (!p) return null;
    const r = await dialog.showOpenDialog(win, {
      title: 'Pilih gambar sampul playlist',
      properties: ['openFile'],
      filters: [{ name: 'Gambar', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (r.canceled || !r.filePaths[0]) return p;
    p.cover = await importCover(r.filePaths[0], coversDir);
    playlists.flush();
    return p;
  });

  ipcMain.handle('playlist:clear-cover', (_e, id) => {
    const p = playlists.data.playlists[id];
    if (p) { delete p.cover; playlists.flush(); }
    return p;
  });

  // ---------- Statistik ----------
  const statTrack = (id) => stats.data.tracks[id] || (stats.data.tracks[id] = { count: 0, ms: 0, last: 0 });
  ipcMain.handle('stats:record-play', (_e, id) => {
    const s = statTrack(id);
    s.count++;
    s.last = Date.now();
    stats.save();
    return true;
  });
  ipcMain.handle('stats:add-ms', (_e, { id, ms }) => {
    if (!ms || ms <= 0) return true;
    const s = statTrack(id);
    s.ms += ms;
    stats.data.totalMs += ms;
    stats.save();
    return true;
  });
  ipcMain.handle('stats:get', () => ({ totalMs: stats.data.totalMs, tracks: stats.data.tracks }));
  ipcMain.handle('stats:reset', () => {
    stats.data = { totalMs: 0, tracks: {} };
    stats.flush();
    return true;
  });

  // ---------- Kontrol jendela custom (tidak ada title bar OS lagi) ----------
  ipcMain.handle('win:minimize', () => { if (win) win.minimize(); });
  ipcMain.handle('win:close', () => { if (win) win.hide(); });

  // ---------- Mode mini & Dynamic Island (satu jendela yang sama, diperkecil & dianimasikan) ----------
  ipcMain.handle('win:enter-mini', (_e, origin) => enterMini(origin));
  ipcMain.handle('win:exit-mini', () => exitMini());
  ipcMain.handle('win:mini-menu', (_e, open) => setMiniMenuHeight(open));
  ipcMain.handle('win:enter-island', (_e, origin) => enterIsland(origin));
  ipcMain.handle('win:island-expand', (_e, expanded) => setIslandExpanded(expanded));
  ipcMain.handle('win:exit-island', () => exitIsland());
  ipcMain.on('win:drag-start', () => startCustomDrag());
  ipcMain.on('win:drag-stop', () => stopCustomDrag());

  // ---------- Kartu bagikan: simpan PNG ke file ----------
  ipcMain.handle('image:save', async (_e, { data, suggestedName }) => {
    const safeName = (suggestedName || 'armuse-share.png').replace(/[\\/:*?"<>|]/g, '_');
    const r = await dialog.showSaveDialog(win, {
      title: 'Simpan gambar',
      defaultPath: safeName,
      filters: [{ name: 'Gambar PNG', extensions: ['png'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    await fsp.writeFile(r.filePath, Buffer.from(data));
    return { ok: true, path: r.filePath };
  });
}

// ---------- animasi resize jendela (Electron tidak animasikan setBounds secara native di Windows,
// jadi kita "kejar" posisi target berkali-kali dalam waktu singkat dengan kurva spring/quintic iOS supaya terasa mulus & mewah) ----------
function animateBounds(target, duration, onDone, springOvershoot = 0) {
  if (!win) return;
  if (win._rdAnim) { clearInterval(win._rdAnim); win._rdAnim = null; }
  const start = win.getBounds();
  const t0 = Date.now();
  // Kurva quintic ease-out iOS dengan opsi sentuhan spring halus
  const ease = (t) => {
    if (springOvershoot > 0 && t < 1) {
      const c1 = springOvershoot;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    return 1 - Math.pow(1 - t, 4.2);
  };
  win._rdAnim = setInterval(() => {
    if (!win || win.isDestroyed()) { clearInterval(win._rdAnim); return; }
    const t = Math.min(1, (Date.now() - t0) / duration);
    const e = ease(t);
    win.setBounds({
      x: Math.round(start.x + (target.x - start.x) * e),
      y: Math.round(start.y + (target.y - start.y) * e),
      width: Math.max(120, Math.round(start.width + (target.width - start.width) * e)),
      height: Math.max(36, Math.round(start.height + (target.height - start.height) * e)),
    });
    if (t >= 1) {
      clearInterval(win._rdAnim);
      win._rdAnim = null;
      win.setBounds(target);
      if (onDone) onDone();
    }
  }, 1000 / 60);
}

const MINI_W = 480, MINI_H = 112, MINI_MENU_EXTRA = 214;
const ISLAND_COLLAPSED_W = 486, ISLAND_COLLAPSED_H = 68;
const ISLAND_EXPANDED_W = 584, ISLAND_EXPANDED_H = 266;
let savedBounds = null;
let miniMode = false;
let islandMode = false;
let islandExpanded = false;
let islandDocked = true;
let miniExtra = 0; // tinggi tambahan yang sedang aktif untuk menu titik-tiga; 0 = tidak ada
let dragTimer = null;

function setCompactMinSize(compact) {
  if (!win) return;
  if (compact) win.setMinimumSize(180, 44);
  else win.setMinimumSize(980, 620);
}

function startCustomDrag() {
  if (!win || win.isDestroyed()) return;
  if (win._rdAnim) { clearInterval(win._rdAnim); win._rdAnim = null; }
  if (dragTimer) { clearInterval(dragTimer); dragTimer = null; }
  const startCur = screen.getCursorScreenPoint();
  const startB = win.getBounds();
  const dragStartTime = Date.now();
  dragTimer = setInterval(() => {
    if (!win || win.isDestroyed()) { clearInterval(dragTimer); dragTimer = null; return; }
    // Timeout darurat 10 detik bila OS kehilangan event mouseup saat kursor di luar jendela
    if (Date.now() - dragStartTime > 10000) {
      clearInterval(dragTimer);
      dragTimer = null;
      return;
    }
    const cur = screen.getCursorScreenPoint();
    let nx = startB.x + (cur.x - startCur.x);
    let ny = startB.y + (cur.y - startCur.y);
    const disp = screen.getDisplayNearestPoint({ x: nx + Math.round(startB.width / 2), y: ny });
    const wa = disp.workArea;
    // Boundary clamp: pastikan kapsul/bar tidak pernah bisa terlempar keluar dari monitor
    nx = Math.max(wa.x, Math.min(nx, wa.x + wa.width - startB.width));
    ny = Math.max(wa.y, Math.min(ny, wa.y + wa.height - startB.height));
    win.setBounds({ x: nx, y: ny, width: startB.width, height: startB.height });
    if (islandMode) {
      const dockedNow = ny <= wa.y + 10;
      if (dockedNow !== islandDocked) {
        islandDocked = dockedNow;
        win.webContents.send('win:island-dock', islandDocked);
      }
    }
  }, 8);
}

function stopCustomDrag() {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  if (!win || win.isDestroyed()) return;
  if (islandMode) {
    const cur = win.getBounds();
    const disp = screen.getDisplayNearestPoint({ x: cur.x + Math.round(cur.width / 2), y: cur.y });
    const wa = disp.workArea;
    if (cur.y <= wa.y + 14) {
      islandDocked = true;
      win.webContents.send('win:island-dock', true);
      if (cur.y !== wa.y) {
        animateBounds({ x: cur.x, y: wa.y, width: cur.width, height: cur.height }, 160);
      }
    } else {
      islandDocked = false;
      win.webContents.send('win:island-dock', false);
    }
  } else if (!miniMode) {
    savedBounds = win.getBounds();
  }
}

/** Ubah tinggi window mini dengan menambah `extra` piksel di ATAS mini-bar (tepi bawah tetap diam).
 * Dipakai bersama untuk menu titik-tiga (MINI_MENU_EXTRA) maupun dialog/overlay (MINI_DIALOG_EXTRA),
 * supaya keduanya tidak perlu logic duplikat dan tidak saling konflik (hanya satu yang aktif sekaligus). */
function setMiniExtra(extra, duration = 200) {
  if (!win || !miniMode || islandMode) return;
  extra = Math.max(0, Math.round(extra));
  if (extra === miniExtra) return;
  const b = win.getBounds();
  const disp = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const wa = disp.workArea;
  const wanted = MINI_H + extra;
  // Jangan sampai tepi atas window melewati batas atas area kerja layar.
  const maxHeight = Math.max(MINI_H, (b.y + b.height) - wa.y);
  const height = Math.min(wanted, maxHeight);
  const y = (b.y + b.height) - height;
  miniExtra = extra;
  animateBounds({ x: b.x, y, width: b.width, height }, duration, null, 0.35);
}

function enterMini(origin) {
  if (!win || (miniMode && !islandMode)) return;
  if (!miniMode && !islandMode) {
    if (win.isMaximized()) win.unmaximize();
    savedBounds = win.getBounds();
  }
  miniMode = true;
  islandMode = false;
  islandExpanded = false;
  miniExtra = 0;
  setCompactMinSize(true);
  win.setResizable(false);
  win.setAlwaysOnTop(true);
  win.webContents.send('win:mode-changing', 'mini'); // renderer mulai crossfade CSS SEKARANG (paralel)

  const refBounds = savedBounds || win.getBounds();
  const disp = screen.getDisplayNearestPoint({ x: refBounds.x, y: refBounds.y });
  const wa = disp.workArea;
  let x, y;
  if (origin && Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
    // Mulai dari dekat titik klik tombol mini, supaya terasa "tumbuh dari sana".
    x = Math.round(origin.x - MINI_W / 2);
    y = Math.round(origin.y - MINI_H / 2);
  } else {
    x = wa.x + wa.width - MINI_W - 16;
    y = wa.y + wa.height - MINI_H - 16;
  }
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - MINI_W));
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - MINI_H));
  const target = { x, y, width: MINI_W, height: MINI_H };
  animateBounds(target, 290, () => { if (win) win.setAlwaysOnTop(true); }, 0.32);
}

function computeIslandBounds(expanded) {
  const ref = win ? win.getBounds() : (savedBounds || { x: 100, y: 80 });
  const disp = screen.getDisplayNearestPoint({ x: ref.x + Math.round((ref.width || 0) / 2), y: ref.y });
  const wa = disp.workArea;
  // Proporsi dinamis mengikuti resolusi layar laptop
  const scale = Math.max(0.95, Math.min(1.18, wa.width / 1536));
  const w = Math.round((expanded ? ISLAND_EXPANDED_W : ISLAND_COLLAPSED_W) * scale);
  const h = Math.round(expanded ? ISLAND_EXPANDED_H : ISLAND_COLLAPSED_H);
  const x = Math.round(wa.x + (wa.width - w) / 2);
  const y = Math.round(wa.y);
  return { x, y, width: w, height: h };
}

function enterIsland() {
  if (!win || islandMode) return;
  if (!miniMode && !islandMode) {
    if (win.isMaximized()) win.unmaximize();
    savedBounds = win.getBounds();
  }
  miniMode = false;
  islandMode = true;
  islandExpanded = false;
  islandDocked = true;
  miniExtra = 0;
  setCompactMinSize(true);
  win.setResizable(false);
  win.setAlwaysOnTop(true);
  win.webContents.send('win:mode-changing', 'island');
  win.webContents.send('win:island-dock', true);
  const target = computeIslandBounds(false);
  animateBounds(target, 310, () => { if (win) win.setAlwaysOnTop(true); }, 0.42);
}

function setIslandExpanded(expanded) {
  if (!win || !islandMode) return;
  const next = !!expanded;
  if (next === islandExpanded) return;
  islandExpanded = next;
  // Pertahankan posisi horizontal jika pengguna sempat menggeser kapsul
  const cur = win.getBounds();
  const disp = screen.getDisplayNearestPoint({ x: cur.x + Math.round(cur.width / 2), y: cur.y });
  const wa = disp.workArea;
  const scale = Math.max(0.95, Math.min(1.18, wa.width / 1536));
  const w = Math.round((next ? ISLAND_EXPANDED_W : ISLAND_COLLAPSED_W) * scale);
  const h = Math.round(next ? ISLAND_EXPANDED_H : ISLAND_COLLAPSED_H);
  const centerX = cur.x + cur.width / 2;
  let x = Math.round(centerX - w / 2);
  x = Math.max(wa.x + 4, Math.min(x, wa.x + wa.width - w - 4));
  const y = islandDocked ? wa.y : Math.max(wa.y, Math.min(cur.y, wa.y + wa.height - h - 8));
  animateBounds({ x, y, width: w, height: h }, next ? 280 : 240, null, next ? 0.44 : 0.24);
}

function exitMini() {
  if (!win || (!miniMode && !islandMode)) return;
  miniMode = false;
  islandMode = false;
  islandExpanded = false;
  miniExtra = 0;
  win.setAlwaysOnTop(false);
  win.webContents.send('win:mode-changing', 'full');
  const target = savedBounds || { x: 100, y: 80, width: 1280, height: 800 };
  animateBounds(target, 300, () => {
    if (win) {
      setCompactMinSize(false);
      win.setResizable(true);
    }
  }, 0.22);
}

function exitIsland() {
  exitMini();
}


function setMiniMenuHeight(open) { setMiniExtra(open ? MINI_MENU_EXTRA : 0, 190); }

// ---------- Pintasan Keyboard Global (Global Shortcuts) ----------
function registerGlobalShortcuts() {
  try {
    globalShortcut.unregisterAll();
  } catch (_) {}
  if (!settings || !settings.data) return;
  const sc = { ...DEFAULT_SHORTCUTS, ...(settings.data.shortcuts || {}) };
  if (sc.enabled === false) return;

  const tryReg = (accel, fn) => {
    if (!accel || typeof accel !== 'string' || !accel.trim()) return;
    try {
      globalShortcut.register(accel.trim(), fn);
    } catch (err) {
      console.warn('[GlobalShortcut] Gagal mendaftarkan:', accel, err && err.message);
    }
  };

  // 1) Buka / Tutup Dynamic Island dari aplikasi mana saja (default: Alt+I)
  tryReg(sc.toggleIsland, () => {
    if (!win || win.isDestroyed()) return;
    if (islandMode) {
      exitIsland();
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      if (miniMode) exitMini();
      if (win.isMinimized()) win.restore();
      win.show();
      enterIsland();
    }
  });

  // 2) Buka / Tutup Mode Mini dari aplikasi mana saja (default: Alt+M)
  tryReg(sc.toggleMini, () => {
    if (!win || win.isDestroyed()) return;
    if (miniMode) {
      exitMini();
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else {
      if (islandMode) exitIsland();
      if (win.isMinimized()) win.restore();
      win.show();
      enterMini();
    }
  });

  // 3) Putar / Jeda Lagu (default: Alt+Space)
  tryReg(sc.playPause, () => {
    if (win && !win.isDestroyed()) win.webContents.send('shortcut:action', 'play-pause');
  });

  // 4) Lagu Berikutnya (default: Alt+Right)
  tryReg(sc.nextTrack, () => {
    if (win && !win.isDestroyed()) win.webContents.send('shortcut:action', 'next');
  });

  // 5) Lagu Sebelumnya (default: Alt+Left)
  tryReg(sc.prevTrack, () => {
    if (win && !win.isDestroyed()) win.webContents.send('shortcut:action', 'prev');
  });

  // 6) Tampilkan / Sembunyikan Jendela Utama Armuse (default: Alt+A)
  tryReg(sc.toggleWindow, () => {
    if (!win || win.isDestroyed()) return;
    if (win.isVisible() && win.isFocused() && !miniMode && !islandMode) {
      win.hide();
    } else {
      if (miniMode || islandMode) exitMini();
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

// ---------- jendela ----------
let isQuitting = false;
let tray = null;

function setupTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'build', 'icon.ico');
  const fallbackIcon = path.join(__dirname, 'src', 'icon.png');
  const targetIcon = fs.existsSync(iconPath) ? iconPath : fallbackIcon;

  try {
    tray = new Tray(targetIcon);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Buka Armuse',
        click: () => {
          if (win) {
            if (miniMode || islandMode) exitMini();
            win.show();
            win.focus();
          }
        },
      },
      {
        label: 'Mode Dynamic Island',
        click: () => {
          if (win) {
            win.show();
            enterIsland();
          }
        },
      },
      {
        label: 'Status Server HP: Port 4000 (Aktif)',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '☕ Support via Saweria (saweria.co/alfaathhh)',
        click: () => {
          shell.openExternal('https://saweria.co/alfaathhh').catch(() => {});
        },
      },
      { type: 'separator' },
      {
        label: 'Keluar Sepenuhnya (Quit)',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip('Armuse — Server HP Aktif (Port 4000)');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      if (win) {
        if (miniMode || islandMode) exitMini();
        win.show();
        win.focus();
      }
    });
  } catch (err) {
    console.warn('[Tray] Setup error:', err);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 620,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    title: 'Armuse',
    autoHideMenuBar: true,
    // Tanpa title bar OS sama sekali (tidak pakai titleBarOverlay lagi): tombol
    // minimize/close digambar sendiri oleh renderer (lihat #topbar .win-controls
    // di src/index.html), supaya bisa disembunyikan sepenuhnya di mode mini.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown') return;
    const isDevToolsKey = input.key === 'F12'
      || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i');
    if (isDevToolsKey) win.webContents.toggleDevTools();
  });
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (miniMode || islandMode) exitMini();
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
    initStores();
    remoteServer.init({ library, settings, playlists, stats, coversDir, lyricsCacheDir, ytdl, app, getMainWindow: () => win });
    remoteServer.start(4000).catch((err) => console.error('[RemoteServer] Start error:', err));
    registerMediaProtocol();
    registerIpc();
    setupTray();
    createWindow();
    registerGlobalShortcuts();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('before-quit', () => {
    isQuitting = true;
    try { globalShortcut.unregisterAll(); } catch (_) {}
    library && library.flush();
    settings && settings.flush();
    playlists && playlists.flush();
    stats && stats.flush();
  });
  app.on('window-all-closed', () => { if (isQuitting && process.platform !== 'darwin') app.quit(); });
}
