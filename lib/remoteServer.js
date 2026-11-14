'use strict';
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const url = require('url');
const QRCode = require('qrcode');

const MIME = {
  '.mp3': 'audio/mpeg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
};

class RemoteServer {
  constructor() {
    this.server = null;
    this.port = 4000;
    this.running = false;
    this.context = null; // { library, settings, playlists, stats, coversDir, lyricsCacheDir, ytdl, app }
  }

  init(context) {
    this.context = context;
  }

  getLanIps() {
    const interfaces = os.networkInterfaces();
    const list = [];
    const host = os.hostname().toLowerCase();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          list.push({
            name,
            ip: net.address,
            url: `http://${net.address}:${this.port}`,
          });
        }
      }
    }
    if (host) {
      list.push({
        name: 'mDNS Hostname (Permanen)',
        ip: `${host}.local`,
        url: `http://${host}.local:${this.port}`,
      });
    }
    if (!list.length) {
      list.push({ name: 'localhost', ip: '127.0.0.1', url: `http://127.0.0.1:${this.port}` });
    }
    return list;
  }

  getPrimaryUrl() {
    const ips = this.getLanIps();
    return ips[0] ? ips[0].url : `http://localhost:${this.port}`;
  }

  async getQrSvg(targetUrl) {
    const u = targetUrl || this.getPrimaryUrl();
    return new Promise((resolve) => {
      QRCode.toString(u, { type: 'svg', margin: 1, color: { dark: '#000000', light: '#ffffff' } }, (err, svg) => {
        if (err) resolve('');
        else resolve(svg);
      });
    });
  }

  status() {
    return {
      running: this.running,
      port: this.port,
      ips: this.getLanIps(),
      primaryUrl: this.getPrimaryUrl(),
    };
  }

  async start(port = 4000) {
    if (this.running) return this.status();
    this.port = port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.on('error', (err) => {
        console.error('[RemoteServer] Error:', err);
        if (!this.running) reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        this.running = true;
        console.log(`[RemoteServer] Berjalan di port ${this.port}. Akses: ${this.getPrimaryUrl()}`);
        resolve(this.status());
      });
    });
  }

  stop() {
    if (!this.running || !this.server) return Promise.resolve(this.status());
    return new Promise((resolve) => {
      this.server.close(() => {
        this.running = false;
        this.server = null;
        console.log('[RemoteServer] Dihentikan.');
        resolve(this.status());
      });
    });
  }

  async handleRequest(req, res) {
    // CORS headers untuk kemudahan akses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = reqUrl.pathname;

    try {
      // 1. Root: Web Companion untuk iPhone & Smartphone
      if (pathname === '/' || pathname === '/index.html') {
        const mobileHtmlPath = path.join(__dirname, '..', 'src', 'mobile.html');
        if (fs.existsSync(mobileHtmlPath)) {
          const content = await fsp.readFile(mobileHtmlPath, 'utf8');
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache, no-store, must-revalidate' });
          return res.end(content);
        }
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Mobile view not found');
      }

      // 2. Web App Manifest untuk iOS / PWA
      if (pathname === '/manifest.json') {
        const manifest = {
          name: 'Armuse Music',
          short_name: 'Armuse',
          description: 'Pemutar Musik Lokal & Streamer Personal',
          start_url: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#070c18',
          theme_color: '#070c18',
          icons: [
            { src: '/icon.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon.png', sizes: '512x512', type: 'image/png' },
          ],
        };
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(manifest));
      }

      // 2b. Service Worker untuk Mode Offline & PWA Caching
      if (pathname === '/sw.js') {
        const swScript = `
const CACHE_NAME = 'armuse-pwa-v3';
const STATIC_ASSETS = ['/', '/manifest.json', '/icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname === '/' || url.pathname === '/manifest.json' || url.pathname === '/icon.png') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
`;
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
        return res.end(swScript.trim());
      }

      // 3. Ikon Aplikasi & Script Pendukung
      if (pathname === '/jpSearch.js') {
        const jpPath = path.join(__dirname, '..', 'src', 'jpSearch.js');
        const fallbackJp = path.join(__dirname, '..', 'jpSearch.js');
        const target = fs.existsSync(jpPath) ? jpPath : fallbackJp;
        if (fs.existsSync(target)) {
          res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' });
          return fs.createReadStream(target).pipe(res);
        }
        res.writeHead(404);
        return res.end();
      }

      if (pathname === '/icon.png') {
        const iconPath = path.join(__dirname, '..', 'src', 'icon.png');
        const fallbackIcon = path.join(__dirname, '..', 'build', 'icon.png');
        const target = fs.existsSync(iconPath) ? iconPath : fallbackIcon;
        if (fs.existsSync(target)) {
          res.writeHead(200, { 'Content-Type': MIME['.png'], 'Cache-Control': 'public, max-age=86400' });
          return fs.createReadStream(target).pipe(res);
        }
        res.writeHead(404);
        return res.end();
      }

      // 4. API Status
      if (pathname === '/api/status') {
        const trks = this.context.library ? Object.values(this.context.library.data.tracks) : [];
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({
          ok: true,
          serverName: os.hostname(),
          port: this.port,
          primaryUrl: this.getPrimaryUrl(),
          trackCount: trks.length,
          version: '1.0.0',
        }));
      }

      // 5. API Tracks: Mengambil daftar lagu dengan detail kualitas & gambar
      if (pathname === '/api/tracks') {
        const rawTracks = this.context.library ? Object.values(this.context.library.data.tracks) : [];
        const tracks = rawTracks.map((t) => {
          const c = t.custom || {};
          const m = t.meta || {};
          const ext = path.extname(t.path || '').toLowerCase();
          const baseTitle = c.title || m.title || path.basename(t.path || '', ext);
          const artist = c.artist || m.artist || '';
          const album = c.album || m.album || 'Tanpa Album';
          const albumArtist = c.albumArtist || m.albumArtist || '';
          const displayArtist = artist || albumArtist || 'Artis Tidak Diketahui';
          const coverPath = c.cover || m.cover || t.cover || null;
          const fav = !!(c.favorite || t.fav);

          const f = t.fmt || {};
          const isLossless = f.lossless === true || ext === '.flac' || ext === '.wav' || ext === '.alac';
          const isHiRes = isLossless && ((f.sampleRate && f.sampleRate > 48000) || (f.bitDepth && f.bitDepth > 16));
          
          let tier = 'lossy';
          let badge = (f.codec || ext.replace('.', '').toUpperCase()) || 'AUDIO';
          let detail = f.bitrate ? `${f.bitrate} kbps` : '';

          if (isHiRes) {
            tier = 'hires';
            badge = 'Hi-Res';
            const bits = f.bitDepth ? `${f.bitDepth}-bit` : '24-bit';
            const rate = f.sampleRate ? `${(f.sampleRate / 1000).toFixed(1)}kHz` : '96kHz';
            detail = `${bits} / ${rate}`;
          } else if (isLossless) {
            tier = 'lossless';
            badge = 'Lossless';
            const bits = f.bitDepth ? `${f.bitDepth}-bit` : '16-bit';
            const rate = f.sampleRate ? `${(f.sampleRate / 1000).toFixed(1)}kHz` : '44.1kHz';
            detail = `${bits} / ${rate}`;
          } else if (f.bitrate) {
            detail = `${f.bitrate} kbps`;
          }

          return {
            id: t.id,
            title: baseTitle,
            artist: displayArtist,
            album,
            duration: t.duration || 0,
            playCount: (this.context.stats && this.context.stats.data && this.context.stats.data.tracks && this.context.stats.data.tracks[t.id]) ? (this.context.stats.data.tracks[t.id].count || 0) : 0,
            year: c.year || m.year || null,
            genres: m.genre ? m.genre.split(/\s*[,;]\s*/).filter(Boolean) : [],
            fav,
            hasCover: !!(coverPath && fs.existsSync(coverPath)),
            quality: {
              tier,
              badge,
              detail,
              lossless: isLossless,
              hires: isHiRes,
              codec: f.codec || ext.replace('.', '').toUpperCase(),
              sampleRate: f.sampleRate || 0,
              bitDepth: f.bitDepth || 0,
            },
          };
        });
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ ok: true, count: tracks.length, tracks }));
      }

      // 6. API Stream Audio (Dukungan Range 206 Partial Content untuk iOS Safari)
      if (pathname.startsWith('/api/stream/')) {
        const trackId = pathname.replace('/api/stream/', '');
        const track = this.context.library && this.context.library.data.tracks[trackId];
        if (!track || !track.path) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Lagu tidak ditemukan');
        }

        // Dukungan streaming cloud Google Drive & progressive cache
        if (track.path.startsWith('gdrive://') || track.cloud) {
          const gdrive = require('./gdrive');
          return gdrive.handleRemoteStream(track, req, res, MIME);
        }

        if (!fs.existsSync(track.path)) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('Lagu tidak ditemukan');
        }

        const ext = path.extname(track.path).toLowerCase();
        const mimeType = MIME[ext] || 'audio/mpeg';
        const stat = await fsp.stat(track.path);
        const size = stat.size;
        const range = req.headers.range;

        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          let start = 0;
          let end = size - 1;
          if (m) {
            if (m[1] === '' && m[2] !== '') {
              start = Math.max(0, size - parseInt(m[2], 10));
            } else {
              if (m[1] !== '') start = parseInt(m[1], 10);
              if (m[2] !== '') end = Math.min(parseInt(m[2], 10), size - 1);
            }
          }

          if (start > end || start >= size) {
            res.writeHead(416, { 'Content-Range': `bytes */${size}` });
            return res.end();
          }

          res.writeHead(206, {
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': String(end - start + 1),
            'Cache-Control': 'no-cache',
          });
          return fs.createReadStream(track.path, { start, end }).pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Type': mimeType,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(size),
            'Cache-Control': 'no-cache',
          });
          return fs.createReadStream(track.path).pipe(res);
        }
      }

      // 7. API Cover Art
      if (pathname.startsWith('/api/cover/')) {
        const trackId = pathname.replace('/api/cover/', '');
        const track = this.context.library && this.context.library.data.tracks[trackId];
        let coverPath = (track && track.custom && track.custom.cover) ||
          (track && track.meta && track.meta.cover) ||
          (track && track.cover);
        if (coverPath && !fs.existsSync(coverPath)) {
          const gdriveCoversDir = path.join(path.dirname(this.context.library.file), 'gdrive-covers');
          const fallback = path.join(gdriveCoversDir, path.basename(coverPath));
          if (fs.existsSync(fallback)) coverPath = fallback;
        }
        if (coverPath && fs.existsSync(coverPath)) {
          const ext = path.extname(coverPath).toLowerCase();
          res.writeHead(200, {
            'Content-Type': MIME[ext] || 'image/jpeg',
            'Cache-Control': 'public, max-age=604800',
          });
          return fs.createReadStream(coverPath).pipe(res);
        }
        res.writeHead(404);
        return res.end();
      }

      // 8. API Playlists
      if (pathname === '/api/playlists') {
        const rawPls = (this.context.playlists && this.context.playlists.data && this.context.playlists.data.playlists)
          ? Object.values(this.context.playlists.data.playlists)
          : [];
        const playlists = rawPls.map((pl) => {
          const trackIds = pl.trackIds || [];
          return {
            id: pl.id,
            name: pl.name,
            count: trackIds.length,
            created: pl.created,
            hasCustomCover: !!(pl.cover && fs.existsSync(pl.cover)),
            coverTrackId: trackIds.length ? trackIds[0] : null,
            trackIds,
          };
        });
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ ok: true, playlists }));
      }

      // 8a. API Playlist Operations (Add, Remove, Create)
      if (pathname === '/api/playlist/add' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const { playlistId, trackId, trackIds } = JSON.parse(body);
            const pls = this.context.playlists && this.context.playlists.data && this.context.playlists.data.playlists;
            if (!pls || !pls[playlistId]) {
              res.writeHead(404, { 'Content-Type': MIME['.json'] });
              return res.end(JSON.stringify({ ok: false, error: 'Playlist not found' }));
            }
            const p = pls[playlistId];
            if (!Array.isArray(p.trackIds)) p.trackIds = [];
            const idsToAdd = Array.isArray(trackIds) ? trackIds : (trackId ? [trackId] : []);
            const set = new Set(p.trackIds);
            for (const tid of idsToAdd) {
              if (!set.has(tid)) {
                p.trackIds.push(tid);
                set.add(tid);
              }
            }
            if (this.context.playlists.flush) this.context.playlists.flush();
            else if (this.context.playlists.save) this.context.playlists.save();
            res.writeHead(200, { 'Content-Type': MIME['.json'] });
            return res.end(JSON.stringify({ ok: true, playlist: p }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': MIME['.json'] });
            return res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }

      if (pathname === '/api/playlist/remove' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const { playlistId, trackId } = JSON.parse(body);
            const pls = this.context.playlists && this.context.playlists.data && this.context.playlists.data.playlists;
            if (!pls || !pls[playlistId]) {
              res.writeHead(404, { 'Content-Type': MIME['.json'] });
              return res.end(JSON.stringify({ ok: false, error: 'Playlist not found' }));
            }
            const p = pls[playlistId];
            p.trackIds = (p.trackIds || []).filter((id) => id !== trackId);
            if (this.context.playlists.flush) this.context.playlists.flush();
            else if (this.context.playlists.save) this.context.playlists.save();
            res.writeHead(200, { 'Content-Type': MIME['.json'] });
            return res.end(JSON.stringify({ ok: true, playlist: p }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': MIME['.json'] });
            return res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }

      if (pathname === '/api/playlist/create' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const { name, trackId, trackIds } = JSON.parse(body);
            const pls = this.context.playlists && this.context.playlists.data && this.context.playlists.data.playlists;
            if (!pls) {
              res.writeHead(500, { 'Content-Type': MIME['.json'] });
              return res.end(JSON.stringify({ ok: false, error: 'Playlists store unavailable' }));
            }
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            const idsToAdd = Array.isArray(trackIds) ? trackIds : (trackId ? [trackId] : []);
            const p = {
              id,
              name: (name || 'Playlist Baru').trim(),
              trackIds: idsToAdd,
              created: Date.now()
            };
            pls[id] = p;
            if (this.context.playlists.flush) this.context.playlists.flush();
            else if (this.context.playlists.save) this.context.playlists.save();
            res.writeHead(200, { 'Content-Type': MIME['.json'] });
            return res.end(JSON.stringify({ ok: true, playlist: p }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': MIME['.json'] });
            return res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }

      if (pathname.startsWith('/api/playlist-cover/')) {
        const plId = pathname.replace('/api/playlist-cover/', '');
        const pl = this.context.playlists && this.context.playlists.data.playlists && this.context.playlists.data.playlists[plId];
        if (pl && pl.cover && fs.existsSync(pl.cover)) {
          const ext = path.extname(pl.cover).toLowerCase();
          res.writeHead(200, { 'Content-Type': MIME[ext] || 'image/jpeg', 'Cache-Control': 'public, max-age=604800' });
          return fs.createReadStream(pl.cover).pipe(res);
        }
        res.writeHead(404);
        return res.end();
      }

      // 8b. API Lirik (Mendukung lirik bertanda waktu/LRC & lrclib online fallback)
      if (pathname.startsWith('/api/lyrics/')) {
        const trackId = pathname.replace('/api/lyrics/', '');
        const track = this.context.library && this.context.library.data.tracks[trackId];
        if (!track) {
          res.writeHead(404, { 'Content-Type': MIME['.json'] });
          return res.end(JSON.stringify({ found: false }));
        }

        if (track.custom && track.custom.lyrics && Object.keys(track.custom.lyrics).length) {
          res.writeHead(200, { 'Content-Type': MIME['.json'] });
          return res.end(JSON.stringify({ found: true, manual: true, byLang: track.custom.lyrics }));
        }

        const lyricsSvc = require('./lyrics');
        let r = await lyricsSvc.get({ track, cacheDir: this.context.lyricsCacheDir, online: false });
        if (!r || !r.found) {
          // Coba ambil online dengan timeout aman 3.5 detik
          try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500));
            r = await Promise.race([
              lyricsSvc.get({ track, cacheDir: this.context.lyricsCacheDir, online: true }),
              timeoutPromise
            ]);
          } catch (_) {
            r = { found: false };
          }
        }
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify(r || { found: false }));
      }

      // 9. API Record Play & Favorite
      if (pathname === '/api/stats/play' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.id && this.context.stats) {
              const s = this.context.stats.data.tracks[data.id] ||
                (this.context.stats.data.tracks[data.id] = { count: 0, ms: 0, last: 0 });
              s.count++;
              s.last = Date.now();
              if (data.ms && data.ms > 0) {
                s.ms += data.ms;
                this.context.stats.data.totalMs += data.ms;
              }
              this.context.stats.save();
            }
            res.writeHead(200, { 'Content-Type': MIME['.json'] });
            res.end(JSON.stringify({ ok: true }));
          } catch (_) {
            res.writeHead(400);
            res.end();
          }
        });
        return;
      }

      if (pathname === '/api/fav' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.id && this.context.library && this.context.library.data.tracks[data.id]) {
              const t = this.context.library.data.tracks[data.id];
              t.fav = !t.fav;
              this.context.library.save();
              res.writeHead(200, { 'Content-Type': MIME['.json'] });
              return res.end(JSON.stringify({ ok: true, fav: t.fav }));
            }
            res.writeHead(404);
            res.end();
          } catch (_) {
            res.writeHead(400);
            res.end();
          }
        });
        return;
      }

      // 10. API YouTube Download langsung dari Smartphone!
      if (pathname === '/api/ytdl/download' && req.method === 'POST') {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', async () => {
          try {
            const { url: ytUrl, format = 'mp3' } = JSON.parse(body);
            if (!ytUrl) {
              res.writeHead(400, { 'Content-Type': MIME['.json'] });
              return res.end(JSON.stringify({ ok: false, error: 'Tautan YouTube tidak boleh kosong.' }));
            }

            const targetDir = (this.context.settings.data.folders && this.context.settings.data.folders[0]) ||
              this.context.app.getPath('music');

            const dlRes = await this.context.ytdl.download({
              url: ytUrl,
              format,
              destDir: targetDir,
            });

            // Rescan jika berhasil
            if (dlRes.ok) {
              try {
                const scanner = require('./scanner');
                const scanRes = await scanner.scan({
                  folders: this.context.settings.data.folders,
                  existing: this.context.library.data.tracks,
                  coversDir: this.context.coversDir,
                });
                this.context.library.data.tracks = Object.fromEntries(scanRes.tracks.map((t) => [t.id, t]));
                this.context.library.flush();
              } catch (e) {
                console.error('[RemoteServer] Rescan error:', e);
              }
            }

            res.writeHead(200, { 'Content-Type': MIME['.json'] });
            res.end(JSON.stringify(dlRes));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': MIME['.json'] });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }

      // 11. API Wrapped (Statistik Spotify Wrapped di HP)
      if (pathname === '/api/wrapped') {
        const raw = this.context.stats ? this.context.stats.data : { totalMs: 0, tracks: {} };
        const rawTracks = this.context.library ? Object.values(this.context.library.data.tracks) : [];
        let withCount = rawTracks.map((t) => ({ t, r: raw.tracks[t.id] })).filter((x) => x.r && x.r.count > 0);
        let isDemo = false;
        if (!withCount.length && rawTracks.length > 0) {
          isDemo = true;
          withCount = rawTracks.slice(0, 5).map((t, idx) => ({
            t,
            r: { count: Math.max(1, 14 - idx * 2), ms: (t.duration || 210) * 1000 * Math.max(1, 14 - idx * 2) },
          }));
        }

        const topTracks = withCount.slice().sort((a, b) => b.r.count - a.r.count).slice(0, 5).map((x, i) => ({
          rank: i + 1,
          id: x.t.id,
          title: x.t.title,
          artist: x.t.displayArtist || x.t.artist || 'Artis',
          count: x.r.count,
        }));

        const artistAgg = new Map();
        const genreAgg = new Map();
        withCount.forEach(({ t, r }) => {
          const artist = t.displayArtist || t.artist || 'Artis Musik';
          artistAgg.set(artist, (artistAgg.get(artist) || 0) + r.count);
          (t.genres && t.genres.length ? t.genres : ['Pop', 'Indie', 'Acoustic']).forEach((g) => {
            genreAgg.set(g, (genreAgg.get(g) || 0) + r.count);
          });
        });

        const topArtists = [...artistAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count], i) => ({
          rank: i + 1, name, count,
        }));
        const topGenres = [...genreAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count], i) => ({
          rank: i + 1, name, count,
        }));

        const totalMs = isDemo
          ? withCount.reduce((s, x) => s + (x.r.ms || 0), 0)
          : (raw.totalMs || withCount.reduce((s, x) => s + (x.r.ms || 0), 0));

        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({
          ok: true,
          year: new Date().getFullYear(),
          minutesListened: Math.max(1, Math.round(totalMs / 60000)),
          topTracks,
          topArtists,
          topGenres,
          favCount: rawTracks.filter((t) => t.fav).length,
          libraryCount: rawTracks.length,
          isDemo,
        }));
      }

      // 12. API Playback Control (Integrasi Miku Companion & Otomasi Desktop)
      if (pathname === '/api/playback/play' && (req.method === 'POST' || req.method === 'GET')) {
        let body = '';
        const doPlay = (queryOrId) => {
          const rawTracks = this.context.library ? Object.values(this.context.library.data.tracks) : [];
          if (!rawTracks.length) {
            res.writeHead(404, { 'Content-Type': MIME['.json'] });
            return res.end(JSON.stringify({ ok: false, error: 'Pustaka musik masih kosong' }));
          }
          let targetTrack = null;
          if (queryOrId.id) {
            targetTrack = this.context.library.data.tracks[queryOrId.id];
          }
          if (!targetTrack && queryOrId.query) {
            const q = queryOrId.query.trim().toLowerCase();
            let bestScore = -1;
            let bestTrack = null;
            const escapeRegExp = (s) => s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

            for (const t of rawTracks) {
              const title = (t.custom?.title || t.meta?.title || '').toLowerCase().trim();
              const artist = (t.custom?.artist || t.meta?.artist || '').toLowerCase().trim();
              const album = (t.custom?.album || t.meta?.album || '').toLowerCase().trim();
              let score = 0;

              if (title === q) score = 100;
              else if (artist === q) score = 90;
              else if (title.startsWith(q)) score = 80;
              else if (artist.startsWith(q)) score = 70;
              else {
                try {
                  const boundaryRe = new RegExp('\\b' + escapeRegExp(q) + '\\b', 'i');
                  if (boundaryRe.test(title)) score = 65;
                  else if (boundaryRe.test(artist)) score = 60;
                } catch (_) {}
              }

              if (!score) {
                if (title.includes(q)) score = 50;
                else if (artist.includes(q)) score = 40;
                else if (album.includes(q)) score = 30;
                else {
                  const words = q.split(/\s+/).filter((w) => w.length > 1);
                  if (words.length > 1 && words.every((w) => `${title} ${artist}`.includes(w))) {
                    score = 25;
                  }
                }
              }

              if (score > bestScore) {
                bestScore = score;
                bestTrack = t;
              }
            }
            if (bestScore > 0) targetTrack = bestTrack;
          }

          if (!targetTrack) {
            res.writeHead(404, { 'Content-Type': MIME['.json'] });
            return res.end(JSON.stringify({ ok: false, error: `Lagu tidak ditemukan untuk query: '${queryOrId.query || queryOrId.id}'` }));
          }

          // Trigger pemutaran di window desktop
          if (this.context.getMainWindow) {
            const win = this.context.getMainWindow();
            if (win && !win.isDestroyed()) {
              if (win.isMinimized()) win.restore();
              win.show();
              win.webContents.executeJavaScript(`
                if (window.RD && window.RD.startQueue) {
                  window.RD.startQueue(['${targetTrack.id}'], 0);
                  true;
                } else false;
              `).catch((err) => console.error('[RemoteServer] Play exec error:', err));
            }
          }

          const c = targetTrack.custom || {};
          const m = targetTrack.meta || {};
          const baseTitle = c.title || m.title || targetTrack.id;
          const displayArtist = c.artist || m.artist || 'Artis Tidak Diketahui';

          res.writeHead(200, { 'Content-Type': MIME['.json'] });
          return res.end(JSON.stringify({
            ok: true,
            message: `Memutar lagu: ${baseTitle} - ${displayArtist}`,
            track: {
              id: targetTrack.id,
              title: baseTitle,
              artist: displayArtist,
              album: c.album || m.album || 'Tanpa Album',
              duration: targetTrack.duration || 0,
            },
          }));
        };

        if (req.method === 'POST') {
          req.on('data', (c) => { body += c; });
          req.on('end', () => {
            try {
              const data = body ? JSON.parse(body) : {};
              doPlay(data);
            } catch (e) {
              doPlay({ query: '' });
            }
          });
        } else {
          const qParam = reqUrl.searchParams.get('query') || '';
          const idParam = reqUrl.searchParams.get('id') || '';
          doPlay({ query: qParam, id: idParam });
        }
        return;
      }

      // 13. API Playback Control Actions (pause, resume, toggle, next, prev)
      if (pathname.startsWith('/api/playback/control/')) {
        const action = pathname.replace('/api/playback/control/', '').toLowerCase();
        if (this.context.getMainWindow) {
          const win = this.context.getMainWindow();
          if (win && !win.isDestroyed()) {
            if (action === 'pause') win.webContents.executeJavaScript('if (window.RD?.pause) window.RD.pause();');
            else if (action === 'resume' || action === 'play') win.webContents.executeJavaScript('if (window.RD?.play) window.RD.play();');
            else if (action === 'toggle') win.webContents.executeJavaScript('if (window.RD?.togglePlay) window.RD.togglePlay();');
            else if (action === 'next') win.webContents.executeJavaScript('if (window.RD?.next) window.RD.next();');
            else if (action === 'prev') win.webContents.executeJavaScript('if (window.RD?.prev) window.RD.prev();');
          }
        }
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        return res.end(JSON.stringify({ ok: true, action }));
      }

      // Default: 404
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } catch (err) {
      console.error('[RemoteServer] Handler error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error: ' + err.message);
    }
  }
}

const remoteServer = new RemoteServer();
module.exports = remoteServer;