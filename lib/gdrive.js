'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { Readable, PassThrough } = require('stream');
const { shell } = require('electron');

let userDataDir = '';
let cacheDir = '';
let coversDir = '';
let catalogFile = '';
let indexFile = '';
let settings = null;
let statsStore = null;

// High performance connection pooling agent with Keep-Alive
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 32,
  maxFreeSockets: 10,
  timeout: 45000
});

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function init(dir, settingsStore, stats) {
  userDataDir = dir;
  settings = settingsStore;
  statsStore = stats;
  cacheDir = path.join(dir, 'gdrive-cache');
  coversDir = path.join(dir, 'gdrive-covers');
  catalogFile = path.join(dir, 'gdrive-catalog.json');
  indexFile = path.join(dir, 'gdrive-cache-index.json');

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(coversDir, { recursive: true });

  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, JSON.stringify({ accessed: {} }, null, 2));
  }
  loadKnownSizes();
}

let knownSizes = new Map();

function loadKnownSizes() {
  try {
    const libPath = path.join(userDataDir, 'library.json');
    if (fs.existsSync(libPath)) {
      const data = JSON.parse(fs.readFileSync(libPath, 'utf8'));
      if (data && data.tracks) {
        for (const t of Object.values(data.tracks)) {
          const fid = t.gdriveId || parseFileId(t.path);
          if (fid && t.size) knownSizes.set(fid, t.size);
        }
      }
    }
  } catch (_) {}
}

function getCacheIndex() {
  try {
    return JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  } catch (_) {
    return { accessed: {} };
  }
}

function saveCacheIndex(idx) {
  try {
    fs.writeFileSync(indexFile, JSON.stringify(idx, null, 2));
  } catch (_) {}
}

function touchCache(fileId) {
  const idx = getCacheIndex();
  idx.accessed[fileId] = Date.now();
  saveCacheIndex(idx);
}

function getCachedPath(fileId) {
  if (!fileId || !fs.existsSync(cacheDir)) return null;
  try {
    const files = fs.readdirSync(cacheDir);
    const hit = files.find(f => !f.startsWith('.tmp_') && (f === fileId || f.startsWith(fileId + '.')));
    if (hit) {
      const p = path.join(cacheDir, hit);
      const stat = fs.statSync(p);
      if (stat.size > 0) return p;
    }
  } catch (_) {}
  return null;
}

function getFolderUrls() {
  if (settings && settings.data) {
    if (Array.isArray(settings.data.gdriveFolderUrls) && settings.data.gdriveFolderUrls.length > 0) {
      return settings.data.gdriveFolderUrls;
    }
    if (settings.data.gdriveFolderUrl) {
      return [settings.data.gdriveFolderUrl];
    }
  }
  return ['https://drive.google.com/drive/folders/1sVsVhxeQns63ltyyBpzm4LYSj1M6s-b3?usp=sharing'];
}

function getMaxCacheLimit() {
  if (settings && settings.data && typeof settings.data.gdriveMaxCache === 'number' && settings.data.gdriveMaxCache > 0) {
    return settings.data.gdriveMaxCache;
  }
  return 50;
}

function getStats() {
  let cachedCount = 0;
  let cacheBytes = 0;
  try {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir).filter(f => !f.startsWith('.tmp_'));
      cachedCount = files.length;
      files.forEach(f => {
        try {
          cacheBytes += fs.statSync(path.join(cacheDir, f)).size;
        } catch (_) {}
      });
    }
  } catch (_) {}

  let totalCatalogTracks = 0;
  let totalCovers = 0;
  try {
    if (fs.existsSync(catalogFile)) {
      const cat = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
      totalCatalogTracks = (cat.tracks && cat.tracks.length) || 0;
      totalCovers = (cat.covers && cat.covers.length) || 0;
    }
    if (fs.existsSync(coversDir)) {
      const cFiles = fs.readdirSync(coversDir);
      if (cFiles.length > totalCovers) totalCovers = cFiles.length;
    }
  } catch (_) {}

  const folderUrls = getFolderUrls();
  const maxCache = getMaxCacheLimit();

  return {
    enabled: true,
    folderUrl: folderUrls[0] || '',
    folderUrls,
    cachedCount,
    maxCache,
    cacheBytes,
    cacheSizeFormatted: formatBytes(cacheBytes),
    totalCatalogTracks,
    totalCovers,
    cacheDir,
    coversDir
  };
}

