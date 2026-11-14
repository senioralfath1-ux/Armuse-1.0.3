'use strict';
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { resolveFfmpeg } = require('./transcode');

let resolvedYtDlp;
let activeProcess = null;
let isCancelled = false;

function probe(binPath) {
  try {
    const r = spawnSync(binPath, ['--version'], { timeout: 8000, windowsHide: true, encoding: 'utf8' });
    if (r.status !== 0) return null;
    const ver = (r.stdout || '').trim();
    return { version: ver || '?' };
  } catch (_) {
    return null;
  }
}

function resolveYtDlp() {
  if (resolvedYtDlp !== undefined) return resolvedYtDlp;
  const cands = [];
  if (process.env.ARMUSE_YTDLP) cands.push({ path: process.env.ARMUSE_YTDLP, source: 'ARMUSE_YTDLP' });
  if (process.env.RD_YTDLP) cands.push({ path: process.env.RD_YTDLP, source: 'RD_YTDLP' });

  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  cands.push({ path: path.join(__dirname, '..', 'bin', binName), source: 'bundled-local' });
  if (process.resourcesPath) {
    cands.push({ path: path.join(process.resourcesPath, 'bin', binName), source: 'resources-bin' });
    cands.push({ path: path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', binName), source: 'asar-unpacked' });
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || (process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local') : '');
    if (localAppData) {
      cands.push({
        path: path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe', 'yt-dlp.exe'),
        source: 'winget-package',
      });
      cands.push({
        path: path.join(localAppData, 'Microsoft', 'WinGet', 'Links', 'yt-dlp.exe'),
        source: 'winget-links',
      });
    }
  }

  cands.push({ path: binName, source: 'PATH' });

  for (const c of cands) {
    if (!c.path) continue;
    const info = probe(c.path);
    if (info) return (resolvedYtDlp = { ...c, ...info });
  }
  return (resolvedYtDlp = null);
}

function status() {
  const ytdl = resolveYtDlp();
  const ff = resolveFfmpeg ? resolveFfmpeg() : null;
  return {
    available: !!ytdl,
    ytdl: ytdl ? { version: ytdl.version, source: ytdl.source, path: ytdl.path } : null,
    ffmpeg: ff ? { version: ff.version, source: ff.source, path: ff.path } : null,
  };
}

async function getInfo(url) {
  const ytdl = resolveYtDlp();
  if (!ytdl) return { ok: false, error: 'yt-dlp tidak ditemukan di sistem.' };
  if (!url || !url.trim()) return { ok: false, error: 'URL YouTube belum diisi.' };

  const cleanUrl = url.trim();
  const args = [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--js-runtimes', 'node:node',
    cleanUrl,
  ];

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const proc = spawn(ytdl.path, args, { windowsHide: true });
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => resolve({ ok: false, error: err.message }));
    proc.on('close', (code) => {
      if (code !== 0) {
        return resolve({ ok: false, error: stderr.trim() || `Gagal mengambil info video (kode ${code})` });
      }
      try {
        const data = JSON.parse(stdout);
        resolve({
          ok: true,
          id: data.id,
          title: data.title,
          channel: data.channel || data.uploader || 'YouTube',
          duration: data.duration || 0,
          durationString: data.duration_string || '',
          thumbnail: data.thumbnail || (data.thumbnails && data.thumbnails.length ? data.thumbnails[data.thumbnails.length - 1].url : ''),
          url: data.webpage_url || cleanUrl,
        });
      } catch (e) {
        resolve({ ok: false, error: 'Format data video tidak valid.' });
      }
    });
  });
}

