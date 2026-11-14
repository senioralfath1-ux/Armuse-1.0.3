'use strict';
// Membaca detail format audio untuk lencana kualitas (Lossless, Hi-Res Lossless, Dolby Atmos).
// Yang disimpan hanya data mentah; label dirakit di renderer (src/quality.js), jadi aturan
// penamaan bisa diubah tanpa memindai ulang pustaka.
const fs = require('fs/promises');
const path = require('path');

// Naikkan angka ini bila struktur `fmt` berubah: pemindai akan membaca ulang file lama satu kali.
const FMT_VERSION = 2;

const MP4_EXT = new Set(['.m4a', '.mp4', '.m4b']);
const MAX_MOOV = 64 * 1024 * 1024;

// ---------------------------------------------------------------- kotak MP4
// music-metadata tidak selalu lengkap untuk MP4: laju sampel ALAC di atas 65 kHz terbaca 0,
// dan codec E-AC-3 (Dolby Digital Plus / Atmos) tidak disebut sama sekali. Karena itu
// bagian yang dibutuhkan dibaca langsung dari kotak `moov`.

function* boxes(buf, start, end) {
  let p = start;
  while (p + 8 <= end) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let head = 8;
    if (size === 1) {
      if (p + 16 > end) return;
      size = Number(buf.readBigUInt64BE(p + 8));
      head = 16;
    } else if (size === 0) {
      size = end - p;
    }
    if (size < head || p + size > end) return;
    yield { type, start: p + head, end: p + size };
    p += size;
  }
}

function child(buf, box, type, from = box.start) {
  for (const b of boxes(buf, from, box.end)) if (b.type === type) return b;
  return null;
}

async function readMoov(file) {
  const fh = await fs.open(file, 'r');
  try {
    const { size } = await fh.stat();
    const hdr = Buffer.alloc(16);
    let pos = 0;
    while (pos + 8 <= size) {
      await fh.read(hdr, 0, 16, pos);
      let len = hdr.readUInt32BE(0);
      const type = hdr.toString('latin1', 4, 8);
      let head = 8;
      if (len === 1) { len = Number(hdr.readBigUInt64BE(8)); head = 16; } else if (len === 0) len = size - pos;
      if (len < head) return null;
      if (type === 'moov') {
        const n = len - head;
        if (n <= 0 || n > MAX_MOOV) return null;
        const buf = Buffer.alloc(n);
        await fh.read(buf, 0, n, pos + head);
        return buf;
      }
      pos += len;
    }
    return null;
  } finally {
    await fh.close();
  }
}

function audioTrackInfo(moov) {
  for (const trak of boxes(moov, 0, moov.length)) {
    if (trak.type !== 'trak') continue;
    const mdia = child(moov, trak, 'mdia');
    if (!mdia) continue;
    const hdlr = child(moov, mdia, 'hdlr');
    if (!hdlr || moov.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'soun') continue;

    const info = { timescale: 0, entry: null, dec3: null };
    const mdhd = child(moov, mdia, 'mdhd');
    if (mdhd) info.timescale = moov.readUInt32BE(mdhd.start + (moov[mdhd.start] === 1 ? 20 : 12));
    const minf = child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    const stsd = stbl && child(moov, stbl, 'stsd');
    if (stsd) {
      for (const entry of boxes(moov, stsd.start + 8, stsd.end)) {   // entri pertama saja
        info.entry = entry.type;
        for (const c of boxes(moov, entry.start + 28, entry.end)) {   // 28 byte = header AudioSampleEntry
          if (c.type === 'dec3') info.dec3 = moov.subarray(c.start, c.end);
        }
        break;
      }
    }
    return info;
  }
  return null;
}

/**
 * Isi kotak `dec3` (EC3SpecificBox, ETSI TS 102 366 lampiran F).
 * Setelah daftar substream ada 7 bit cadangan + flag_ec3_extension_type_a; bila flag = 1,
 * aliran memuat JOC (Joint Object Coding), yaitu lapisan objek Dolby Atmos.
 */
function parseDec3(b) {
  const total = b.length * 8;
  let pos = 0;
  const read = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++, pos++) v = (v << 1) | ((b[pos >> 3] >> (7 - (pos & 7))) & 1);
    return v;
  };
  if (total < 40) return null;
  read(13);                                    // data_rate
  const subs = read(3) + 1;                    // num_ind_sub + 1
  for (let i = 0; i < subs; i++) {
    if (pos + 24 > total) return null;
    read(2); read(5); read(1); read(1); read(3); read(3); read(1); read(3);   // fscod..reserved
    const dep = read(4);                       // num_dep_sub
    read(dep > 0 ? 9 : 1);                     // chan_loc / reserved
  }
  if (pos + 8 > total) return { joc: false };
  read(7);
  if (!read(1)) return { joc: false };
  return { joc: true, complexity: pos + 8 <= total ? read(8) : 0 };
}

// ---------------------------------------------------------------- normalisasi
function normCodec(f, ext) {
  const c = f.codec || '';
  const k = f.container || '';
  if (/^MPEG \d Layer 3/i.test(c)) return 'MP3';
  if (/MPEG-4\/AAC|^AAC/i.test(c)) return 'AAC';
  if (/^ALAC/i.test(c)) return 'ALAC';
  if (/^FLAC/i.test(c)) return 'FLAC';
  if (/^Opus/i.test(c)) return 'Opus';
  if (/^Vorbis/i.test(c)) return 'Vorbis';
  if (/^WAVE/i.test(k) || ext === '.wav') return 'WAV';
  return c || k || '';
}

/**
 * @param {string} file
 * @param {object} f  md.format dari music-metadata
 * @returns {Promise<object>} data mentah untuk lencana kualitas
 */
async function extractFormat(file, f = {}) {
  const ext = path.extname(file).toLowerCase();
  const lossless = f.lossless === true;
  const fmt = {
    v: FMT_VERSION,
    codec: normCodec(f, ext),
    lossless,
    sampleRate: f.sampleRate || 0,
    bitDepth: lossless ? f.bitsPerSample || 0 : 0,   // kedalaman bit hanya bermakna untuk lossless
    channels: f.numberOfChannels || 0,
    bitrate: f.bitrate ? Math.round(f.bitrate / 1000) : 0,
    vbr: /^V\d|VBR/i.test(f.codecProfile || ''),
    atmos: false,
  };

  if (MP4_EXT.has(ext)) {
    try {
      const moov = await readMoov(file);
      const t = moov && audioTrackInfo(moov);
      if (t) {
        if (!fmt.sampleRate && t.timescale) fmt.sampleRate = t.timescale;   // ALAC hi-res
        if (t.entry === 'ec-3' || t.entry === 'ac-3') {
          fmt.codec = t.entry === 'ec-3' ? 'E-AC-3' : 'AC-3';
          fmt.lossless = false;
          fmt.bitDepth = 0;
          const d = t.dec3 && parseDec3(t.dec3);
          if (d && d.joc) { fmt.atmos = true; fmt.jocComplexity = d.complexity; }
        }
      }
    } catch (_) { /* biarkan nilai dari music-metadata */ }
  }
  return fmt;
}

module.exports = { extractFormat, FMT_VERSION, parseDec3 };