function evictIfNeeded(max = getMaxCacheLimit()) {
  try {
    if (!fs.existsSync(cacheDir)) return;
    const files = fs.readdirSync(cacheDir).filter(f => !f.startsWith('.tmp_'));
    if (files.length <= max) return;

    const idx = getCacheIndex();
    const st = (statsStore && statsStore.data && statsStore.data.tracks) || {};

    const scored = files.map(f => {
      const p = path.join(cacheDir, f);
      const fileId = f.split('.')[0];
      const stat = fs.statSync(p);
      const accessTime = idx.accessed[fileId] || stat.mtimeMs || 0;

      let playCount = 0;
      let lastPlay = accessTime;
      for (const trackStat of Object.values(st)) {
        if (trackStat.count) {
          playCount = Math.max(playCount, trackStat.count);
          if (trackStat.last) lastPlay = Math.max(lastPlay, trackStat.last);
        }
      }

      const score = (playCount * 86400000) + lastPlay;
      return { file: f, path: p, score };
    });

    scored.sort((a, b) => a.score - b.score);

    const toRemove = scored.slice(0, files.length - max);
    toRemove.forEach(item => {
      try {
        fs.unlinkSync(item.path);
        const fId = item.file.split('.')[0];
        delete idx.accessed[fId];
      } catch (_) {}
    });
    saveCacheIndex(idx);
  } catch (err) {
    console.error('Error during cache eviction:', err.message);
  }
}

