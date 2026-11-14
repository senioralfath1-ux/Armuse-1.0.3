'use strict';
// Membuat versi terkompresi (AAC / MP3 / Opus) dari sebuah lagu supaya bisa dibandingkan
// dengan file aslinya (A/B). Memakai ffmpeg, dan hasilnya disimpan di folder cache aplikasi.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

// Preset pembanding. Tambah baris baru di sini bila ingin opsi lain; UI membacanya otomatis.
const PRESETS = [
  { id: 'aac-256', label: 'AAC 256 kbps', ext: 'm4a', note: 'kelas streaming kualitas tinggi', args: ['-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart'] },
  { id: 'aac-128', label: 'AAC 128 kbps', ext: 'm4a', note: 'streaming hemat data', args: ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'] },
  { id: 'mp3-320', label: 'MP3 320 kbps', ext: 'mp3', note: 'MP3 kualitas tertinggi', args: ['-c:a', 'libmp3lame', '-b:a', '320k'] },
  { id: 'mp3-128', label: 'MP3 128 kbps', ext: 'mp3', note: 'MP3 standar lama', args: ['-c:a', 'libmp3lame', '-b:a', '128k'] },
  { id: 'opus-96', label: 'Opus 96 kbps', ext: 'opus', note: 'codec modern, efisien', args: ['-c:a', 'libopus', '-b:a', '96k'] },
  { id: 'opus-48', label: 'Opus 48 kbps', ext: 'opus', note: 'sangat rendah, untuk melatih telinga', args: ['-c:a', 'libopus', '-b:a', '48k'] },
];

const KEEP_FILES = 30;               // jumlah file cache terbaru yang dipertahankan
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- lokasi ffmpeg
let resolved;
function probe(p) {
  try {
    const r = spawnSync(p, ['-version'], { timeout: 8000, windowsHide: true, encoding: 'utf8' });
    if (r.status !== 0) return null;
    const m = /ffmpeg version (\S+)/.exec(r.stdout || '');
    return { version: m ? m[1] : '?' };
  } catch (_) { return null; }
}

/** Urutan pencarian: variabel RD_FFMPEG, paket ffmpeg-static, lalu ffmpeg di PATH. */
function resolveFfmpeg() {
  if (resolved !== undefined) return resolved;
  const cands = [];
  if (process.env.RD_FFMPEG) cands.push({ path: process.env.RD_FFMPEG, source: 'RD_FFMPEG' });
  try {
    const p = require('ffmpeg-static');
    if (p) cands.push({ path: p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep), source: 'ffmpeg-static' });
  } catch (_) { /* paket tidak dipasang */ }
  cands.push({ path: process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', source: 'PATH' });
  for (const c of cands) {
    const info = probe(c.path);
    if (info) return (resolved = { ...c, ...info });
  }
  return (resolved = null);
}

// ---------------------------------------------------------------- proses
let job = null;                      // pekerjaan yang sedang berjalan
class Cancelled extends Error {}

function run(bin, args, { onStdout } = {}) {
  return new Promise((resolve, reject) => {
    if (job && job.cancelled) return reject(new Cancelled());
    const p = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    if (job) job.procs.add(p);
    let err = '';
    p.stdout.on('data', (d) => onStdout && onStdout(d.toString()));
    p.stderr.on('data', (d) => { if (err.length < 65536) err += d.toString(); });
    p.on('error', reject);
    p.on('close', (code) => {
      if (job) job.procs.delete(p);
      if (job && job.cancelled) return reject(new Cancelled());
      resolve({ code, stderr: err });
    });
  });
}

function cancel() {
  if (!job) return false;
  job.cancelled = true;
  for (const p of job.procs) { try { p.kill(); } catch (_) { /* sudah selesai */ } }
  return true;
}

// Laju sampel target: pertahankan bila <= 48 kHz; sumber hi-res diturunkan ke 44,1 atau 48 kHz.
function targetRate(sr) {
  if (!sr || sr <= 48000) return 0;
  return sr % 44100 === 0 ? 44100 : 48000;
}

/** Tingkat volume rata-rata (dB) memakai filter volumedetect; null bila gagal. */
async function meanVolume(bin, file) {
  const r = await run(bin, ['-nostdin', '-hide_banner', '-i', file, '-map', '0:a:0', '-vn', '-af', 'volumedetect', '-f', 'null', '-']);
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  return m && m[1] !== '-inf' ? parseFloat(m[1]) : null;
}

async function prune(dir, keep) {
  try {
    const names = await fsp.readdir(dir);
    const stats = await Promise.all(names.map(async (n) => ({ n, s: await fsp.stat(path.join(dir, n)) })));
    stats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
    for (const { n } of stats.slice(KEEP_FILES)) if (n !== path.basename(keep)) await fsp.rm(path.join(dir, n), { force: true });
  } catch (_) { /* cache hanya optimisasi */ }
}

/**
 * @returns {Promise<{ok:true, path:string, bytes:number, srcBytes:number, gainDb:number, levelMatched:boolean, surround:boolean, cached:boolean}
 *                  | {ok:false, error:string, code?:string, cancelled?:boolean}>}
 */
async function prepare({ track, presetId, cacheDir, onProgress }) {
  const ff = resolveFfmpeg();
  if (!ff) return { ok: false, code: 'no-ffmpeg', error: 'ffmpeg tidak ditemukan.' };
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return { ok: false, error: 'Preset tidak dikenal.' };
  try { await fsp.access(track.path); } catch (_) { return { ok: false, error: 'File lagu tidak bisa dibaca (folder sedang tidak terhubung?).' }; }

  cancel();
  const mine = (job = { cancelled: false, procs: new Set() });
  try {
    await fsp.mkdir(cacheDir, { recursive: true });
    const key = sha1(`${track.path}|${track.size}|${track.mtimeMs}|${preset.id}|1`).slice(0, 20);
    const out = path.join(cacheDir, `${key}.${preset.ext}`);
    const tmp = path.join(cacheDir, `${key}.part.${preset.ext}`);

    const f = track.fmt || {};
    let cached = false;
    try { cached = (await fsp.stat(out)).size > 0; } catch (_) { /* belum ada */ }

    if (!cached) {
      const args = ['-nostdin', '-v', 'error', '-y', '-i', track.path, '-map', '0:a:0', '-vn', '-map_metadata', '-1'];
      if ((f.channels || 2) > 2) args.push('-ac', '2');
      const sr = targetRate(f.sampleRate);
      if (sr) args.push('-ar', String(sr));
      args.push(...preset.args, '-progress', 'pipe:1', '-nostats', tmp);

      let buf = '';
      const r = await run(ff.path, args, {
        onStdout: (s) => {
          buf += s;
          const m = [...buf.matchAll(/out_time_(?:us|ms)=(\d+)/g)].pop();
          if (m && track.duration && onProgress) onProgress(clamp(Math.round((Number(m[1]) / 1e6 / track.duration) * 100), 0, 99));
          if (buf.length > 4096) buf = buf.slice(-1024);
        },
      });
      if (r.code !== 0) {
        await fsp.rm(tmp, { force: true });
        const why = /Unknown encoder|Encoder .* not found/i.test(r.stderr)
          ? `ffmpeg yang terpasang tidak mendukung encoder untuk ${preset.label}.`
          : `ffmpeg gagal (${(r.stderr.trim().split('\n').pop() || 'kode ' + r.code).slice(0, 160)}).`;
        return { ok: false, error: why };
      }
      await fsp.rename(tmp, out);
    }

    // Samakan level: selisih kecil (0,1-0,5 dB) saja sudah terdengar "lebih bagus" padahal tidak ada bedanya.
    // Sumber surround dikecualikan: downmix ffmpeg dan downmix pemutar berbeda, jadi angkanya menyesatkan.
    const multi = (f.channels || 2) > 2;
    let gainDb = 0;
    let levelMatched = false;
    if (!multi) {
      const [a, b] = await Promise.all([meanVolume(ff.path, track.path), meanVolume(ff.path, out)]);
      if (a != null && b != null) { gainDb = Math.round(clamp(a - b, -6, 6) * 10) / 10; levelMatched = true; }
    }

    prune(cacheDir, out);
    const bytes = (await fsp.stat(out)).size;
    if (onProgress) onProgress(100);
    return { ok: true, path: out, bytes, srcBytes: track.size || 0, gainDb, levelMatched, surround: multi, cached };
  } catch (err) {
    if (err instanceof Cancelled) return { ok: false, cancelled: true, error: 'Dibatalkan.' };
    return { ok: false, error: err.message || String(err) };
  } finally {
    if (job === mine) job = null;
  }
}

// ---------------------------------------------------------------- cache & status
async function cacheInfo(dir) {
  try {
    const names = await fsp.readdir(dir);
    let bytes = 0;
    for (const n of names) bytes += (await fsp.stat(path.join(dir, n))).size;
    return { files: names.length, bytes };
  } catch (_) { return { files: 0, bytes: 0 }; }
}

async function clearCache(dir) {
  cancel();
  const before = await cacheInfo(dir);
  try { await fsp.rm(dir, { recursive: true, force: true }); } catch (_) { /* abaikan */ }
  return { ok: true, freed: before.bytes, files: before.files };
}

function status() {
  const ff = resolveFfmpeg();
  return ff ? { available: true, source: ff.source, version: ff.version } : { available: false };
}

const presetList = () => PRESETS.map(({ id, label, ext, note }) => ({ id, label, ext, note }));

module.exports = { prepare, cancel, status, presetList, cacheInfo, clearCache, PRESETS, resolveFfmpeg };
