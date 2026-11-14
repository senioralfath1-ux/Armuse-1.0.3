#!/usr/bin/env node
'use strict';
/*
 * Pembaruan Armuse: lencana kualitas audio + perbandingan A/B.
 *
 * Cara pakai (dari folder proyek Armuse, yaitu folder yang berisi main.js):
 *     node C:\lokasi\update-kualitas\apply-update.js
 *     node C:\lokasi\update-kualitas\apply-update.js --cek      (hanya memeriksa, tidak mengubah apa pun)
 *
 * - Aman dijalankan berulang kali: bagian yang sudah terpasang dilewati.
 * - Berkas lama yang diubah dicadangkan dulu ke folder .cadangan-kualitas/
 * - Bila ada bagian yang gagal dipasang (misalnya Anda sudah mengubah kode di titik yang sama),
 *   skrip menyebutkan bagian mana. Isi tiap tambalan ada di daftar PATCHES di bawah, dan bisa
 *   dipasang manual dengan cara mencari teks `find` lalu menggantinya dengan `replace`.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const HERE = __dirname;
const DRY = process.argv.includes('--cek');
const BACKUP = path.join(ROOT, '.cadangan-kualitas');

// ------------------------------------------------------------------ berkas baru
const NEW_FILES = ['lib/audioformat.js', 'lib/transcode.js', 'src/quality.js', 'src/compare.js', 'src/quality.css'];

// ------------------------------------------------------------------ tambalan
const PATCHES = [
  // ---------- lib/scanner.js: simpan data format tiap lagu
  {
    file: 'lib/scanner.js', name: 'scanner: impor pembaca format', marker: "require('./audioformat')",
    find: "const crypto = require('crypto');\n",
    replace: "const crypto = require('crypto');\nconst { extractFormat, FMT_VERSION } = require('./audioformat');\n",
  },
  {
    file: 'lib/scanner.js', name: 'scanner: simpan fmt', marker: 'fmt: await extractFormat(file, f)',
    find: "    codec: f.codec || f.container || '',\n  };",
    replace: "    codec: f.codec || f.container || '',\n    fmt: await extractFormat(file, f),\n  };",
  },
  {
    file: 'lib/scanner.js', name: 'scanner: baca ulang file lama sekali', marker: 'old.fmt.v === FMT_VERSION',
    find: 'if (old && old.size === st.size && Math.abs(old.mtimeMs - st.mtimeMs) < 1) {',
    replace: 'if (old && old.size === st.size && Math.abs(old.mtimeMs - st.mtimeMs) < 1 && old.fmt && old.fmt.v === FMT_VERSION) {',
  },
  {
    file: 'lib/scanner.js', name: 'scanner: fmt untuk file gagal-baca', marker: 'fmt: { v: FMT_VERSION }',
    find: "        duration: 0, bitrate: 0, codec: '',\n      };",
    replace: "        duration: 0, bitrate: 0, codec: '', fmt: { v: FMT_VERSION },\n      };",
  },

  // ---------- main.js: perintah IPC untuk pembanding A/B
  {
    file: 'main.js', name: 'main: impor transcode', marker: "require('./lib/transcode')",
    find: "const { applyPatch, writeToFile, importCover } = require('./lib/tags');",
    replace: "const { applyPatch, writeToFile, importCover } = require('./lib/tags');\nconst transcode = require('./lib/transcode');",
  },
  {
    file: 'main.js', name: 'main: IPC pembanding A/B', marker: "ipcMain.handle('ab:prepare'",
    find: "  ipcMain.handle('library:load', () => ({ tracks: allTracks(), settings: settings.data }));",
    replace: `  ipcMain.handle('library:load', () => ({ tracks: allTracks(), settings: settings.data }));

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
  ipcMain.handle('ab:clear', () => transcode.clearCache(abDir()));`,
  },

  // ---------- preload.js
  {
    file: 'preload.js', name: 'preload: API pembanding', marker: 'abPrepare',
    find: "  reveal: (file) => ipcRenderer.invoke('shell:reveal', file),",
    replace: `  reveal: (file) => ipcRenderer.invoke('shell:reveal', file),
  abStatus: () => ipcRenderer.invoke('ab:status'),
  abPresets: () => ipcRenderer.invoke('ab:presets'),
  abPrepare: (payload) => ipcRenderer.invoke('ab:prepare', payload),
  abCancel: () => ipcRenderer.invoke('ab:cancel'),
  abClear: () => ipcRenderer.invoke('ab:clear'),
  onAbProgress: (cb) => {
    const h = (_e, d) => cb(d);
    ipcRenderer.on('ab:progress', h);
    return () => ipcRenderer.removeListener('ab:progress', h);
  },`,
  },

  // ---------- src/engine.js: jalur A/B di rantai audio
  {
    file: 'src/engine.js', name: 'engine: jalur A lewat gainA', marker: 'this.gainA = ctx.createGain()',
    find: "      let node = this.source;\n      node.connect(this.pre);\n      node = this.pre;\n",
    replace: "      // Jalur A (file asli) lewat gainA agar bisa dibisukan saat perbandingan A/B (lihat attachCompare)\n"
      + "      this.gainA = ctx.createGain();\n      this.source.connect(this.gainA);\n      this.gainA.connect(this.pre);\n      let node = this.pre;\n",
  },
  {
    file: 'src/engine.js', name: 'engine: attachCompare / setCompare', marker: 'attachCompare(el)',
    find: '    readSpectrum() {',
    replace: `    /** Sambungkan elemen <audio> kedua (versi terkompresi) ke rantai yang sama. */
    attachCompare(el) {
      el.crossOrigin = 'anonymous';
      this.sourceB = this.ctx.createMediaElementSource(el);
      this.gainB = this.ctx.createGain();
      this.gainB.gain.value = 0;
      this.sourceB.connect(this.gainB);
      this.gainB.connect(this.pre);
    }

    /** which: 'A' (asli) atau 'B' (pembanding); offsetDb: koreksi level untuk B. Perpindahan instan. */
    setCompare(which, offsetDb = 0) {
      const t = this.ctx.currentTime;
      this.gainA.gain.setTargetAtTime(which === 'A' ? 1 : 0, t, 0.006);
      if (this.gainB) this.gainB.gain.setTargetAtTime(which === 'B' ? Math.pow(10, offsetDb / 20) : 0, t, 0.006);
    }

    readSpectrum() {`,
  },

  // ---------- src/index.html
  {
    file: 'src/index.html', name: 'html: stylesheet kualitas', marker: 'href="quality.css"',
    find: '  <link rel="stylesheet" href="styles.css">',
    replace: '  <link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="quality.css">',
  },
  {
    file: 'src/index.html', name: 'html: lencana di pemutar', marker: 'id="np-quality"',
    find: '        <div id="np-artist" class="np-artist">Pilih lagu untuk mulai</div>\n',
    replace: '        <div id="np-artist" class="np-artist">Pilih lagu untuk mulai</div>\n'
      + '        <button id="np-quality" class="q-badge" type="button" hidden></button>\n',
  },
  {
    file: 'src/index.html', name: 'html: tombol tab Kualitas', marker: 'data-tab="quality"',
    find: '      <button role="tab" data-tab="eq">Equalizer</button>\n',
    replace: '      <button role="tab" data-tab="eq">Equalizer</button>\n      <button role="tab" data-tab="quality">Kualitas</button>\n',
  },
  {
    file: 'src/index.html', name: 'html: panel tab Kualitas', marker: 'id="tab-quality"',
    find: '    </section>\n  </aside>\n\n  <div id="ctx"',
    replace: '    </section>\n\n    <section id="tab-quality" class="tab" role="tabpanel"></section>\n  </aside>\n\n  <div id="ctx"',
  },
  {
    file: 'src/index.html', name: 'html: skrip kualitas & pembanding', marker: 'src="quality.js"',
    find: '<script src="editor.js"></script>\n',
    replace: '<script src="editor.js"></script>\n<script src="quality.js"></script>\n<script src="compare.js"></script>\n',
  },

  // ---------- src/app.js
  {
    file: 'src/app.js', name: 'app: bagikan engine ke modul lain', marker: 'RD.engine = engine;',
    find: "  try { engine = new window.AudioEngine(audio); } catch (err) { console.error('Web Audio tidak tersedia', err); }",
    replace: "  try { engine = new window.AudioEngine(audio); } catch (err) { console.error('Web Audio tidak tersedia', err); }\n  RD.engine = engine;",
  },
  {
    file: 'src/app.js', name: 'app: perbarui lencana saat lagu berganti', marker: 'RD.quality.update(t)',
    find: "    if ('mediaSession' in navigator && t) {",
    replace: "    if (RD.quality) RD.quality.update(t);\n    if ('mediaSession' in navigator && t) {",
  },
  {
    file: 'src/app.js', name: 'app: tab Kualitas di panel samping', marker: "tab === 'quality'",
    find: "    if (tab === 'queue') { RD.eq.stop(); renderQueue(); } else RD.eq.start();",
    replace: "    if (tab === 'queue') { RD.eq.stop(); renderQueue(); }\n"
      + "    else if (tab === 'quality') { RD.eq.stop(); if (RD.quality) RD.quality.showTab(); }\n"
      + "    else RD.eq.start();",
  },
  {
    file: 'src/app.js', name: 'app: buka panel dari lencana', marker: 'RD.openDrawer = openDrawer;',
    find: '  // ============================================================ Dialog kecil (konfirmasi / input teks)',
    replace: '  RD.openDrawer = openDrawer;\n\n  // ============================================================ Dialog kecil (konfirmasi / input teks)',
  },
];

// ------------------------------------------------------------------ mesin
const out = [];
let failures = 0;
const log = (sym, msg) => out.push(`  ${sym} ${msg}`);

function readText(rel) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };   // toleran terhadap akhir baris Windows
}

function backup(rel) {
  const dst = path.join(BACKUP, rel);
  if (fs.existsSync(dst)) return;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(ROOT, rel), dst);
}

function checkProject() {
  const need = ['main.js', 'preload.js', 'lib/scanner.js', 'src/app.js', 'src/engine.js', 'src/index.html', 'package.json'];
  const miss = need.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  if (miss.length) {
    console.error('\nIni bukan folder proyek Armuse (berkas tidak ditemukan: ' + miss.join(', ') + ').');
    console.error('Buka terminal DI DALAM folder yang berisi main.js, lalu jalankan ulang.\nFolder saat ini: ' + ROOT + '\n');
    process.exit(2);
  }
}

function copyNewFiles() {
  for (const rel of NEW_FILES) {
    const src = path.join(HERE, 'files', rel);
    const dst = path.join(ROOT, rel);
    if (!fs.existsSync(src)) {
      if (fs.existsSync(dst)) { log('=', `${rel}: sudah terpasang di proyek`); continue; }
      log('✗', `${rel}: berkas sumber tidak ada di paket pembaruan`);
      failures++;
      continue;
    }
    const same = fs.existsSync(dst) && fs.readFileSync(dst).equals(fs.readFileSync(src));
    if (same) { log('=', `${rel}: sudah terpasang`); continue; }
    if (!DRY) {
      if (fs.existsSync(dst)) backup(rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    log('+', `${rel}: ${fs.existsSync(dst) && DRY ? 'akan ditimpa' : 'dipasang'}`);
  }
}

function applyPatches() {
  const byFile = new Map();
  for (const p of PATCHES) (byFile.get(p.file) || byFile.set(p.file, []).get(p.file)).push(p);

  for (const [rel, list] of byFile) {
    let { text, crlf } = readText(rel);
    let changed = false;
    for (const p of list) {
      if (text.includes(p.marker)) { log('=', `${p.name}: sudah terpasang`); continue; }
      const n = text.split(p.find).length - 1;
      if (n === 0) { log('✗', `${p.name}: titik sisip tidak ditemukan di ${rel} (kode di sana sudah Anda ubah?)`); failures++; continue; }
      if (n > 1) { log('✗', `${p.name}: titik sisip ambigu (${n} kecocokan) di ${rel}`); failures++; continue; }
      text = text.replace(p.find, () => p.replace);   // fungsi: cegah karakter "$" ditafsirkan khusus
      changed = true;
      log('+', `${p.name}`);
    }
    if (changed && !DRY) {
      backup(rel);
      fs.writeFileSync(path.join(ROOT, rel), crlf ? text.replace(/\n/g, '\r\n') : text);
    }
  }
}

function patchPackageJson() {
  const rel = 'package.json';
  const file = path.join(ROOT, rel);
  const raw = fs.readFileSync(file, 'utf8');
  const pkg = JSON.parse(raw);
  let changed = false;

  pkg.dependencies = pkg.dependencies || {};
  if (!pkg.dependencies['ffmpeg-static']) { pkg.dependencies['ffmpeg-static'] = '^5.3.0'; changed = true; log('+', 'package.json: dependensi ffmpeg-static'); }
  else log('=', 'package.json: ffmpeg-static sudah ada');

  pkg.build = pkg.build || {};
  const au = pkg.build.asarUnpack || [];
  if (!au.includes('node_modules/ffmpeg-static/**')) {
    pkg.build.asarUnpack = [...au, 'node_modules/ffmpeg-static/**'];
    changed = true;
    log('+', 'package.json: asarUnpack ffmpeg-static (agar bisa dijalankan dari aplikasi hasil kemas)');
  } else log('=', 'package.json: asarUnpack sudah ada');

  if (changed && !DRY) {
    backup(rel);
    const crlf = raw.includes('\r\n');
    const json = JSON.stringify(pkg, null, 2) + '\n';
    fs.writeFileSync(file, crlf ? json.replace(/\n/g, '\r\n') : json);
  }
}

checkProject();
console.log(`\nPembaruan Armuse: lencana kualitas + perbandingan A/B${DRY ? '  [MODE CEK: tidak ada yang diubah]' : ''}`);
console.log('Folder proyek: ' + ROOT + '\n');
copyNewFiles();
applyPatches();
patchPackageJson();
console.log(out.join('\n'));

console.log('');
if (failures) {
  console.log(`Selesai dengan ${failures} bagian GAGAL (lihat tanda ✗ di atas). Bagian lain tetap terpasang.`);
  process.exit(1);
}
console.log(DRY ? 'Pemeriksaan selesai.' : 'Selesai. Langkah berikutnya:\n  1. npm install          (memasang ffmpeg-static untuk fitur perbandingan)\n  2. npm run dev / npm start\n'
  + '  Catatan: pemindaian pertama setelah pembaruan membaca ulang semua file (sekali saja) untuk mengisi data format.');