function clearCache() {
  try {
    if (fs.existsSync(cacheDir)) {
      const files = fs.readdirSync(cacheDir);
      files.forEach(f => {
        try { fs.unlinkSync(path.join(cacheDir, f)); } catch (_) {}
      });
    }
    saveCacheIndex({ accessed: {} });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function parseFileId(uri) {
  if (!uri) return null;
  if (uri.startsWith('gdrive://')) {
    const raw = uri.replace('gdrive://', '');
    const slash = raw.indexOf('/');
    return slash === -1 ? raw : raw.slice(0, slash);
  }
  return uri;
}

function parseExt(uri) {
  if (!uri) return '.flac';
  const clean = uri.split('?')[0];
  const ext = path.extname(clean);
  return ext || '.flac';
}

// ============================================================
// Single-Pass Progressive Download & Immediate 15s Burst Engine
// ============================================================
const activeDownloads = new Map(); // fileId -> ActiveDownload

class ActiveDownload {
  constructor(fileId, ext, mimeType, knownSize = 0) {
    this.fileId = fileId;
    this.ext = ext || '.flac';
    this.mimeType = mimeType || 'audio/flac';
    this.tmpPath = path.join(cacheDir, `.tmp_${fileId}${this.ext}`);
    this.finalPath = path.join(cacheDir, `${fileId}${this.ext}`);
    this.bytesDownloaded = 0;
    this.totalSize = knownSize || 0;
    this.statusCode = 200;
    this.headers = {};
    this.isDone = false;
    this.error = null;
    this.readyResolvers = [];
    this.isReady = knownSize > 0;
    this.initialChunks = [];
    this.liveClients = new Set();
    this.writer = null;
    this.started = false;

    // Buffer tail paralel untuk membaca metadata akhir (WAV LIST/INFO, M4A moov) tanpa lag
    this.tailBuffer = null;
    this.tailStart = (knownSize > 512 * 1024) ? (knownSize - 512 * 1024) : 0;
    this.tailResolvers = [];
  }

  waitUntilReady() {
    if (this.isReady) return Promise.resolve(this);
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => {
      this.readyResolvers.push({ resolve, reject });
    });
  }

  notifyReady() {
    this.isReady = true;
    for (const r of this.readyResolvers) r.resolve(this);
    this.readyResolvers = [];
  }

  notifyError(err) {
    this.error = err;
    for (const r of this.readyResolvers) r.reject(err);
    this.readyResolvers = [];
    for (const client of this.liveClients) {
      try { client.destroy(err); } catch (_) {}
    }
    this.liveClients.clear();
  }

  streamFrom(start) {
    const pt = new PassThrough();
    // Kirim chunk yang sudah ada di RAM (dislice dari offset start)
    for (const item of this.initialChunks) {
      if (start < item.end) {
        const sliceStart = Math.max(0, start - item.start);
        const buf = sliceStart === 0 ? item.chunk : item.chunk.subarray(sliceStart);
        try {
          if (!pt.destroyed && !pt.writableEnded) pt.write(buf);
        } catch (_) {}
      }
    }

    if (!this.isDone) {
      this.liveClients.add(pt);
      pt.on('close', () => {
        this.liveClients.delete(pt);
      });
    } else {
      if (!pt.writableEnded) pt.end();
    }
    return pt;
  }

  async getTail(start, end) {
    if (!this.tailBuffer) {
      await new Promise(r => this.tailResolvers.push(r));
    }
    const offset = Math.max(0, start - this.tailStart);
    const endOffset = Math.min(this.tailBuffer.length, end - this.tailStart + 1);
    return this.tailBuffer.subarray(offset, endOffset);
  }

  start() {
    if (this.started) return;
    this.started = true;

    try {
      this.writer = fs.createWriteStream(this.tmpPath);
    } catch (e) {
      this.notifyError(e);
      return;
    }

    const streamUrl = `https://drive.usercontent.google.com/download?id=${this.fileId}&export=download`;

    // Ambil 512KB tail secara paralel untuk WAV/M4A/AAC jika totalSize sudah diketahui
    const needsTail = (this.ext === '.wav' || this.ext === '.m4a' || this.ext === '.aac');
    if (needsTail && this.totalSize > 512 * 1024) {
      this.tailStart = this.totalSize - 512 * 1024;
      https.get(streamUrl, {
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Range': `bytes=${this.tailStart}-${this.totalSize - 1}`
        }
      }, (tailRes) => {
        const chunks = [];
        tailRes.on('data', c => chunks.push(c));
        tailRes.on('end', () => {
          this.tailBuffer = Buffer.concat(chunks);
          for (const r of this.tailResolvers) r(this.tailBuffer);
          this.tailResolvers = [];
        });
        tailRes.on('error', () => {
          this.tailBuffer = Buffer.alloc(0);
          for (const r of this.tailResolvers) r(this.tailBuffer);
          this.tailResolvers = [];
        });
      }).on('error', () => {
        this.tailBuffer = Buffer.alloc(0);
        for (const r of this.tailResolvers) r(this.tailBuffer);
        this.tailResolvers = [];
      });
    }

    const fetchGdrive = (url) => {
      const opts = {
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Range': 'bytes=0-'
        }
      };

      const req = https.get(url, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchGdrive(res.headers.location);
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          const err = new Error(`Google Drive returned HTTP ${res.statusCode}`);
          this.notifyError(err);
          activeDownloads.delete(this.fileId);
          try { fs.unlinkSync(this.tmpPath); } catch (_) {}
          return;
        }

        this.statusCode = res.statusCode;
        this.headers = res.headers;

        let total = parseInt(res.headers['content-length'] || '0', 10);
        if (res.headers['content-range']) {
          const m = res.headers['content-range'].match(/\/(\d+)/);
          if (m) total = parseInt(m[1], 10);
        }
        if (total > 0) this.totalSize = total;
        this.notifyReady();

        // Jika tail belum sempat di-request karena totalSize sebelumnya 0:
        if (needsTail && !this.tailBuffer && total > 512 * 1024 && this.tailStart === 0) {
          this.tailStart = total - 512 * 1024;
          https.get(streamUrl, {
            agent: httpsAgent,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Range': `bytes=${this.tailStart}-${total - 1}`
            }
          }, (tailRes) => {
            const chunks = [];
            tailRes.on('data', c => chunks.push(c));
            tailRes.on('end', () => {
              this.tailBuffer = Buffer.concat(chunks);
              for (const r of this.tailResolvers) r(this.tailBuffer);
              this.tailResolvers = [];
            });
          });
        }

        res.on('data', (chunk) => {
          const prevBytes = this.bytesDownloaded;
          this.bytesDownloaded += chunk.length;
          if (this.writer) this.writer.write(chunk);

          // Simpan burst awal 8MB di memori untuk pengiriman instan (termasuk resume pasca header)
          if (this.bytesDownloaded <= 8 * 1024 * 1024) {
            this.initialChunks.push({ chunk, start: prevBytes, end: this.bytesDownloaded });
          }

          // Teruskan ke klien pemutar secara langsung
          for (const client of this.liveClients) {
            try {
              if (!client.destroyed && !client.writableEnded) {
                client.write(chunk);
              }
            } catch (_) {}
          }
        });

        res.on('end', () => {
          if (this.writer) {
            this.writer.end(() => {
              try {
                if (fs.existsSync(this.tmpPath) && fs.statSync(this.tmpPath).size > 0) {
                  fs.renameSync(this.tmpPath, this.finalPath);
                  this.isDone = true;
                  touchCache(this.fileId);
                  evictIfNeeded(50);
                }
              } catch (_) {}

              for (const client of this.liveClients) {
                try {
                  if (!client.writableEnded) client.end();
                } catch (_) {}
              }
              this.liveClients.clear();
              this.initialChunks = [];
              this.tailBuffer = null;
              activeDownloads.delete(this.fileId);
            });
          }
        });

        res.on('error', (err) => {
          this.notifyError(err);
          activeDownloads.delete(this.fileId);
          try { fs.unlinkSync(this.tmpPath); } catch (_) {}
        });
      });

      req.on('error', (err) => {
        this.notifyError(err);
        activeDownloads.delete(this.fileId);
        try { fs.unlinkSync(this.tmpPath); } catch (_) {}
      });
    };

    fetchGdrive(streamUrl);
  }
}

