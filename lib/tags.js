'use strict';
// Menerapkan perubahan tag: disimpan sebagai "override" di database aplikasi (non-destruktif),
// dengan opsi menulis ke file MP3 (ID3v2).
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const NodeID3 = require('node-id3');

const TEXT_FIELDS = ['title', 'artist', 'album', 'albumArtist', 'genre'];
const NUM_FIELDS = ['year', 'track', 'disc'];

function cleanValue(key, v) {
  if (v === '' || v == null) return null;
  if (NUM_FIELDS.includes(key)) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return String(v).trim() || null;
}

/** patch: { fields?, addTags?, removeTags?, rating?, favorite?, cover? } */
function applyPatch(track, patch) {
  const c = track.custom || (track.custom = {});
  for (const [k, raw] of Object.entries(patch.fields || {})) {
    if (![...TEXT_FIELDS, ...NUM_FIELDS].includes(k)) continue;
    const v = cleanValue(k, raw);
    if (v == null) delete c[k]; else c[k] = v;
  }
  if ('rating' in patch) {
    const r = Math.max(0, Math.min(5, parseInt(patch.rating, 10) || 0));
    if (r) c.rating = r; else delete c.rating;
  }
  if ('favorite' in patch) {
    if (patch.favorite) c.favorite = true; else delete c.favorite;
  }
  if ('cover' in patch) {
    if (patch.cover) c.cover = patch.cover; else delete c.cover;
  }
  if (patch.addTags || patch.removeTags) {
    const set = new Set(c.tags || []);
    (patch.addTags || []).forEach((t) => set.add(t));
    (patch.removeTags || []).forEach((t) => set.delete(t));
    if (set.size) c.tags = [...set].sort((a, b) => a.localeCompare(b)); else delete c.tags;
  }
}

/** Tulis field yang diubah ke tag ID3 file MP3, lalu jadikan itu tag "asli" (override dibuang). */
async function writeToFile(track, patch) {
  if (path.extname(track.path).toLowerCase() !== '.mp3') return { ok: false, reason: 'bukan MP3' };
  const f = patch.fields || {};
  const tags = {};
  const written = [];
  const set = (id, key, val) => { tags[id] = String(val); written.push(key); };
  const v = (k) => cleanValue(k, f[k]);
  if (v('title')) set('title', 'title', v('title'));
  if (v('artist')) set('artist', 'artist', v('artist'));
  if (v('album')) set('album', 'album', v('album'));
  if (v('albumArtist')) set('performerInfo', 'albumArtist', v('albumArtist'));
  if (v('genre')) set('genre', 'genre', v('genre'));
  if (v('year')) set('year', 'year', v('year'));
  if (v('track')) set('trackNumber', 'track', v('track'));
  if (v('disc')) set('partOfSet', 'disc', v('disc'));
  const coverPath = patch.cover && (track.custom.cover || patch.cover);
  if (coverPath) tags.APIC = coverPath;
  if (!Object.keys(tags).length) return { ok: true, written: [] };

  const res = NodeID3.update(tags, track.path);
  if (res instanceof Error) return { ok: false, reason: res.message };

  for (const key of written) {
    track.meta[key] = NUM_FIELDS.includes(key) ? parseInt(f[key], 10) : cleanValue(key, f[key]);
    delete track.custom[key];
  }
  if (coverPath) {
    track.meta.cover = coverPath;
    track.meta.coverSource = 'embedded';
    delete track.custom.cover;
  }
  const st = await fsp.stat(track.path);
  track.size = st.size;
  track.mtimeMs = st.mtimeMs;
  return { ok: true, written };
}

/** Salin gambar pilihan pengguna ke folder sampul aplikasi. */
async function importCover(src, coversDir) {
  const buf = await fsp.readFile(src);
  const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20);
  const dest = path.join(coversDir, `custom-${hash}${path.extname(src).toLowerCase() || '.jpg'}`);
  if (!fs.existsSync(dest)) await fsp.writeFile(dest, buf);
  return dest;
}

module.exports = { applyPatch, writeToFile, importCover };
