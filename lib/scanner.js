'use strict';
// Memindai folder musik: membaca tag, mengekstrak sampul album, dan memakai ulang
// data lama bila file tidak berubah (pemindaian ulang jadi cepat).
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { extractFormat, FMT_VERSION } = require('./audioformat');

const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav']);
const COVER_RANK = ['cover', 'folder', 'front', 'album', 'albumart', 'artwork'];
const COVER_RE = /^(cover|folder|front|album|albumart|artwork)\.(jpe?g|png|webp)$/i;

const sha1 = (v) => crypto.createHash('sha1').update(v).digest('hex');
const trackId = (p) => sha1(p).slice(0, 16);

function mimeToExt(mime = '') {
  if (/png/i.test(mime)) return '.png';
  if (/webp/i.test(mime)) return '.webp';
  return '.jpg';
}

async function isReadable(dir) {
  try { await fs.access(dir); return true; } catch (_) { return false; }
}

// Kumpulkan semua file audio + kandidat sampul folder (cover.jpg, folder.png, ...)
async function collect(folders) {
  const files = [];
  const dirCovers = new Map(); // dir -> { rank, file }
  async function rec(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await rec(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (AUDIO_EXT.has(ext)) {
          files.push(full);
        } else if (COVER_RE.test(e.name)) {
          const rank = COVER_RANK.indexOf(e.name.replace(/\.[^.]+$/, '').toLowerCase());
          const cur = dirCovers.get(dir);
          if (!cur || rank < cur.rank) dirCovers.set(dir, { rank, file: full });
        }
      }
    }
  }
  for (const f of folders) await rec(f);
  return { files, dirCovers };
}

async function readMeta(mm, file, coversDir, writtenCovers) {
  const md = await mm.parseFile(file);
  const c = md.common;
  const f = md.format;
  let cover = null;
  let coverSource = null;
  const pic = c.picture && c.picture[0];
  if (pic && pic.data && pic.data.length) {
    const name = sha1(Buffer.from(pic.data)).slice(0, 20) + mimeToExt(pic.format);
    const out = path.join(coversDir, name);
    if (!writtenCovers.has(name)) {
      try { await fs.access(out); } catch (_) { await fs.writeFile(out, pic.data); }
      writtenCovers.add(name);
    }
    cover = out;
    coverSource = 'embedded';
  }
  const year = c.year || (c.date ? parseInt(c.date, 10) : null) || null;
  return {
    meta: {
      title: c.title || path.basename(file, path.extname(file)),
      artist: c.artist || (c.artists && c.artists.join(', ')) || '',
      album: c.album || '',
      albumArtist: c.albumartist || '',
      year: Number.isFinite(year) ? year : null,
      genre: (c.genre || []).join(', '),
      track: (c.track && c.track.no) || null,
      disc: (c.disk && c.disk.no) || null,
      cover,
      coverSource,
    },
    duration: f.duration || 0,
    bitrate: f.bitrate ? Math.round(f.bitrate / 1000) : 0,
    codec: f.codec || f.container || '',
    fmt: await extractFormat(file, f),
  };
}

/**
 * @param {object} opts
 * @param {string[]} opts.folders
 * @param {Record<string, object>} opts.existing   id -> track lama
 * @param {string} opts.coversDir
 * @param {(p:{done:number,total:number,current:string})=>void} [opts.onProgress]
 * @returns {Promise<{tracks: object[], failed: number, offline: string[]}>}
 */
async function scan({ folders, existing, coversDir, onProgress }) {
  const mm = await import('music-metadata');
  await fs.mkdir(coversDir, { recursive: true });

  const online = [];
  const offline = [];
  for (const f of folders) ((await isReadable(f)) ? online : offline).push(f);

  const { files, dirCovers } = await collect(online);
  const writtenCovers = new Set();
  const out = new Map();
  let done = 0;
  let failed = 0;
  let cursor = 0;
  const total = files.length;

  async function handle(file) {
    const id = trackId(file);
    const old = existing[id];
    let st;
    try { st = await fs.stat(file); } catch (_) { return; }
    const folderCover = (dirCovers.get(path.dirname(file)) || {}).file || null;

    if (old && old.size === st.size && Math.abs(old.mtimeMs - st.mtimeMs) < 1 && old.fmt && old.fmt.v === FMT_VERSION) {
      if (old.meta.coverSource !== 'embedded') {
        old.meta.cover = folderCover;
        old.meta.coverSource = folderCover ? 'folder' : null;
      }
      out.set(id, old);
      return;
    }

    let parsed;
    try {
      parsed = await readMeta(mm, file, coversDir, writtenCovers);
    } catch (_) {
      failed++;
      parsed = {
        meta: { title: path.basename(file, path.extname(file)), artist: '', album: '', albumArtist: '',
                year: null, genre: '', track: null, disc: null, cover: null, coverSource: null },
        duration: 0, bitrate: 0, codec: '', fmt: { v: FMT_VERSION },
      };
    }
    if (!parsed.meta.cover && folderCover) {
      parsed.meta.cover = folderCover;
      parsed.meta.coverSource = 'folder';
    }
    out.set(id, {
      id, path: file, size: st.size, mtimeMs: st.mtimeMs,
      added: old ? old.added : Date.now(),
      ...parsed,
      custom: old ? old.custom : {},
    });
  }

  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      await handle(file);
      done++;
      if (onProgress && (done % 8 === 0 || done === total)) onProgress({ done, total, current: path.basename(file) });
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));

  // Folder yang sedang tidak terhubung (mis. hard disk eksternal): pertahankan data & tag lamanya.
  for (const t of Object.values(existing)) {
    if (!out.has(t.id) && offline.some((f) => t.path.startsWith(f))) out.set(t.id, t);
  }

  return { tracks: [...out.values()], failed, offline };
}

module.exports = { scan, trackId, AUDIO_EXT };