async function download({ url, format = 'mp3', destDir, onProgress }) {
  const ytdl = resolveYtDlp();
  if (!ytdl) return { ok: false, error: 'yt-dlp tidak ditemukan.' };
  const ff = resolveFfmpeg ? resolveFfmpeg() : null;
  if (!ff) return { ok: false, error: 'ffmpeg tidak ditemukan.' };
  if (!destDir) return { ok: false, error: 'Folder tujuan belum ditentukan.' };

  await fsp.mkdir(destDir, { recursive: true });

  cancel();
  isCancelled = false;

  const validFormats = ['mp3', 'flac', 'wav', 'm4a', 'opus'];
  const audioFmt = validFormats.includes(format.toLowerCase()) ? format.toLowerCase() : 'mp3';

  const args = [
    '--no-playlist',
    '--newline',
    '--no-warnings',
    '--js-runtimes', 'node:node',
    '-x',
    '--audio-format', audioFmt,
    '--audio-quality', '0',
    '--embed-metadata',
    '--ffmpeg-location', ff.path,
    '-o', path.join(destDir, '%(title)s.%(ext)s'),
  ];

  if (['mp3', 'flac', 'm4a', 'opus'].includes(audioFmt)) {
    args.push('--embed-thumbnail');
  }

  args.push(url.trim());

  return new Promise((resolve) => {
    let capturedFile = null;
    let stdoutBuf = '';
    let stderrBuf = '';

    const proc = spawn(ytdl.path, args, { windowsHide: true });
    activeProcess = proc;

    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutBuf += text;
      const lines = text.split(/[\r\n]+/);
      for (const line of lines) {
        const pctMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/i);
        if (pctMatch) {
          if (onProgress) {
            onProgress({
              stage: 'downloading',
              percent: parseFloat(pctMatch[1]),
              size: pctMatch[2],
              speed: pctMatch[3],
              eta: pctMatch[4],
              text: `Mengunduh: ${pctMatch[1]}% (${pctMatch[3]})`,
            });
          }
          continue;
        }

        if (line.includes('[ExtractAudio]')) {
          const destMatch = line.match(/Destination:\s*(.+)$/i);
          if (destMatch) capturedFile = destMatch[1].trim();
          if (onProgress) onProgress({ stage: 'converting', percent: 92, text: `Mengonversi ke ${audioFmt.toUpperCase()}...` });
        } else if (line.includes('[Metadata]') || line.includes('[Thumbnails]')) {
          if (onProgress) onProgress({ stage: 'metadata', percent: 97, text: 'Menyematkan metadata & sampul...' });
        } else if (line.includes('Destination:')) {
          const m = line.match(/Destination:\s*(.+)$/i);
          if (m && !capturedFile) capturedFile = m[1].trim();
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    proc.on('error', (err) => {
      activeProcess = null;
      resolve({ ok: false, error: err.message });
    });

    proc.on('close', async (code) => {
      activeProcess = null;
      if (isCancelled) {
        return resolve({ ok: false, cancelled: true, error: 'Unduhan dibatalkan.' });
      }
      if (code !== 0) {
        return resolve({ ok: false, error: stderrBuf.trim() || `Unduhan gagal (kode ${code})` });
      }

      let finalPath = capturedFile;
      if (finalPath && !finalPath.toLowerCase().endsWith('.' + audioFmt)) {
        const baseWithoutExt = finalPath.replace(/\.[^/.]+$/, '');
        const cand = `${baseWithoutExt}.${audioFmt}`;
        try {
          if ((await fsp.stat(cand)).isFile()) finalPath = cand;
        } catch (_) {}
      }

      if (!finalPath || !fs.existsSync(finalPath)) {
        try {
          const files = await fsp.readdir(destDir);
          const matched = files.filter((f) => f.toLowerCase().endsWith('.' + audioFmt));
          let newest = null;
          let maxMtime = 0;
          for (const f of matched) {
            const p = path.join(destDir, f);
            const st = await fsp.stat(p);
            if (st.mtimeMs > maxMtime) {
              maxMtime = st.mtimeMs;
              newest = p;
            }
          }
          if (newest && Date.now() - maxMtime < 60000) {
            finalPath = newest;
          }
        } catch (_) {}
      }

      if (onProgress) onProgress({ stage: 'done', percent: 100, text: 'Selesai!' });
      resolve({
        ok: true,
        path: finalPath,
        filename: finalPath ? path.basename(finalPath) : '',
        format: audioFmt,
      });
    });
  });
}

function cancel() {
  if (activeProcess) {
    isCancelled = true;
    try { activeProcess.kill(); } catch (_) {}
    activeProcess = null;
    return true;
  }
  return false;
}

module.exports = {
  resolveYtDlp,
  status,
  getInfo,
  download,
  cancel,
};