function getOrCreateActiveDownload(fileId, ext, mimeType) {
  let ad = activeDownloads.get(fileId);
  if (!ad) {
    const knownSize = knownSizes.get(fileId) || 0;
    ad = new ActiveDownload(fileId, ext, mimeType, knownSize);
    activeDownloads.set(fileId, ad);
    ad.start();
  }
  return ad;
}

// Pre-fetch track in background (for the upcoming song in queue)
function prefetch(fileId, filePath) {
  if (!fileId) return;
  const cached = getCachedPath(fileId);
  if (cached) return;
  const ext = parseExt(filePath);
  getOrCreateActiveDownload(fileId, ext, 'audio/flac');
}

function getTrackStatus(fileId) {
  if (!fileId) return { cached: false, progress: 0, isDone: false };
  const cached = getCachedPath(fileId);
  if (cached) return { cached: true, progress: 1.0, isDone: true };
  const ad = activeDownloads.get(fileId);
  if (ad) {
    if (ad.isDone) return { cached: true, progress: 1.0, isDone: true };
    const pct = ad.totalSize > 0 ? (ad.bytesDownloaded / ad.totalSize) : 0;
    return {
      cached: false,
      progress: Math.min(1.0, Math.max(0, pct)),
      bytes: ad.bytesDownloaded,
      total: ad.totalSize,
      isDone: false
    };
  }
  return { cached: false, progress: 0, isDone: false };
}

function fetchExactGdriveRange(fileId, start, end, mimeType) {
  return new Promise((resolve) => {
    const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
    const opts = {
      agent: httpsAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Range': `bytes=${start}-${end}`
      }
    };
    function doReq(targetUrl) {
      https.get(targetUrl, opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doReq(res.headers.location);
        }
        const status = res.statusCode === 206 ? 206 : 200;
        const resHeaders = {
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Content-Range': res.headers['content-range'] || `bytes ${start}-${end}/*`,
          'Content-Length': res.headers['content-length'] || String(end - start + 1),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        };
        resolve(new Response(Readable.toWeb(res), { status, headers: resHeaders }));
      }).on('error', () => {
        resolve(new Response('Range seek error', { status: 502 }));
      });
    }
    doReq(url);
  });
}

