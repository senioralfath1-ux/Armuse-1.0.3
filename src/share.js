'use strict';
/* Kartu "Bagikan": merender kartu lagu ke canvas 1080x1920 (rasio Story) dengan beberapa template,
   pilihan latar, kutipan lirik, dan stiker yang bisa diseret. Hasilnya diekspor sebagai PNG
   (simpan file / salin ke clipboard). Electron desktop tidak punya "share sheet" native seperti
   ponsel, jadi alurnya ekspor gambar dulu — pengguna bisa mengunggahnya sendiri ke platform mana pun. */
(function () {
  const RD = window.RD;
  const { $, $$, esc } = RD;
  const api = window.api;

  const W = 1080, H = 1920;
  const SANS = '"Segoe UI", system-ui, -apple-system, sans-serif';
  const SERIF = 'Georgia, "Times New Roman", serif';
  const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';
  const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';

  const LAYOUTS = [
    { id: 'classic', label: 'Klasik' },
    { id: 'journal', label: 'Jurnal' },
    { id: 'card', label: 'Kartu' },
    { id: 'lyrics', label: 'Lirik' },
    { id: 'vinyl', label: 'Vinyl' },
  ];
  const COLORS = [
    { id: 'cover', label: 'Warna sampul (latar buram)' },
    { id: 'accent', label: 'Warna aksen aplikasi' },
    { id: 'violet', label: 'Ungu', from: '#6a4cff', to: '#241a4d' },
    { id: 'rose', label: 'Merah muda', from: '#ff5d8f', to: '#4d1729' },
    { id: 'teal', label: 'Hijau tosca', from: '#2fd6c8', to: '#0f322f' },
    { id: 'mono', label: 'Monokrom', from: '#3a3f47', to: '#0b0d10' },
  ];
  // Hanya emoji sampai Unicode 11 supaya tampil di Windows 10 lama juga (bukan kotak kosong).
  const EMOJIS = ['❤️', '⭐', '✨', '🎧', '🎵', '🎶', '🔥', '🌙', '☁️', '🌸', '💿', '🎤',
    '😎', '💫', '🦋', '🌈', '🍀', '🎸', '🎹', '💜', '🤍', '🥰', '😭', '🎀'];
  const BADGES = ['NOW PLAYING', 'ON REPEAT', 'FAVORIT', 'LAGU HARI INI'];

  // ---------- state (layout/latar/logo diingat antar pembukaan; stiker & lirik direset per lagu) ----------
  let track = null;
  let layout = 'classic';
  let colorId = 'cover';
  let showLogo = true;
  let lyricText = '';
  let lyricTouched = false;
  let stickers = [];
  let selId = null;
  let uid = 1;
  let drag = null;

  // ---------- util umum ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const shade = (c, f) => c.map((v) => clamp(Math.round(v * f), 0, 255));
  const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

  function parseColor(str, fb = [242, 179, 61]) {
    const s = String(str || '').trim();
    let m = /^#([0-9a-f]{3})$/i.exec(s);
    if (m) return [0, 1, 2].map((i) => parseInt(m[1][i] + m[1][i], 16));
    m = /^#([0-9a-f]{6})/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/.exec(s);
    if (m) return [+m[1], +m[2], +m[3]].map(Math.round);
    return fb;
  }
  const appAccent = () => parseColor(getComputedStyle(document.body).getPropertyValue('--accent'));

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function resetCtx(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.filter = 'none';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.setLineDash([]);
  }

  // ---------- teks: pemecah baris yang aman untuk judul panjang, kata tanpa spasi, dan aksara CJK ----------
  const CJK = '\\u3000-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef';
  const TOKEN_RE = new RegExp(`[${CJK}]|[^\\s${CJK}]+\\s*|\\s+`, 'g');

  /** Pecah `text` jadi baris-baris yang lebarnya ≤ maxWidth (memakai ctx.font yang aktif).
   *  Aksara CJK boleh putus di antara huruf; kata Latin yang lebih lebar dari kolom dipecah per huruf. */
  function breakLines(ctx, text, maxWidth) {
    const lines = [];
    String(text || '').replace(/\r/g, '').split('\n').forEach((par) => {
      const toks = par.match(TOKEN_RE) || [];
      let line = '';
      const flush = () => { const t = line.trimEnd(); if (t) lines.push(t); line = ''; };
      for (let tok of toks) {
        if (ctx.measureText(tok.trimEnd()).width > maxWidth) {
          flush();
          for (const ch of Array.from(tok)) {
            if (line && ctx.measureText(line + ch).width > maxWidth) flush();
            line += ch;
          }
          continue;
        }
        if (line.trim() && ctx.measureText((line + tok).trimEnd()).width > maxWidth) { flush(); tok = tok.trimStart(); }
        line += tok;
      }
      flush();
    });
    return lines;
  }

  function ellipsize(ctx, s, maxWidth) {
    const a = Array.from(String(s).trimEnd());
    while (a.length && ctx.measureText(a.join('') + '…').width > maxWidth) a.pop();
    return a.join('').trimEnd() + '…';
  }

  /** Cari ukuran font terbesar (size → min) yang muat dalam maxLines. Kalau masih tak muat, potong dengan "…". */
  function fitText(ctx, text, o) {
    const font = (s) => `${o.weight || 400} ${s}px ${o.family}`;
    const lhOf = (s) => Math.round(s * (o.lh || 1.22));
    for (let s = o.size; s >= o.min; s -= 2) {
      ctx.font = font(s);
      const lines = breakLines(ctx, text, o.maxWidth);
      if (lines.length <= o.maxLines) return { lines, size: s, lh: lhOf(s) };
    }
    ctx.font = font(o.min);
    let lines = breakLines(ctx, text, o.maxWidth);
    if (lines.length > o.maxLines) {
      lines = lines.slice(0, o.maxLines);
      lines[o.maxLines - 1] = ellipsize(ctx, lines[o.maxLines - 1], o.maxWidth);
    }
    return { lines, size: o.min, lh: lhOf(o.min) };
  }
  const blockH = (f) => f.lines.length * f.lh;

  /** Gambar hasil fitText; `top` = sisi atas blok. Mengembalikan tinggi blok. */
  function drawBlock(ctx, f, x, top, o = {}) {
    ctx.font = `${o.weight || 400} ${f.size}px ${o.family}`;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'alphabetic';
    f.lines.forEach((l, i) => ctx.fillText(l, x, top + i * f.lh + f.size * 0.95 + (f.lh - f.size) / 2 - 2));
    return blockH(f);
  }

  // ---------- gambar sampul, palet warna, latar buram ----------
  function getCoverImgEl() {
    const el = document.querySelector('#npov-cover img');
    return el && el.complete && el.naturalWidth ? el : null;
  }
  const imgKey = (img) => (img && (img.currentSrc || img.src)) || '';

  const palCache = new Map();
  function palette(img) {
    const fb = appAccent();
    const none = { avg: shade(fb, 0.5), vivid: fb, has: false };
    if (!img) return none;
    const key = imgKey(img);
    if (palCache.has(key)) return palCache.get(key);
    let res = none;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 32, 32);
      const d = g.getImageData(0, 0, 32, 32).data;
      let r = 0, gg = 0, b = 0, n = 0, best = null, bestScore = -1;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        const R = d[i], G = d[i + 1], B = d[i + 2];
        r += R; gg += G; b += B; n++;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        const sat = mx ? (mx - mn) / mx : 0;
        const score = sat * Math.min(1, (mx / 255) * 1.6);
        if (score > bestScore) { bestScore = score; best = [R, G, B]; }
      }
      if (n) {
        const avg = [r / n, gg / n, b / n].map(Math.round);
        let vivid = best && bestScore > 0.22 ? best : mixc(avg, [255, 255, 255], 0.3);
        const l = lum(vivid);
        if (l < 0.42) vivid = mixc(vivid, [255, 255, 255], 0.42 - l);   // cukup terang untuk jadi aksen di latar gelap
        res = { avg, vivid, has: true };
      }
    } catch (_) { /* canvas "tainted"/gagal baca → pakai warna aksen aplikasi */ }
    palCache.set(key, res);
    return res;
  }

  let blurCache = { key: '', canvas: null };
  /** Sampul diperbesar & dikaburkan penuh layar. Dikerjakan di kanvas kecil lalu diregangkan: jauh lebih cepat. */
  function coverBlur(img) {
    if (!img) return null;
    const key = imgKey(img);
    if (blurCache.key === key && blurCache.canvas) return blurCache.canvas;
    const sw = 108, sh = 192;
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    const sg = small.getContext('2d');
    const s = sh * 1.35;
    sg.filter = 'blur(6px) saturate(1.5)';
    sg.drawImage(img, (sw - s) / 2, (sh - s) / 2, s, s);
    const big = document.createElement('canvas');
    big.width = W; big.height = H;
    const bg = big.getContext('2d');
    bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high';
    bg.drawImage(small, 0, 0, W, H);
    blurCache = { key, canvas: big };
    return big;
  }

  function colorPair(pal) {
    if (colorId === 'accent') { const a = appAccent(); return { from: a, to: shade(a, 0.18) }; }
    if (colorId === 'cover') return { from: pal.vivid, to: shade(pal.avg, 0.28) };
    const c = COLORS.find((x) => x.id === colorId) || COLORS[2];
    return { from: parseColor(c.from), to: parseColor(c.to) };
  }
  /** Warna aksen tunggal dari pilihan latar (untuk garis emas, pita, lencana, dsb). */
  function accentColor(pal) {
    if (colorId === 'cover') return pal.vivid;
    if (colorId === 'accent') return appAccent();
    return colorPair(pal).from;
  }

  function drawBg(ctx, img, pal) {
    if (colorId === 'cover' && img) {
      ctx.fillStyle = rgba(shade(pal.avg, 0.55)); ctx.fillRect(0, 0, W, H);
      ctx.drawImage(coverBlur(img), 0, 0);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,.10)'); g.addColorStop(1, 'rgba(0,0,0,.36)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      return;
    }
    const { from, to } = colorPair(pal);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, rgba(from)); g.addColorStop(1, rgba(to));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  function drawCover(ctx, img, x, y, size, radius) {
    roundRect(ctx, x, y, size, size, radius);
    ctx.save();
    ctx.clip();
    if (img) {
      ctx.drawImage(img, x, y, size, size);
    } else {
      ctx.fillStyle = '#2a313c'; ctx.fillRect(x, y, size, size);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.font = `700 ${Math.round(size * 0.4)}px ${SANS}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(((track.title || '?')[0] || '?').toUpperCase(), x + size / 2, y + size / 2 + size * 0.02);
    }
    ctx.restore();
  }

  // ---------- logo Armuse ----------
  const logoImg = new Image();
  let logoReady = false;
  logoImg.onload = () => { logoReady = true; if (track) render(); };
  logoImg.src = 'data:image/png;base64,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';

  /** Logo (ikon + tulisan "Armuse"). (x,y) = titik acuan sesuai `align`; y = sisi atas. Mengembalikan lebar total. */
  function drawLogo(ctx, x, y, size, o = {}) {
    const { color = '#fff', alpha = 0.92, align = 'left', name = true } = o;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${Math.round(size * 0.62)}px ${SANS}`;
    const gap = Math.round(size * 0.3);
    const textW = name ? ctx.measureText('Armuse').width : 0;
    const total = size + (name ? gap + textW : 0);
    const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    roundRect(ctx, x0, y, size, size, size * 0.24);
    ctx.save();
    ctx.clip();
    if (logoReady) ctx.drawImage(logoImg, x0, y, size, size);
    else { ctx.fillStyle = '#fff'; ctx.fillRect(x0, y, size, size); }
    ctx.restore();
    roundRect(ctx, x0, y, size, size, size * 0.24);
    ctx.strokeStyle = 'rgba(128,128,128,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (name) {
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('Armuse', x0 + size + gap, y + size / 2 + size * 0.04);
    }
    ctx.restore();
    return total;
  }

  const titleOf = () => track.title || 'Tanpa judul';
  const artistOf = () => track.displayArtist || '';

  // ================= TEMPLATE 1: Klasik =================
  function drawClassic(ctx, img, pal) {
    drawBg(ctx, img, pal);
    const cardW = 820, pad = 54, inner = cardW - pad * 2;
    const tf = fitText(ctx, titleOf(), { family: SANS, weight: 700, size: 50, min: 32, maxWidth: inner, maxLines: 3 });
    const af = fitText(ctx, artistOf(), { family: SANS, weight: 400, size: 34, min: 24, maxWidth: inner, maxLines: 2 });
    const logoH = showLogo ? 40 + 56 : 0;
    const cardH = pad + inner + 46 + blockH(tf) + 8 + blockH(af) + logoH + pad;
    const cx = (W - cardW) / 2, cy = (H - cardH) / 2 - 30;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 34;
    roundRect(ctx, cx, cy, cardW, cardH, 44);
    ctx.fillStyle = 'rgba(14,16,20,.94)'; ctx.fill();
    ctx.restore();

    drawCover(ctx, img, cx + pad, cy + pad, inner, 24);
    let y = cy + pad + inner + 46;
    ctx.fillStyle = '#fff';
    y += drawBlock(ctx, tf, cx + pad, y, { family: SANS, weight: 700 }) + 8;
    ctx.fillStyle = 'rgba(255,255,255,.66)';
    y += drawBlock(ctx, af, cx + pad, y, { family: SANS, weight: 400 });
    if (showLogo) drawLogo(ctx, cx + pad, y + 40, 56, { color: 'rgba(255,255,255,.75)', alpha: 1 });
  }

  // ================= TEMPLATE 2: Jurnal (scrapbook) =================
  function prng(seed) {   // pembangkit acak berbenih: hasil sama tiap render, jadi noise tidak "berkedip"
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hashStr = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

  function drawTape(ctx, cx, cy, w, h, rot, color) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    ctx.fillStyle = rgba(color, 0.78);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2);
    for (let i = 0; i <= 8; i++) ctx.lineTo(-w / 2 + (w / 8) * i, -h / 2 + (i % 2 ? 4 : 0));   // tepi gerigi
    ctx.lineTo(w / 2, h / 2);
    for (let i = 8; i >= 0; i--) ctx.lineTo(-w / 2 + (w / 8) * i, h / 2 - (i % 2 ? 4 : 0));
    ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 9;
    for (let x = -w; x < w; x += 26) { ctx.beginPath(); ctx.moveTo(x, -h); ctx.lineTo(x + h * 1.2, h); ctx.stroke(); }
    ctx.restore();
  }

  function drawJournal(ctx, img, pal) {
    const ink = [59, 47, 36];
    const acc = accentColor(pal);
    // kertas krem + vinyet + titik-titik ala bullet journal + serat halus
    ctx.fillStyle = '#ece3cf'; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 1250);
    vg.addColorStop(0, 'rgba(255,250,235,0)'); vg.addColorStop(1, 'rgba(120,88,48,.30)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(96,72,40,.24)';
    for (let y = 108; y < H; y += 54) for (let x = 54; x < W; x += 54) { ctx.beginPath(); ctx.arc(x, y, 2.3, 0, Math.PI * 2); ctx.fill(); }
    const rnd = prng(hashStr(track.id || track.title));
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(80,60,30,${(0.03 + rnd() * 0.1).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.6 + rnd() * 1.1, 0, Math.PI * 2); ctx.fill();
    }

    // judul tulisan tangan + garis bergelombang
    ctx.save();
    ctx.translate(104, 214); ctx.rotate(-2 * Math.PI / 180);
    ctx.fillStyle = rgba(ink); ctx.font = `700 78px ${HAND}`; ctx.textBaseline = 'alphabetic';
    ctx.fillText('lagi diputar ♪', 0, 0);
    ctx.strokeStyle = rgba(acc, 0.9); ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = 0; x <= 470; x += 6) { const y = 30 + Math.sin(x / 15) * 6; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.restore();

    // kartu warna di belakang (miring)
    ctx.save();
    ctx.translate(W / 2 + 38, H / 2 + 60); ctx.rotate(6.5 * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,.22)'; ctx.shadowBlur = 36; ctx.shadowOffsetY = 16;
    roundRect(ctx, -350, -470, 700, 940, 10);
    ctx.fillStyle = rgba(mixc(acc, [255, 255, 255], 0.5)); ctx.fill();
    ctx.restore();

    // polaroid utama
    const pw = 750, pad = 50, photo = pw - pad * 2;
    const tf = fitText(ctx, titleOf(), { family: HAND, weight: 700, size: 50, min: 30, maxWidth: photo, maxLines: 3 });
    const af = fitText(ctx, artistOf() ? '— ' + artistOf() : '', { family: HAND, weight: 400, size: 36, min: 24, maxWidth: photo, maxLines: 1 });
    const ph = pad + photo + 40 + blockH(tf) + 8 + blockH(af) + 50;
    ctx.save();
    ctx.translate(W / 2 - 8, H / 2 + 24); ctx.rotate(-3.5 * Math.PI / 180);
    ctx.shadowColor = 'rgba(0,0,0,.34)'; ctx.shadowBlur = 54; ctx.shadowOffsetY = 26;
    roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 6);
    ctx.fillStyle = '#fffdf8'; ctx.fill();
    ctx.shadowColor = 'transparent';
    drawCover(ctx, img, -pw / 2 + pad, -ph / 2 + pad, photo, 3);
    ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = 2;
    ctx.strokeRect(-pw / 2 + pad, -ph / 2 + pad, photo, photo);
    let ty = -ph / 2 + pad + photo + 40;
    ctx.fillStyle = '#2a2a2e';
    ty += drawBlock(ctx, tf, -pw / 2 + pad, ty, { family: HAND, weight: 700 }) + 8;
    ctx.fillStyle = '#7a6b5a';
    drawBlock(ctx, af, -pw / 2 + pad, ty, { family: HAND, weight: 400 });
    drawTape(ctx, -pw / 2 + 60, -ph / 2 + 6, 200, 60, -30, acc);
    drawTape(ctx, pw / 2 - 60, -ph / 2 + 4, 200, 60, 26, mixc(acc, [255, 255, 255], 0.25));
    ctx.restore();

    // cap tanggal
    const date = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    ctx.save();
    ctx.translate(W - 270, H - 330); ctx.rotate(-9 * Math.PI / 180);
    const stamp = [178, 58, 58];
    ctx.strokeStyle = rgba(stamp, 0.72); ctx.fillStyle = rgba(stamp, 0.78);
    ctx.lineWidth = 6; roundRect(ctx, -170, -62, 340, 124, 16); ctx.stroke();
    ctx.lineWidth = 2; roundRect(ctx, -158, -50, 316, 100, 10); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.font = `700 34px ${SERIF}`; ctx.fillText('NOW PLAYING', 0, -13);
    ctx.font = `700 27px ${SERIF}`; ctx.fillText(date, 0, 24);
    ctx.restore();

    if (showLogo) drawLogo(ctx, W / 2, H - 168, 56, { color: rgba(ink), alpha: 0.85, align: 'center' });
  }

  // ================= TEMPLATE 3: Kartu putih (ala kartu Apple Music) =================
  function drawCard(ctx, img, pal) {
    drawBg(ctx, img, pal);
    const cardW = 860, pad = 44, inner = cardW - pad * 2;
    const tf = fitText(ctx, titleOf(), { family: SANS, weight: 700, size: 56, min: 34, maxWidth: inner, maxLines: 3 });
    const af = fitText(ctx, artistOf(), { family: SANS, weight: 400, size: 44, min: 28, maxWidth: inner, maxLines: 2 });
    const logoH = showLogo ? 34 + 54 : 0;
    const cardH = pad + inner + 40 + blockH(tf) + 4 + blockH(af) + logoH + pad;
    const cx = (W - cardW) / 2, cy = (H - cardH) / 2 - 20;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.34)'; ctx.shadowBlur = 80; ctx.shadowOffsetY = 36;
    roundRect(ctx, cx, cy, cardW, cardH, 44);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.30)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    roundRect(ctx, cx + pad, cy + pad, inner, inner, 26);
    ctx.fillStyle = '#ddd'; ctx.fill();
    ctx.restore();
    drawCover(ctx, img, cx + pad, cy + pad, inner, 26);

    let y = cy + pad + inner + 40;
    ctx.fillStyle = '#101114';
    y += drawBlock(ctx, tf, cx + pad, y, { family: SANS, weight: 700 }) + 4;
    ctx.fillStyle = '#25272c';
    y += drawBlock(ctx, af, cx + pad, y, { family: SANS, weight: 400 });
    if (showLogo) drawLogo(ctx, cx + pad, y + 34, 54, { color: '#9a9da3', alpha: 1 });
  }

  // ================= TEMPLATE 4: Lirik (panel kaca ala Story lirik) =================
  function drawLyrics(ctx, img, pal) {
    drawBg(ctx, img, pal);
    const panelW = 900, padX = 64, px = (W - panelW) / 2;
    const text = (lyricText || '').trim() || titleOf();
    const lf = fitText(ctx, text, { family: SANS, weight: 700, size: 84, min: 42, maxWidth: panelW - padX * 2, maxLines: 7, lh: 1.28 });
    const topPad = 64, lyrH = blockH(lf) + topPad * 2;

    const coverS = 156, tx = px + padX + coverS + 34, tw = panelW - padX * 2 - coverS - 34;
    const tf = fitText(ctx, titleOf(), { family: SANS, weight: 700, size: 44, min: 30, maxWidth: tw, maxLines: 2 });
    const af = fitText(ctx, artistOf(), { family: SANS, weight: 400, size: 36, min: 26, maxWidth: tw, maxLines: 1 });
    const textH = blockH(tf) + 4 + blockH(af) + (showLogo ? 14 + 38 : 0);
    const rowContent = Math.max(coverS, textH);
    const rowH = rowContent + 88;
    const panelH = lyrH + rowH;
    const py = (H - panelH) / 2 - 10;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.34)'; ctx.shadowBlur = 70; ctx.shadowOffsetY = 30;
    roundRect(ctx, px, py, panelW, panelH, 56);
    ctx.fillStyle = 'rgba(20,22,34,.30)'; ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, px, py, panelW, panelH, 56);
    ctx.clip();
    ctx.fillStyle = 'rgba(34,38,58,.34)'; ctx.fillRect(px, py, panelW, lyrH);
    ctx.fillStyle = 'rgba(14,16,28,.48)'; ctx.fillRect(px, py + lyrH, panelW, rowH);
    ctx.restore();
    roundRect(ctx, px + 1, py + 1, panelW - 2, panelH - 2, 55);
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = '#fff';
    drawBlock(ctx, lf, px + padX, py + topPad, { family: SANS, weight: 700 });

    const ry = py + lyrH + 44;
    drawCover(ctx, img, px + padX, ry, coverS, 20);
    let y = ry;
    ctx.fillStyle = '#fff';
    y += drawBlock(ctx, tf, tx, y, { family: SANS, weight: 700 }) + 4;
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    y += drawBlock(ctx, af, tx, y, { family: SANS, weight: 400 });
    if (showLogo) drawLogo(ctx, tx, y + 14, 38, { color: 'rgba(255,255,255,.6)', alpha: 1 });
  }

  // ================= TEMPLATE 5: Vinyl (gelap, mewah) =================
  function drawVinyl(ctx, img, pal) {
    const acc = accentColor(pal);
    const gold = mixc(acc, [255, 255, 255], 0.22);
    ctx.fillStyle = '#08090c'; ctx.fillRect(0, 0, W, H);
    if (colorId === 'cover' && img) {
      ctx.globalAlpha = 0.6; ctx.drawImage(coverBlur(img), 0, 0); ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(6,7,10,.58)'; ctx.fillRect(0, 0, W, H);
    } else {
      const gl = ctx.createRadialGradient(W * 0.55, H * 0.36, 40, W * 0.55, H * 0.36, 900);
      gl.addColorStop(0, rgba(acc, 0.40)); gl.addColorStop(1, rgba(acc, 0));
      ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
    }
    const fade = ctx.createLinearGradient(0, H * 0.55, 0, H);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = fade; ctx.fillRect(0, H * 0.55, W, H * 0.45);

    // bingkai emas ganda
    ctx.strokeStyle = rgba(gold, 0.6); ctx.lineWidth = 2.5; ctx.strokeRect(52, 52, W - 104, H - 104);
    ctx.strokeStyle = rgba(gold, 0.24); ctx.lineWidth = 1.5; ctx.strokeRect(68, 68, W - 136, H - 136);

    // penanda atas: garis dihitung dari lebar teks supaya tidak menembus huruf
    ctx.fillStyle = rgba(gold, 0.9); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.font = `600 28px ${SANS}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '14px';
    const capW = ctx.measureText('NOW SPINNING').width;
    ctx.fillText('NOW SPINNING', W / 2 + 7, 190);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = rgba(gold, 0.5);
    ctx.fillRect(W / 2 - capW / 2 - 40 - 110, 181, 110, 2); ctx.fillRect(W / 2 + capW / 2 + 40, 181, 110, 2);

    // piringan hitam di belakang sampul
    const cover = 620, cxv = 90;
    // ukur teks dulu → tinggi seluruh blok diketahui → bisa ditaruh di tengah ruang antara penanda atas & logo
    const tf = fitText(ctx, titleOf(), { family: SERIF, weight: 700, size: 86, min: 44, maxWidth: 900, maxLines: 3, lh: 1.14 });
    if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
    const af = fitText(ctx, artistOf().toUpperCase(), { family: SANS, weight: 500, size: 34, min: 22, maxWidth: 900, maxLines: 2, lh: 1.3 });
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    const bf = track.album ? fitText(ctx, track.album, { family: SANS, weight: 400, size: 30, min: 22, maxWidth: 900, maxLines: 1 }) : null;
    const contentH = cover + 84 + 3 + 30 + blockH(tf) + 14 + blockH(af) + 8 + (bf ? blockH(bf) : 0);
    const zoneTop = 250, zoneBottom = showLogo ? H - 260 : H - 150;
    const cyv = zoneTop + Math.max(0, (zoneBottom - zoneTop - contentH) / 2);
    const dcx = 725, dcy = cyv + cover / 2, dr = 290;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 20;
    ctx.beginPath(); ctx.arc(dcx, dcy, dr, 0, Math.PI * 2);
    const dg = ctx.createRadialGradient(dcx, dcy, 20, dcx, dcy, dr);
    dg.addColorStop(0, '#1b1b20'); dg.addColorStop(1, '#050506');
    ctx.fillStyle = dg; ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1;
    for (let r = 118, i = 0; r < dr - 4; r += 5, i++) {
      ctx.strokeStyle = `rgba(255,255,255,${i % 3 ? 0.03 : 0.075})`;
      ctx.beginPath(); ctx.arc(dcx, dcy, r, 0, Math.PI * 2); ctx.stroke();
    }
    if (ctx.createConicGradient) {
      ctx.save();
      ctx.beginPath(); ctx.arc(dcx, dcy, dr - 2, 0, Math.PI * 2); ctx.arc(dcx, dcy, 112, 0, Math.PI * 2, true);
      ctx.clip('evenodd');
      const cg = ctx.createConicGradient(-0.5, dcx, dcy);
      [[0, 0], [0.05, 0.20], [0.11, 0], [0.5, 0], [0.55, 0.16], [0.61, 0], [1, 0]].forEach(([s, a]) => cg.addColorStop(s, `rgba(255,255,255,${a})`));
      ctx.fillStyle = cg; ctx.fillRect(dcx - dr, dcy - dr, dr * 2, dr * 2);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(dcx, dcy, 104, 0, Math.PI * 2);
    const lg = ctx.createLinearGradient(dcx - 100, dcy - 100, dcx + 100, dcy + 100);
    lg.addColorStop(0, rgba(mixc(acc, [255, 255, 255], 0.15))); lg.addColorStop(1, rgba(shade(acc, 0.55)));
    ctx.fillStyle = lg; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 2; ctx.stroke();
    drawLogo(ctx, dcx - 34, dcy - 34, 68, { name: false, alpha: 0.95 });
    ctx.beginPath(); ctx.arc(dcx, dcy, 8, 0, Math.PI * 2); ctx.fillStyle = '#08090c'; ctx.fill();

    // sampul
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 60; ctx.shadowOffsetX = 18; ctx.shadowOffsetY = 26;
    roundRect(ctx, cxv, cyv, cover, cover, 12);
    ctx.fillStyle = '#111'; ctx.fill();
    ctx.restore();
    drawCover(ctx, img, cxv, cyv, cover, 12);
    roundRect(ctx, cxv, cyv, cover, cover, 12);
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 2; ctx.stroke();

    // tipografi
    let y = cyv + cover + 84;
    ctx.fillStyle = rgba(gold, 0.85); ctx.fillRect(90, y, 120, 3);
    y += 30;
    ctx.fillStyle = '#fff';
    y += drawBlock(ctx, tf, 90, y, { family: SERIF, weight: 700 }) + 14;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
    ctx.fillStyle = rgba(gold);
    y += drawBlock(ctx, af, 90, y, { family: SANS, weight: 500 }) + 8;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (bf) {
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      drawBlock(ctx, bf, 90, y, { family: SANS, weight: 400 });
    }

    if (showLogo) {
      ctx.fillStyle = rgba(gold, 0.6); ctx.fillRect(W / 2 - 60, H - 214, 120, 2);
      drawLogo(ctx, W / 2, H - 186, 58, { color: 'rgba(255,255,255,.88)', alpha: 1, align: 'center' });
    }
  }

  const DRAW = { classic: drawClassic, journal: drawJournal, card: drawCard, lyrics: drawLyrics, vinyl: drawVinyl };

  // ---------- stiker ----------
  const mctx = document.createElement('canvas').getContext('2d');
  function stickerFont(s) {
    if (s.type === 'emoji') return `${s.size}px ${EMOJI_FONT}`;
    if (s.type === 'badge') return `800 ${s.size}px ${SANS}`;
    return `800 ${s.size}px ${SANS}`;
  }
  function stickerBox(s) {
    if (s.type === 'emoji') return { w: s.size * 1.15, h: s.size * 1.15 };
    mctx.font = stickerFont(s);
    if ('letterSpacing' in mctx) mctx.letterSpacing = s.type === 'badge' ? `${Math.round(s.size * 0.12)}px` : '0px';
    const tw = mctx.measureText(s.v).width;
    if (s.type === 'badge') return { w: tw + s.size * 1.1, h: s.size * 1.7 };
    return { w: tw + s.size * 0.3, h: s.size * 1.3 };
  }
  function drawSticker(ctx, s) {
    const { w, h } = stickerBox(s);
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rot * Math.PI / 180);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (s.type === 'emoji') {
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = s.size * 0.12; ctx.shadowOffsetY = s.size * 0.05;
      ctx.font = stickerFont(s);
      ctx.fillText(s.v, 0, s.size * 0.05);
    } else if (s.type === 'badge') {
      const acc = accentColor(palette(getCoverImgEl()));
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fillStyle = rgba(acc); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = lum(acc) > 0.55 ? '#111' : '#fff';
      ctx.font = stickerFont(s);
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(s.size * 0.12)}px`;
      ctx.fillText(s.v, Math.round(s.size * 0.06), s.size * 0.04);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.fillStyle = '#fff'; ctx.font = stickerFont(s);
      ctx.fillText(s.v, 0, 0);
    }
    ctx.restore();
  }
  function drawSelection(ctx, s) {
    const { w, h } = stickerBox(s);
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.rot * Math.PI / 180);
    roundRect(ctx, -w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 18);
    ctx.setLineDash([18, 12]);
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();
  }
  function hitTest(p) {
    for (let i = stickers.length - 1; i >= 0; i--) {
      const s = stickers[i], { w, h } = stickerBox(s);
      const a = -s.rot * Math.PI / 180, dx = p.x - s.x, dy = p.y - s.y;
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(lx) <= w / 2 + 8 && Math.abs(ly) <= h / 2 + 8) return s;
    }
    return null;
  }
  const selected = () => stickers.find((s) => s.id === selId) || null;

  function addSticker(type, v) {
    const size = type === 'emoji' ? 150 : type === 'badge' ? 48 : 68;
    const s = {
      id: uid++, type, v, size,
      x: W / 2 + (Math.random() - 0.5) * 380, y: H * 0.26 + (Math.random() - 0.5) * 200,
      rot: Math.round((Math.random() - 0.5) * 24),
    };
    stickers.push(s);
    selId = s.id;
    refreshSel();
    render();
  }

  // ---------- render ----------
  let baseCanvas = null, baseKey = '';
  function render(ui = true) {
    const canvas = $('#share-canvas');
    if (!canvas || !track) return;
    const ctx = canvas.getContext('2d');
    const img = getCoverImgEl();
    const key = [track.id, layout, colorId, showLogo, lyricText, imgKey(img), logoReady].join('|');
    if (key !== baseKey || !baseCanvas) {
      if (!baseCanvas) { baseCanvas = document.createElement('canvas'); baseCanvas.width = W; baseCanvas.height = H; }
      const bg = baseCanvas.getContext('2d');
      resetCtx(bg);
      bg.clearRect(0, 0, W, H);
      DRAW[layout](bg, img, palette(img));
      baseKey = key;
    }
    resetCtx(ctx);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(baseCanvas, 0, 0);
    stickers.forEach((s) => drawSticker(ctx, s));
    const sel = selected();
    if (ui && sel) drawSelection(ctx, sel);
  }
  const invalidate = () => { baseKey = ''; render(); };

  // ---------- lirik ----------
  function parseLrcLines(text) {
    return text.split(/\r?\n/)
      .map((raw) => { const m = /^\[\d+:\d+(?:\.\d+)?\](.*)$/.exec(raw.trim()); return m ? m[1].trim() : raw.trim(); })
      .filter(Boolean);
  }
  async function loadLyricSnippet(forTrack) {
    try {
      const r = await api.getLyrics({ id: forTrack.id, online: false });
      let lines = null;
      if (r && r.manual && r.byLang) {
        const first = Object.values(r.byLang)[0];
        if (first) lines = first.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      } else if (r && r.found && !r.instrumental) {
        lines = parseLrcLines(r.synced || r.plain || '');
      }
      if (track !== forTrack || lyricTouched || !lines || !lines.length) return;
      lyricText = lines.slice(0, 3).join('\n');
      const ta = $('#share-lyr');
      if (ta) ta.value = lyricText;
      invalidate();
    } catch (_) { /* tanpa lirik: pengguna bisa mengetik kutipan sendiri */ }
  }

  // ---------- dialog ----------
  function swatchStyle(c) {
    if (c.id === 'accent') return 'background:var(--accent)';
    if (c.id === 'cover') return '';
    return `background:linear-gradient(135deg,${c.from},${c.to})`;
  }
  function dialogHtml() {
    return `
      <div class="dlg-head"><h2 id="share-h">Bagikan</h2><p>Susun kartu lagu untuk Story atau status. Seret stiker di pratinjau untuk memindahkannya.</p></div>
      <div class="dlg-body">
        <div class="share-left"><div class="share-preview"><canvas id="share-canvas" width="${W}" height="${H}"></canvas></div></div>
        <div class="share-right">
          <section class="share-sec"><h3>Template</h3>
            <div class="share-tabs">${LAYOUTS.map((l) => `<button type="button" class="share-tab${l.id === layout ? ' active' : ''}" data-layout="${l.id}">${esc(l.label)}</button>`).join('')}</div>
          </section>
          <section class="share-sec"><h3>Latar</h3>
            <div class="share-colors">${COLORS.map((c) => `<button type="button" class="share-swatch sw-${c.id}${c.id === colorId ? ' active' : ''}" data-color="${c.id}" title="${esc(c.label)}" aria-label="${esc(c.label)}" style="${swatchStyle(c)}"></button>`).join('')}</div>
          </section>
          <section class="share-sec" id="share-lyr-sec"${layout === 'lyrics' ? '' : ' hidden'}><h3>Kutipan lirik</h3>
            <textarea id="share-lyr" rows="4" maxlength="400" placeholder="Ketik atau tempel kutipan lirik yang ingin ditampilkan besar">${esc(lyricText)}</textarea>
          </section>
          <section class="share-sec"><h3>Stiker</h3>
            <div class="share-stickers">${EMOJIS.map((e) => `<button type="button" class="share-stk" data-emoji="${e}" aria-label="Stiker ${e}">${e}</button>`).join('')}</div>
            <div class="share-badges">${BADGES.map((b) => `<button type="button" class="share-badge" data-badge="${esc(b)}">${esc(b)}</button>`).join('')}</div>
            <div class="share-textadd"><input id="share-text" type="text" maxlength="40" placeholder="Tulis teks sendiri…"><button type="button" class="btn-quiet" id="share-text-add">Tambah</button></div>
            <div class="share-sel" id="share-sel" hidden>
              <label>Ukuran <input type="range" class="rng" id="share-size" min="30" max="420" value="150"></label>
              <label>Putar <input type="range" class="rng" id="share-rot" min="-180" max="180" value="0"></label>
              <div class="share-sel-actions"><button type="button" class="btn-quiet" data-r="del">Hapus stiker ini</button></div>
            </div>
            <button type="button" class="btn-quiet share-clear" data-r="clear" hidden>Hapus semua stiker</button>
          </section>
          <section class="share-sec"><label class="share-check"><input type="checkbox" id="share-logo"${showLogo ? ' checked' : ''}> Tampilkan logo Armuse</label></section>
        </div>
      </div>
      <div class="dlg-foot">
        <span class="spacer"></span>
        <button class="btn-quiet" data-r="close">Tutup</button>
        <button class="btn-quiet" data-r="copy">Salin gambar</button>
        <button class="btn-primary" data-r="save">Simpan sebagai PNG</button>
      </div>`;
  }

  const setPct = (el) => el.style.setProperty('--pct', ((el.value - el.min) / (el.max - el.min)) * 100 + '%');

  function refreshSel() {
    const box = $('#share-sel');
    if (!box) return;
    const s = selected();
    box.hidden = !s;
    const clr = $('.share-clear');
    if (clr) clr.hidden = !stickers.length;
    if (!s) return;
    const size = $('#share-size'), rot = $('#share-rot');
    size.min = s.type === 'emoji' ? 50 : 24; size.max = s.type === 'emoji' ? 420 : 160;
    size.value = s.size; rot.value = s.rot;
    setPct(size); setPct(rot);
  }

  function toCanvasPoint(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }

  function wireDialog(d) {
    const canvas = $('#share-canvas', d);

    $$('[data-layout]', d).forEach((b) => b.addEventListener('click', () => {
      layout = b.dataset.layout;
      $$('[data-layout]', d).forEach((x) => x.classList.toggle('active', x === b));
      $('#share-lyr-sec', d).hidden = layout !== 'lyrics';
      invalidate();
    }));
    $$('[data-color]', d).forEach((b) => b.addEventListener('click', () => {
      colorId = b.dataset.color;
      $$('[data-color]', d).forEach((x) => x.classList.toggle('active', x === b));
      invalidate();
    }));
    $('#share-lyr', d).addEventListener('input', (e) => { lyricText = e.target.value; lyricTouched = true; invalidate(); });
    $('#share-logo', d).addEventListener('change', (e) => { showLogo = e.target.checked; invalidate(); });

    $$('[data-emoji]', d).forEach((b) => b.addEventListener('click', () => addSticker('emoji', b.dataset.emoji)));
    $$('[data-badge]', d).forEach((b) => b.addEventListener('click', () => addSticker('badge', b.dataset.badge)));
    const txt = $('#share-text', d);
    const addText = () => { const v = txt.value.trim(); if (!v) return; addSticker('text', v); txt.value = ''; };
    $('#share-text-add', d).addEventListener('click', addText);
    txt.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addText(); } });

    $('#share-size', d).addEventListener('input', (e) => { const s = selected(); if (s) { s.size = +e.target.value; setPct(e.target); render(); } });
    $('#share-rot', d).addEventListener('input', (e) => { const s = selected(); if (s) { s.rot = +e.target.value; setPct(e.target); render(); } });

    // seret stiker langsung di pratinjau
    canvas.addEventListener('pointerdown', (e) => {
      const p = toCanvasPoint(canvas, e), hit = hitTest(p);
      if (hit) {
        selId = hit.id;
        stickers.splice(stickers.indexOf(hit), 1); stickers.push(hit);   // naikkan ke lapisan paling atas
        drag = { dx: hit.x - p.x, dy: hit.y - p.y };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      } else selId = null;
      refreshSel(); render();
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = toCanvasPoint(canvas, e);
      if (drag) {
        const s = selected();
        if (s) { s.x = clamp(p.x + drag.dx, 0, W); s.y = clamp(p.y + drag.dy, 0, H); render(); }
      } else canvas.style.cursor = hitTest(p) ? 'grab' : 'default';
    });
    const endDrag = () => { drag = null; };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', (e) => {
      const s = hitTest(toCanvasPoint(canvas, e)) || selected();
      if (!s) return;
      e.preventDefault();
      s.size = clamp(Math.round(s.size * (e.deltaY < 0 ? 1.07 : 0.93)), s.type === 'emoji' ? 50 : 24, s.type === 'emoji' ? 420 : 160);
      selId = s.id; refreshSel(); render();
    }, { passive: false });

    const removeSel = () => { stickers = stickers.filter((s) => s.id !== selId); selId = null; refreshSel(); render(); };
    d.onkeydown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selId && !/^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName)) {
        e.preventDefault(); removeSel();
      }
    };

    d.onclick = (e) => {
      const act = e.target.closest('[data-r]');
      if (!act) return;
      const r = act.dataset.r;
      if (r === 'close') { d.close(); return; }
      if (r === 'del') { removeSel(); return; }
      if (r === 'clear') { stickers = []; selId = null; refreshSel(); render(); return; }
      // ekspor: gambar tanpa garis seleksi, ambil bitmap-nya, baru pulihkan tampilan pratinjau
      render(false);
      const name = `${track.title} - ${track.displayArtist}.png`;
      if (r === 'save') {
        canvas.toBlob(async (blob) => {
          const buf = new Uint8Array(await blob.arrayBuffer());
          if (api.saveImage) {
            const res = await api.saveImage({ data: Array.from(buf), suggestedName: name });
            if (res && res.ok && RD.toast) RD.toast('Gambar disimpan.');
          }
        }, 'image/png');
      } else if (r === 'copy') {
        canvas.toBlob(async (blob) => {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            if (RD.toast) RD.toast('Gambar disalin ke clipboard.');
          } catch (_) {
            if (RD.toast) RD.toast('Gagal menyalin — coba "Simpan sebagai PNG" saja.');
          }
        }, 'image/png');
      }
      render(true);
    };
  }

  async function open(t) {
    track = t;
    stickers = []; selId = null; drag = null;
    lyricText = ''; lyricTouched = false;
    baseKey = '';
    const d = $('#share');
    if (!d) return;
    d.innerHTML = dialogHtml();
    wireDialog(d);
    d.showModal();
    refreshSel();
    const el = document.querySelector('#npov-cover img');
    if (el && !el.complete) el.addEventListener('load', invalidate, { once: true });
    render();
    await loadLyricSnippet(t);
  }

  /** Render penuh (latar + template + stiker) ke ctx mana pun; dipakai skrip uji di luar Electron. */
  function renderTo(ctx, img) {
    resetCtx(ctx);
    ctx.clearRect(0, 0, W, H);
    DRAW[layout](ctx, img, palette(img));
    stickers.forEach((s) => drawSticker(ctx, s));
  }

  RD.share = {
    open,
    _test: {
      renderTo,
      fitText,
      breakLines,
      set(o) {
        if ('track' in o) track = o.track;
        if ('layout' in o) layout = o.layout;
        if ('colorId' in o) colorId = o.colorId;
        if ('showLogo' in o) showLogo = o.showLogo;
        if ('lyricText' in o) lyricText = o.lyricText;
      },
      addSticker(s) { stickers.push(Object.assign({ id: uid++, rot: 0 }, s)); },
      logoReady: () => logoReady,
    },
  };
})();