async function handleMediaRequest(fileUrl, request, MIME) {
  const fileId = parseFileId(fileUrl);
  const ext = parseExt(fileUrl).toLowerCase();
  const mimeType = (MIME && MIME[ext]) || 'audio/flac';

  // 1. Check local 50-song cache first (instant local playback)
  const cachedPath = getCachedPath(fileId);
  if (cachedPath) {
    try {
      touchCache(fileId);
      const stat = await fsp.stat(cachedPath);
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
        if (start > end || start >= size) {
          return new Response('Range Not Satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
        }
        status = 206;
      }
      const headers = {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      };
      if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      const body = Readable.toWeb(fs.createReadStream(cachedPath, { start, end }));
      return new Response(body, { status, headers });
    } catch (_) {}
  }

  // 2. Uncached track: Single-Pass Progressive Download & Immediate 15s Burst
  const ad = getOrCreateActiveDownload(fileId, ext, mimeType);
  await ad.waitUntilReady();

  const totalSize = ad.totalSize || 40000000;
  const range = request.headers.get('range');
  let start = 0;
  let end = totalSize - 1;
  let status = 206;

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      if (m[1] === '' && m[2] !== '') { start = Math.max(0, totalSize - parseInt(m[2], 10)); }
      else {
        if (m[1] !== '') start = parseInt(m[1], 10);
        if (m[2] !== '') end = Math.min(parseInt(m[2], 10), totalSize - 1);
      }
    }
  }

  const resHeaders = {
    'Content-Type': mimeType,
    'Accept-Ranges': 'bytes',
    'Content-Range': `bytes ${start}-${end}/${totalSize}`,
    'Content-Length': String(end - start + 1),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };

  // 1. Kasus start <= 8MB (termasuk start === 0 dan resume pasca-header):
  // Disajikan INSTAN dari RAM memori (0ms delay), sembari stream download berjalan penuh ke disk.
  if (start <= 8 * 1024 * 1024) {
    const pt = ad.streamFrom(start);
    return new Response(Readable.toWeb(pt), { status, headers: resHeaders });
  }

  // 2. Kasus request tail metadata (WAV LIST/INFO atau M4A moov):
  // Disajikan langsung dari buffer tail paralel tanpa menunggu download byte tengah
  if (ad.tailStart > 0 && start >= ad.tailStart) {
    const tailData = await ad.getTail(start, end);
    return new Response(tailData, { status, headers: resHeaders });
  }

  // 3. Jika file sudah selesai terunduh penuh ke disk
  if (ad.isDone || fs.existsSync(ad.finalPath)) {
    try {
      const p = fs.existsSync(ad.finalPath) ? ad.finalPath : ad.tmpPath;
      const body = Readable.toWeb(fs.createReadStream(p, { start, end }));
      return new Response(body, { status, headers: resHeaders });
    } catch (_) {}
  }

  // 4. Seeking ke rentang audio yang sudah tersimpan di file temporer disk (.tmp_)
  if (end < ad.bytesDownloaded && fs.existsSync(ad.tmpPath)) {
    try {
      const body = Readable.toWeb(fs.createReadStream(ad.tmpPath, { start, end }));
      return new Response(body, { status, headers: resHeaders });
    } catch (_) {}
  }

  // 5. Seeking ke bagian depan yang belum terunduh:
  // Ambil byte range tepat langsung dari Google Drive (menghilangkan derau/suara "ksss...")
  return fetchExactGdriveRange(fileId, start, end, mimeType);
}

// For mobile companion (lib/remoteServer.js)
function handleRemoteStream(track, req, res, MIME) {
  const fileId = track.gdriveId || parseFileId(track.path);
  const cached = getCachedPath(fileId);

  if (cached) {
    const stat = fs.statSync(cached);
    const size = stat.size;
    const ext = path.extname(cached).toLowerCase();
    const mimeType = (MIME && MIME[ext]) || 'audio/flac';
    const range = req.headers.range;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = 0;
      let end = size - 1;
      if (m) {
        if (m[1] === '' && m[2] !== '') start = Math.max(0, size - parseInt(m[2], 10));
        else {
          if (m[1] !== '') start = parseInt(m[1], 10);
          if (m[2] !== '') end = Math.min(parseInt(m[2], 10), size - 1);
        }
      }
      res.writeHead(206, {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
        'Cache-Control': 'no-cache',
      });
      return fs.createReadStream(cached, { start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(size),
        'Cache-Control': 'no-cache',
      });
      return fs.createReadStream(cached).pipe(res);
    }
  }

  // Progressive streaming for mobile
  const ext = parseExt(track.path);
  const mimeType = (MIME && MIME[ext]) || 'audio/flac';
  const ad = getOrCreateActiveDownload(fileId, ext, mimeType);

  ad.waitUntilReady().then(() => {
    const totalSize = ad.totalSize || 40000000;
    const range = req.headers.range;
    let start = 0;
    let end = totalSize - 1;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        if (m[1] === '' && m[2] !== '') start = Math.max(0, totalSize - parseInt(m[2], 10));
        else {
          if (m[1] !== '') start = parseInt(m[1], 10);
          if (m[2] !== '') end = Math.min(parseInt(m[2], 10), totalSize - 1);
        }
      }
    }

    res.writeHead(206, {
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Content-Length': String(end - start + 1),
      'Cache-Control': 'no-cache',
    });

    if (start <= 8 * 1024 * 1024) {
      const pt = ad.streamFrom(start);
      pt.pipe(res);
      res.on('close', () => {
        try { pt.destroy(); } catch (_) {}
      });
      return;
    }

    if (ad.tailStart > 0 && start >= ad.tailStart) {
      ad.getTail(start, end).then(tailData => {
        res.end(tailData);
      }).catch(() => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
      return;
    }

    if (end < ad.bytesDownloaded && fs.existsSync(ad.tmpPath)) {
      return fs.createReadStream(ad.tmpPath, { start, end }).pipe(res);
    }

    // Direct exact range seek from Google Drive
    const streamUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
    function doProxy(targetUrl) {
      https.get(targetUrl, {
        agent: httpsAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Range': `bytes=${start}-${end}`
        }
      }, (gres) => {
        if (gres.statusCode >= 300 && gres.statusCode < 400 && gres.headers.location) {
          return doProxy(gres.headers.location);
        }
        gres.pipe(res);
      }).on('error', () => {
        if (!res.headersSent) res.writeHead(502);
        res.end();
      });
    }
    doProxy(streamUrl);
  }).catch(() => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
}

function openFolder(type) {
  if (type === 'covers') {
    shell.openPath(coversDir);
  } else {
    shell.openPath(cacheDir);
  }
}

// Helper to fetch and inspect Google Drive public folders without auth
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent: httpsAgent, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function extractNodeName(node) {
  try {
    if (node[35] && node[35][0] && node[35][0][0] && typeof node[35][0][0][0] === 'string') {
      return node[35][0][0][0];
    }
  } catch (_) {}
  try {
    if (node[37] && node[37][0] && node[37][0][0] && typeof node[37][0][0][0] === 'string') {
      return node[37][0][0][0];
    }
  } catch (_) {}
  try {
    const s = JSON.stringify(node[24]);
    const m = s.match(/\"([^\"]+\.(flac|mp3|m4a|wav|ogg|aac|alac|opus|jpg|jpeg|png))\"/i);
    if (m) return m[1];
  } catch (_) {}
  return null;
}

async function inspectFolder(folderId) {
  try {
    const url = 'https://drive.google.com/drive/folders/' + folderId;
    const html = await httpGet(url);
    const m = html.match(/AF_initDataCallback\((\{key:\s*'ds:3'[\s\S]*?\})\);<\/script>/);
    if (!m) return [];
    const fn = new Function('return ' + m[1]);
    const obj = fn();
    const files = [];
    function search(node) {
      if (!node) return;
      if (Array.isArray(node)) {
        if (node.length > 5 && Array.isArray(node[0]) && node[0].length >= 2 && typeof node[0][1] === 'string' && typeof node[4] === 'string') {
          const id = node[0][1];
          const mime = node[4];
          const name = extractNodeName(node);
          if (id && name) {
            files.push({ id, mime, name });
          }
        }
        for (const child of node) search(child);
      }
    }
    search(obj.data);
    return files;
  } catch (_) {
    return [];
  }
}

async function downloadCover(coverId, filename) {
  const target = path.join(coversDir, filename);
  if (fs.existsSync(target) && fs.statSync(target).size > 0) return target;
  return new Promise((resolve) => {
    const url = `https://drive.usercontent.google.com/download?id=${coverId}&export=download`;
    https.get(url, { agent: httpsAgent }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, { agent: httpsAgent }, writePipe);
        return;
      }
      writePipe(res);
    }).on('error', () => resolve(null));

    function writePipe(res) {
      if (res.statusCode !== 200) return resolve(null);
      const out = fs.createWriteStream(target);
      res.pipe(out);
      out.on('finish', () => resolve(target));
      out.on('error', () => resolve(null));
    }
  });
}

function parseFolderIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const m2 = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(url.trim())) return url.trim();
  return null;
}

async function sync(folderUrl, onProgress, libraryStore) {
  try {
    const folderId = parseFolderIdFromUrl(folderUrl) || '1sVsVhxeQns63ltyyBpzm4LYSj1M6s-b3';
    if (onProgress) onProgress({ current: 0, total: 100, text: 'Memulai pemindaian folder Google Drive...' });

    // Read existing catalog
    let catalog = { folders: {}, tracks: [], covers: [] };
    if (fs.existsSync(catalogFile)) {
      try { catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8')); } catch (_) {}
    }

    // Inspect root folder
    const rootFiles = await inspectFolder(folderId);
    const AUDIO_EXTS = ['.flac', '.wav', '.mp3', '.m4a', '.ogg', '.aac', '.opus'];
    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

    const queue = [];
    rootFiles.forEach(f => {
      if (f.mime === 'application/vnd.google-apps.folder') {
        queue.push({ id: f.id, name: f.name, parentName: '' });
      } else {
        const ext = path.extname(f.name).toLowerCase();
        if (AUDIO_EXTS.includes(ext)) {
          if (!catalog.tracks.some(t => t.id === f.id)) {
            catalog.tracks.push({ id: f.id, name: f.name, ext, folderName: '', folderId });
          }
        } else if (IMAGE_EXTS.includes(ext) || f.name.toLowerCase().includes('cover')) {
          if (!catalog.covers.some(c => c.id === f.id)) {
            catalog.covers.push({ id: f.id, name: f.name, folderName: '', folderId });
          }
        }
      }
    });

    let scanned = 0;
    const totalToScan = queue.length;
    while (queue.length > 0) {
      const item = queue.shift();
      const files = await inspectFolder(item.id);
      catalog.folders[item.id] = { name: item.name, parent: item.parentName, filesCount: files.length };
      files.forEach(f => {
        if (f.mime === 'application/vnd.google-apps.folder') {
          queue.push({ id: f.id, name: f.name, parentName: item.name });
        } else {
          const ext = path.extname(f.name).toLowerCase();
          if (AUDIO_EXTS.includes(ext)) {
            if (!catalog.tracks.some(t => t.id === f.id)) {
              catalog.tracks.push({
                id: f.id,
                name: f.name,
                ext,
                folderName: item.parentName ? `${item.parentName}/${item.name}` : item.name,
                folderId: item.id
              });
            }
          } else if (IMAGE_EXTS.includes(ext) || f.name.toLowerCase().includes('cover')) {
            if (!catalog.covers.some(c => c.id === f.id)) {
              catalog.covers.push({
                id: f.id,
                name: f.name,
                folderName: item.parentName ? `${item.parentName}/${item.name}` : item.name,
                folderId: item.id
              });
            }
          }
        }
      });
      scanned++;
      if (onProgress && scanned % 5 === 0) {
        onProgress({ current: scanned, total: totalToScan, text: `Memindai ${scanned}/${totalToScan} folder (${catalog.tracks.length} lagu)...` });
      }
    }

    fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2));

    // Download any missing covers
    if (onProgress) onProgress({ current: scanned, total: totalToScan, text: 'Memeriksa sampul album...' });
    for (const c of catalog.covers) {
      const coverExt = path.extname(c.name) || '.jpg';
      const coverFileName = `${c.folderId || c.id}${coverExt}`;
      await downloadCover(c.id, coverFileName);
    }

    // Merge tracks into libraryStore if provided
    if (libraryStore && libraryStore.data && libraryStore.data.tracks) {
      let mergedCount = 0;
      catalog.tracks.forEach(gt => {
        const leaf = gt.name.toLowerCase().normalize('NFKC');
        let existing = Object.values(libraryStore.data.tracks).find(t =>
          path.basename(t.path).toLowerCase().normalize('NFKC') === leaf ||
          (t.gdriveId && t.gdriveId === gt.id)
        );

        if (existing) {
          existing.gdriveId = gt.id;
          existing.cloud = true;
          existing.path = `gdrive://${gt.id}/${gt.name}`;
          mergedCount++;
        } else {
          // Add new cloud track
          const tid = crypto.createHash('md5').update(gt.id).digest('hex').slice(0, 16);
          const ext = gt.ext || path.extname(gt.name).toLowerCase();
          const isFlac = ext === '.flac';
          const isWav = ext === '.wav';
          libraryStore.data.tracks[tid] = {
            id: tid,
            path: `gdrive://${gt.id}/${gt.name}`,
            cloud: true,
            gdriveId: gt.id,
            size: 0,
            mtimeMs: Date.now(),
            added: Date.now(),
            meta: {
              title: gt.name.replace(/\.[^.]+$/, '').replace(/^\d+[\s_-]*/, ''),
              artist: gt.folderName ? gt.folderName.split('-')[0].trim() : 'Unknown Artist',
              album: gt.folderName || 'Google Drive',
              year: 2024,
              track: 1,
              disc: 1,
              cover: path.join(coversDir, `${gt.folderId || gt.id}.jpg`)
            },
            duration: 0,
            bitrate: isFlac ? 1412 : 320,
            codec: ext.replace('.', '').toUpperCase(),
            fmt: {
              codec: ext.replace('.', '').toUpperCase(),
              lossless: isFlac || isWav,
              sampleRate: 44100,
              bitDepth: 16,
              channels: 2,
              bitrate: isFlac ? 1412 : 320,
              vbr: false,
              atmos: false
            },
            custom: {}
          };
          mergedCount++;
        }
      });
      libraryStore.flush();
    }

    if (onProgress) onProgress({ current: totalToScan, total: totalToScan, text: 'Sinkronisasi selesai!' });
    return { ok: true, tracksCount: catalog.tracks.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function syncAll(folderUrls, onProgress, libraryStore) {
  if (!Array.isArray(folderUrls) || folderUrls.length === 0) {
    folderUrls = getFolderUrls();
  }
  let totalTracks = 0;
  for (let i = 0; i < folderUrls.length; i++) {
    const fUrl = folderUrls[i];
    if (onProgress) {
      onProgress({
        current: i + 1,
        total: folderUrls.length,
        text: `Memindai folder cloud (${i + 1}/${folderUrls.length})...`
      });
    }
    const res = await sync(fUrl, (p) => {
      if (onProgress) {
        onProgress({
          current: p.current,
          total: p.total,
          text: `[Folder ${i + 1}/${folderUrls.length}] ${p.text}`
        });
      }
    }, libraryStore);
    if (res && res.tracksCount) totalTracks = Math.max(totalTracks, res.tracksCount);
  }
  return { ok: true, tracksCount: totalTracks };
}

module.exports = {
  init,
  getStats,
  getCachedPath,
  touchCache,
  evictIfNeeded,
  clearCache,
  handleMediaRequest,
  handleRemoteStream,
  getTrackStatus,
  prefetch,
  openFolder,
  sync,
  syncAll,
  getFolderUrls,
  getMaxCacheLimit,
  parseFolderIdFromUrl,
  parseFileId,
  parseExt
};
