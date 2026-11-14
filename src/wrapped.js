'use strict';
/* "Wrapped kamu" — Rekap Dengar ala Spotify Wrapped 2025
   Gaya visual: Neo-Brutalism, Op-Art (Optical Art) monokrom, lencana tahun vertikal,
   vektor doodle wireframe, dan layout tipografi editorial bersih ala Spotify Story (1080x1920).
   Semua data dihitung lokal di perangkat dari statistik pustaka tanpa koneksi server. */
(function () {
  const RD = window.RD;
  const { $, $$, esc } = RD;
  const api = window.api;

  const W = 1080, H = 1920;
  const SANS = '"Segoe UI", system-ui, -apple-system, sans-serif';
  const MONO = '"Consolas", "SFMono-Regular", "Courier New", monospace';

  // ---------- Utilitas Ukuran & Teks ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

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
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.filter = 'none';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.setLineDash([]);
  }

  function ellipsize(ctx, s, maxWidth) {
    const str = String(s || '').trim();
    if (ctx.measureText(str).width <= maxWidth) return str;
    const chars = Array.from(str);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > maxWidth) {
      chars.pop();
    }
    return chars.join('').trimEnd() + '…';
  }

  // ---------- Logo Armuse ----------
  const logoImg = new Image();
  let logoReady = false;
  logoImg.onload = () => { logoReady = true; renderCurrent(); };
  logoImg.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAABRZUlEQVR42s19eZwVxdX2U913GPaBYRGQRZBFEBUUNC5xI6IYFEx84xo1CUbj+iYaE2JQY9TEJcYk7r4CQSEoCoiIRlDAFQVZFER2lR2GHYaZuV19vj+6q7qqu6pv35kh+e7vd2HmTt/uWk6d/TyHASAYXowBZPiL67rwfR8U/rFFixY4/vjjceqpp+Lkk09G9+7d0aF9BzRu2gSMKHFzxhgAyO8zdQAUfoDw4Sz6DvnR78EVDGQeenIupmvls/SxUWzS8c+IgrURi8TCudjGE409ulZMnCG4t/YMZp9HfMjBM8XP+tP18TDjNlvHbPicfMK27duxdu0aLFq0CLPnzMEn8+Zhw4YN8ppcLgfP81DMi9kIMP5yHAeMMXDOwRjDgAEDccUVV+Ccc76H7t27o0GDBvqAybIZFCwlactnIQQSG1VokMoV8V0iZbNNd1EoStK8hdCDp8RHYx9dwUOSefWz3rfwDcXyMABk4zKxO8rvMf10rFu3Dh9++CHGjBmD999/H/l8Ho7jAiD4vm+9T9FL4LouOOcAgHPOGYxbbrkZQ4cO1YiNcw4GBsYYmMPSj29mwtI5kHpXP+QcWThhLfcZILFRsWlQKCJAysTIzr4onbPJORCsXFCekwKTYcqXtXVR1lz+jbFwcpRC4gRGDMSC75AfvJnD4Lqu/MY777yDv//975g2bVqCZuq0N+JGnTt1xh/u/QOuvPJK5HI5kO+D+35ABOHbNIEkv0gnGBaKNkl04c+qZM7K2hEjjziHVscsePKhfJlEfHIrwv81WV8Pz05wcvv45LUhh5TXs1BqhWfF932NGIkIL096GaN+PwqrVq3KRITMrgMGROX7Pn7wgx/iscf+ik6dOsH3ffi+H1F/jAHEORYVXHyx4Ir+Z9RLChORcbkVrhKI2IiVEPny+9nEPGJjzUZgup4b6YNyeDFik7qicW7mhzN9qlYlIRijL+8RKUJkVU1UzmpjHkICujkXW7Zswa9uuw3/mjABjuOAiKwHzwVwDyyGAgDce+8f8cQTj6OsrAye58FxHDjM0fUkxpJrwuICIX1boRBCfI0DZZ1FUo/FxsmY4Ybq36PNU+fGpExL2efYWGx0QT5pXNtqTzBmsfjiFoZtXNHaMzCrvms9JEjOOXGISRk9K2wRMQRqF3MCG6F58+b44Q9/iCZNm2DWrFnmZ9gYi+B8RISnn34aP//5z+F5HhhjcBwn9ZQI9m3dU0oSQMQtk6JZWIkKlSaMjcTJTxCvyUZM0fmYov0QKUyPooMXzlso2sJAU+epegrkBkXms4WTaiaCxUOQfpxVrh4sEBVUgE3rlioDTB4EZaxi7rlcDmPHjsWIESMkF4xzQo0DCiLzfR9PPfUUrrvuOuTzebiuGxBf/PgzprFnEyeMWLcgbrtIFSdXLmCcC8V/RpLQjJ+TmVPEF5XIlyqGOCyO44A5TCMyof/kcjkpYrZu3YodO3aAMYaGDRsGkkJ5gwDu8+QhZuZfWFw8M7M8YTE5I39muluHIU3CROqTiVmwhDWcTqvBPjvwPA8nnHACOnTogGnTpkm1jdk4oFAaR40ahXvvvRc1+RqU5Ers3CTGMYq3dGptn9qNB8Pi2p4giM1xHM2iE698Po89e/bg4MGD2LVrFw4//HCUl5fLRZ6/YD7Gj5+AuXPmYMvmzfA8D42bNED7du3QpUsX9OzZE3379sWxxx6Lo3odBcd1FM5K6rEJ7emMhpC67oXcTBlW26a72nXs7Ba+53koKSnBnXfeiQceeCDhK5RjEpzv+9//PqZNex2+z+E6rsFdErJ1H5l1hDpQVyCKwrExxlJFahaHsxCPjOluhOrqaqxatQqLFy/GihUrsGrlSmzavBm7du3Ctm3b0KdPb0wYPwHtO3QA5xx/+MMf8Mhf/oKDlZUFp';

  function drawSpotifyStyleLogo(ctx, x, y, t) {
    ctx.save();
    const r = 24;
    const cx = x + r;
    const cy = y;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = t.text;
    ctx.fill();

    if (logoReady) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, cx - r + 3, cy - r + 3, (r - 3) * 2, (r - 3) * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = t.bg;
      ctx.font = '900 24px ' + SANS;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('A', cx, cy + 2);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '900 32px ' + SANS;
    ctx.fillStyle = t.text;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.fillText('ARMUSE', x + r * 2 + 16, cy + 1);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    ctx.restore();
  }

  // ---------- Cache Cover Gambar ----------
  let coverGen = 0;
  const coverCache = new Map();
  function loadTrackCover(track) {
    if (!track || !track.cover) return null;
    let entry = coverCache.get(track.id);
    if (!entry) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      entry = { img, ready: false };
      coverCache.set(track.id, entry);
      img.onload = () => { entry.ready = true; coverGen++; renderCurrent(); };
      img.onerror = () => { coverCache.delete(track.id); };
      img.src = (api && api.mediaUrl ? api.mediaUrl(track.cover) : track.cover);
    }
    return entry.ready ? entry.img : null;
  }

  function getCoverImgFor(track) {
    const el = document.querySelector('#npov-cover img');
    if (el && el.complete && el.naturalWidth && RD.S && RD.S.byId) {
      const cur = RD.S.byId.get(RD.S.queue && RD.S.queue[RD.S.qi]);
      if (cur && track && cur.id === track.id) return el;
    }
    return null;
  }

  // ---------- DATA REKAP ----------
  function computeData() {
    const S = RD.S || { tracks: [] };
    const raw = RD.stats ? RD.stats.raw() : { totalMs: 0, tracks: {} };
    let withCount = S.tracks.map((t) => ({ t, r: raw.tracks[t.id] })).filter((x) => x.r && x.r.count > 0);
    const totalPlays = withCount.reduce((s, x) => s + x.r.count, 0);

    let isDemo = false;
    if (!totalPlays && S.tracks.length > 0) {
      isDemo = true;
      withCount = S.tracks.slice(0, 5).map((t, idx) => ({
        t,
        r: { count: Math.max(1, 14 - idx * 2), ms: (t.duration || 210) * 1000 * Math.max(1, 14 - idx * 2) },
      }));
    }

    const topTracks = withCount.slice().sort((a, b) => b.r.count - a.r.count).slice(0, 5);

    const artistAgg = new Map(), genreAgg = new Map();
    withCount.forEach(({ t, r }) => {
      const artist = t.displayArtist || t.artist || 'Artis Musik';
      artistAgg.set(artist, (artistAgg.get(artist) || 0) + r.count);
      (t.genres && t.genres.length ? t.genres : ['Pop', 'Indie', 'Acoustic']).forEach((g) => {
        genreAgg.set(g, (genreAgg.get(g) || 0) + r.count);
      });
    });

    const topArtists = [...artistAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topGenres = [...genreAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const totalMs = isDemo
      ? withCount.reduce((s, x) => s + (x.r.ms || 0), 0)
      : (raw.totalMs || withCount.reduce((s, x) => s + (x.r.ms || 0), 0));

    const minutesListened = Math.max(1, Math.round(totalMs / 60000));

    return {
      totalMs,
      minutesListened,
      totalPlays: isDemo ? withCount.reduce((s, x) => s + x.r.count, 0) : totalPlays,
      isDemo,
      library: S.tracks.length,
      favCount: S.tracks.filter((t) => t.fav).length,
      topTracks,
      topArtists,
      topGenres,
      year: new Date().getFullYear(),
      hasData: totalPlays > 0 || S.tracks.length > 0,
    };
  }

  // ================= 4 TEMA SPOTIFY WRAPPED 2025 =================
  const THEMES = {
    acid: {
      id: 'acid',
      label: 'Acid Lemon',
      tag: 'Light · Checkerboard',
      bg: '#F5F2EA',
      cardBg: '#FFFFFF',
      badgeColor: '#E6FD38',
      badgeText: '#000000',
      dark: false,
      text: '#0D0D10',
      muted: '#6B6862',
      faint: 'rgba(0,0,0,0.06)',
      border: 'rgba(0,0,0,0.12)',
      pattern: 'checkerboard',
    },
    violet: {
      id: 'violet',
      label: 'Neon Violet',
      tag: 'Dark · Zebra Waves',
      bg: '#111114',
      cardBg: '#19191E',
      badgeColor: '#989BF8',
      badgeText: '#000000',
      dark: true,
      text: '#FFFFFF',
      muted: '#9A9AA6',
      faint: 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.15)',
      pattern: 'zebra',
    },
    coral: {
      id: 'coral',
      label: 'Coral Red',
      tag: 'Light · Wave Ripples',
      bg: '#F5F1EB',
      cardBg: '#FFFFFF',
      badgeColor: '#FF4E36',
      badgeText: '#FFFFFF',
      dark: false,
      text: '#0D0D10',
      muted: '#6B6862',
      faint: 'rgba(0,0,0,0.06)',
      border: 'rgba(0,0,0,0.12)',
      pattern: 'ripple',
    },
    lime: {
      id: 'lime',
      label: 'Electric Lime',
      tag: 'Dark · Halftone Matrix',
      bg: '#111114',
      cardBg: '#19191E',
      badgeColor: '#4EF76A',
      badgeText: '#000000',
      dark: true,
      text: '#FFFFFF',
      muted: '#9A9AA6',
      faint: 'rgba(255,255,255,0.08)',
      border: 'rgba(255,255,255,0.15)',
      pattern: 'halftone',
    },
  };

  // ---------- POLA OP-ART (OPTICAL ART) MONOKROM ----------
  function drawCheckerboard(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const cols = 18;
    const rows = 16;
    const grid = [];

    for (let j = 0; j <= rows; j++) {
      grid[j] = [];
      const v = j / rows;
      for (let i = 0; i <= cols; i++) {
        const u = i / cols;
        const dx = Math.sin(v * Math.PI * 2.2 + 0.4) * 60 + Math.cos(u * Math.PI * 1.8) * 25;
        const dy = Math.cos(u * Math.PI * 2.4 - 0.3) * 50 + Math.sin(v * Math.PI * 1.5) * 20;
        grid[j][i] = { x: u * w + dx, y: v * h + dy };
      }
    }

    ctx.fillStyle = '#FFFFFF';
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if ((i + j) % 2 === 0) {
          const p0 = grid[j][i];
          const p1 = grid[j][i + 1];
          const p2 = grid[j + 1][i + 1];
          const p3 = grid[j + 1][i];
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  function drawZebraBands(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const numBands = 34;
    const steps = 30;

    for (let b = 0; b < numBands; b += 2) {
      const u0 = b / numBands;
      const u1 = (b + 1) / numBands;

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();

      for (let s = 0; s <= steps; s++) {
        const v = s / steps;
        const y = v * h;
        const wave = Math.sin(v * Math.PI * 3.4 + b * 0.16) * 45 + Math.cos(v * Math.PI * 1.8) * 25;
        const x = u0 * w + wave;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      for (let s = steps; s >= 0; s--) {
        const v = s / steps;
        const y = v * h;
        const wave = Math.sin(v * Math.PI * 3.4 + (b + 1) * 0.16) * 45 + Math.cos(v * Math.PI * 1.8) * 25;
        const x = u1 * w + wave;
        ctx.lineTo(x, y);
      }

      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawConcentricRipples(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.52;
    const cy = h * 0.48;
    const maxR = Math.hypot(w, h) * 0.72;
    const numRings = 26;
    const numPts = 72;

    for (let rIdx = numRings; rIdx >= 1; rIdx--) {
      const isWhite = rIdx % 2 === 0;
      ctx.fillStyle = isWhite ? '#FFFFFF' : '#000000';
      const baseR = (rIdx / numRings) * maxR;

      ctx.beginPath();
      for (let p = 0; p <= numPts; p++) {
        const angle = (p / numPts) * Math.PI * 2;
        const warp = 1 + 0.14 * Math.sin(angle * 3 + rIdx * 0.26) + 0.08 * Math.cos(angle * 5 - rIdx * 0.14);
        const radX = baseR * 1.15 * warp;
        const radY = baseR * 0.88 * warp;
        const px = cx + Math.cos(angle) * radX;
        const py = cy + Math.sin(angle) * radY;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHalftoneMatrix(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const spacing = 32;
    const cols = Math.ceil(w / spacing) + 1;
    const rows = Math.ceil(h / spacing) + 1;
    const cx = w * 0.5;
    const cy = h * 0.48;

    ctx.fillStyle = '#FFFFFF';
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const px = i * spacing;
        const py = j * spacing;
        const dist = Math.hypot(px - cx, py - cy);
        const wave = (Math.sin(px * 0.007 + py * 0.005) + Math.cos(dist * 0.012) + 2) / 4;
        const radius = Math.max(2, Math.min(spacing * 0.48, spacing * 0.10 + wave * spacing * 0.38));
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function renderPattern(ctx, patternType, w, h) {
    if (patternType === 'zebra') drawZebraBands(ctx, w, h);
    else if (patternType === 'ripple') drawConcentricRipples(ctx, w, h);
    else if (patternType === 'halftone') drawHalftoneMatrix(ctx, w, h);
    else drawCheckerboard(ctx, w, h);
  }

  // ---------- ELEMEN GRAFIS SPOTIFY WRAPPED ----------
  function drawDoodleLoops(ctx) {
    ctx.save();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.moveTo(35, 220);
    ctx.bezierCurveTo(65, 130, 200, 120, 215, 230);
    ctx.bezierCurveTo(230, 340, 105, 410, 75, 330);
    ctx.bezierCurveTo(45, 250, 130, 180, 240, 205);
    ctx.bezierCurveTo(340, 230, 360, 320, 315, 395);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(760, 130);
    ctx.bezierCurveTo(870, 95, 985, 160, 955, 280);
    ctx.bezierCurveTo(925, 395, 795, 375, 830, 270);
    ctx.bezierCurveTo(860, 170, 985, 250, 1015, 345);
    ctx.stroke();

    ctx.restore();
  }

  function drawYearBadge(ctx, year, x, y, w, h, t) {
    ctx.save();
    roundRect(ctx, x, y, w, h, 24);
    ctx.fillStyle = t.badgeColor;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    const digits = String(year || 2025).split('').slice(0, 4);
    ctx.fillStyle = t.badgeText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 64px ' + SANS;

    const rowStep = h / 4;
    digits.forEach((digit, i) => {
      ctx.fillText(digit, x + w / 2, y + rowStep * i + rowStep / 2 + 3);
    });
    ctx.restore();
  }

  function drawHeroArtwork(ctx, track, x, y, size, t) {
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 12;

    roundRect(ctx, x, y, size, size, 24);
    ctx.fillStyle = '#1A1A1E';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.save();
    roundRect(ctx, x, y, size, size, 24);
    ctx.clip();

    const img = track ? (getCoverImgFor(track) || loadTrackCover(track)) : null;
    if (img) {
      ctx.drawImage(img, x, y, size, size);
    } else {
      ctx.fillStyle = '#141418';
      ctx.fillRect(x, y, size, size);

      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      for (let r = 50; r < size * 0.7; r += 24) {
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      const title = track ? (track.title || track.displayArtist || 'A') : 'Armuse';
      const initial = (title[0] || 'A').toUpperCase();
      ctx.fillStyle = t.badgeColor;
      ctx.font = '900 ' + Math.round(size * 0.36) + 'px ' + SANS;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial, x + size / 2, y + size / 2 + 6);
    }
    ctx.restore();
    ctx.restore();
  }

  // ================= 1. SLIDE REKAP LENGKAP (SPOTIFY WRAPPED UTAMA) =================
  function slideSummary(ctx, themeId, d) {
    const t = THEMES[themeId] || THEMES.acid;
    const splitY = 960;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, splitY);
    ctx.clip();
    renderPattern(ctx, t.pattern, W, splitY);
    ctx.restore();

    drawDoodleLoops(ctx);
    drawYearBadge(ctx, d.year, 72, 170, 100, 360, t);

    const topTrack = d.topTracks[0] && d.topTracks[0].t;
    drawHeroArtwork(ctx, topTrack, 350, 180, 490, t);

    ctx.save();
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, splitY, W, H - splitY);

    ctx.fillStyle = t.border;
    ctx.fillRect(0, splitY, W, 2);

    const listTop = splitY + 80;
    const col1X = 72;
    const col2X = 550;
    const colW = 450;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 28px ' + SANS;
    ctx.fillStyle = t.muted;
    ctx.fillText('Top Artists', col1X, listTop);
    ctx.fillText('Top Songs', col2X, listTop);

    const rowStart = listTop + 50;
    const rowH = 58;

    for (let i = 0; i < 5; i++) {
      const y = rowStart + i * rowH;
      const rank = String(i + 1);

      const artistItem = d.topArtists[i];
      const artistName = artistItem ? artistItem[0] : (i === 0 ? 'Artis Musik' : '—');
      ctx.font = '800 32px ' + SANS;
      ctx.fillStyle = i === 0 ? (t.dark ? t.badgeColor : '#000000') : t.muted;
      ctx.fillText(rank, col1X, y);

      ctx.font = '600 30px ' + SANS;
      ctx.fillStyle = t.text;
      ctx.fillText(ellipsize(ctx, artistName, colW - 55), col1X + 46, y);

      const trackItem = d.topTracks[i];
      const songTitle = trackItem ? trackItem.t.title : (i === 0 ? 'Lagu Pilihan' : '—');
      ctx.font = '800 32px ' + SANS;
      ctx.fillStyle = i === 0 ? (t.dark ? t.badgeColor : '#000000') : t.muted;
      ctx.fillText(rank, col2X, y);

      ctx.font = '600 30px ' + SANS;
      ctx.fillStyle = t.text;
      ctx.fillText(ellipsize(ctx, songTitle, colW - 55), col2X + 46, y);
    }

    const statY = listTop + 430;

    ctx.font = '700 24px ' + SANS;
    ctx.fillStyle = t.muted;
    ctx.fillText('Minutes Listened', col1X, statY);

    const minFormatted = (d.minutesListened || 0).toLocaleString();
    ctx.font = '900 80px ' + SANS;
    ctx.fillStyle = t.text;
    ctx.fillText(minFormatted, col1X, statY + 84);

    ctx.font = '700 24px ' + SANS;
    ctx.fillStyle = t.muted;
    ctx.fillText('Top Genre', col2X, statY);

    const topGenre = (d.topGenres[0] && d.topGenres[0][0]) || 'Pop';
    ctx.font = '800 66px ' + SANS;
    ctx.fillStyle = t.text;
    ctx.fillText(ellipsize(ctx, topGenre, colW), col2X, statY + 84);

    const footY = H - 84;
    drawSpotifyStyleLogo(ctx, col1X, footY, t);

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px ' + MONO;
    ctx.fillStyle = t.muted;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText('ARMUSE.APP/WRAPPED', W - 72, footY);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    ctx.restore();
  }

  // ================= 2. SLIDE TOP 5 LAGU =================
  function slideTracks(ctx, themeId, d) {
    const t = THEMES[themeId] || THEMES.acid;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 320);
    ctx.clip();
    renderPattern(ctx, t.pattern, W, 320);
    ctx.restore();

    drawYearBadge(ctx, d.year, 72, 70, 78, 220, t);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '900 58px ' + SANS;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText('TOP SONGS', 180, 160);
    ctx.shadowColor = 'transparent';

    ctx.font = '600 24px ' + SANS;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Lagu yang paling sering kamu putar', 180, 206);

    const startY = 380;
    const rowH = 260;

    d.topTracks.slice(0, 5).forEach(({ t: trk, r }, i) => {
      const y = startY + i * rowH;

      roundRect(ctx, 72, y, W - 144, 230, 20);
      ctx.fillStyle = t.cardBg;
      ctx.fill();
      ctx.strokeStyle = i === 0 ? t.badgeColor : t.border;
      ctx.lineWidth = i === 0 ? 3 : 1;
      ctx.stroke();

      ctx.font = '900 48px ' + SANS;
      ctx.fillStyle = i === 0 ? (t.dark ? t.badgeColor : '#000000') : t.muted;
      ctx.fillText(String(i + 1).padStart(2, '0'), 108, y + 130);

      const img = getCoverImgFor(trk) || loadTrackCover(trk);
      roundRect(ctx, 200, y + 25, 180, 180, 16);
      ctx.save();
      ctx.clip();
      if (img) {
        ctx.drawImage(img, 200, y + 25, 180, 180);
      } else {
        ctx.fillStyle = '#222';
        ctx.fillRect(200, y + 25, 180, 180);
        ctx.fillStyle = t.badgeColor;
        ctx.font = '900 56px ' + SANS;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(((trk.title || 'A')[0] || 'A').toUpperCase(), 290, y + 115);
      }
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '800 36px ' + SANS;
      ctx.fillStyle = t.text;
      const title = ellipsize(ctx, trk.title, 430);
      ctx.fillText(title, 410, y + 95);

      ctx.font = '600 28px ' + SANS;
      ctx.fillStyle = t.muted;
      const artist = ellipsize(ctx, trk.displayArtist || trk.artist || 'Artis', 430);
      ctx.fillText(artist, 410, y + 145);

      const countText = r.count + '× putar';
      ctx.font = '700 22px ' + SANS;
      const badgeW = ctx.measureText(countText).width + 36;
      roundRect(ctx, W - 108 - badgeW, y + 90, badgeW, 48, 24);
      ctx.fillStyle = i === 0 ? t.badgeColor : t.faint;
      ctx.fill();
      ctx.fillStyle = i === 0 ? t.badgeText : t.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(countText, W - 108 - badgeW / 2, y + 114);
    });

    drawSpotifyStyleLogo(ctx, 72, H - 84, t);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px ' + MONO;
    ctx.fillStyle = t.muted;
    ctx.fillText('ARMUSE.APP/WRAPPED', W - 72, H - 84);
  }

  // ================= 3. SLIDE TOP 5 ARTIS =================
  function slideArtists(ctx, themeId, d) {
    const t = THEMES[themeId] || THEMES.acid;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 320);
    ctx.clip();
    renderPattern(ctx, t.pattern, W, 320);
    ctx.restore();

    drawYearBadge(ctx, d.year, 72, 70, 78, 220, t);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '900 58px ' + SANS;
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText('TOP ARTISTS', 180, 160);
    ctx.shadowColor = 'transparent';

    ctx.font = '600 24px ' + SANS;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Artis yang menemani hari-harimu', 180, 206);

    const startY = 380;
    const rowH = 260;
    const maxPlays = (d.topArtists[0] && d.topArtists[0][1]) || 1;

    d.topArtists.slice(0, 5).forEach(([name, count], i) => {
      const y = startY + i * rowH;

      roundRect(ctx, 72, y, W - 144, 230, 20);
      ctx.fillStyle = t.cardBg;
      ctx.fill();
      ctx.strokeStyle = i === 0 ? t.badgeColor : t.border;
      ctx.lineWidth = i === 0 ? 3 : 1;
      ctx.stroke();

      ctx.font = '900 52px ' + SANS;
      ctx.fillStyle = i === 0 ? (t.dark ? t.badgeColor : '#000000') : t.muted;
      ctx.fillText(String(i + 1).padStart(2, '0'), 108, y + 115);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '800 40px ' + SANS;
      ctx.fillStyle = t.text;
      ctx.fillText(ellipsize(ctx, name, 620), 200, y + 95);

      ctx.font = '700 24px ' + SANS;
      ctx.fillStyle = t.muted;
      ctx.fillText(count + ' lagu diputar', 200, y + 140);

      const barX = 200;
      const barY = y + 165;
      const barMaxW = W - 144 - 200 - 36;
      const barFillW = Math.max(30, (count / maxPlays) * barMaxW);

      roundRect(ctx, barX, barY, barMaxW, 18, 9);
      ctx.fillStyle = t.faint;
      ctx.fill();

      roundRect(ctx, barX, barY, barFillW, 18, 9);
      ctx.fillStyle = i === 0 ? t.badgeColor : (t.dark ? '#FFFFFF' : '#000000');
      ctx.fill();
    });

    drawSpotifyStyleLogo(ctx, 72, H - 84, t);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px ' + MONO;
    ctx.fillStyle = t.muted;
    ctx.fillText('ARMUSE.APP/WRAPPED', W - 72, H - 84);
  }

  // ================= 4. SLIDE WAKTU DENGAR =================
  function slideTime(ctx, themeId, d) {
    const t = THEMES[themeId] || THEMES.acid;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 420);
    ctx.clip();
    renderPattern(ctx, t.pattern, W, 420);
    ctx.restore();

    drawDoodleLoops(ctx);
    drawYearBadge(ctx, d.year, 72, 80, 80, 240, t);

    const cardY = 320;
    roundRect(ctx, 72, cardY, W - 144, 460, 28);
    ctx.fillStyle = t.cardBg;
    ctx.fill();
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 28px ' + SANS;
    ctx.fillStyle = t.muted;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText('TOTAL MINUTES LISTENED', W / 2, cardY + 90);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    const minStr = (d.minutesListened || 0).toLocaleString();
    ctx.font = '900 136px ' + SANS;
    ctx.fillStyle = t.text;
    ctx.fillText(minStr, W / 2, cardY + 240);

    const hours = Math.round((d.minutesListened || 0) / 60);
    ctx.font = '700 32px ' + SANS;
    ctx.fillStyle = t.dark ? t.badgeColor : '#000000';
    ctx.fillText('Setara dengan ~' + hours.toLocaleString() + ' jam musik nonstop', W / 2, cardY + 330);

    const metrics = [
      { label: 'Total Pemutaran', value: (d.totalPlays || 0).toLocaleString() + '×' },
      { label: 'Lagu di Pustaka', value: (d.library || 0).toLocaleString() },
      { label: 'Lagu Favorit', value: (d.favCount || 0).toLocaleString() },
    ];

    const mTop = cardY + 520;
    const mH = 180;
    metrics.forEach((m, idx) => {
      const my = mTop + idx * (mH + 24);
      roundRect(ctx, 72, my, W - 144, mH, 20);
      ctx.fillStyle = t.cardBg;
      ctx.fill();
      ctx.strokeStyle = t.border;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = '700 30px ' + SANS;
      ctx.fillStyle = t.muted;
      ctx.fillText(m.label, 120, my + mH / 2);

      ctx.textAlign = 'right';
      ctx.font = '900 52px ' + SANS;
      ctx.fillStyle = t.text;
      ctx.fillText(m.value, W - 120, my + mH / 2);
    });

    drawSpotifyStyleLogo(ctx, 72, H - 84, t);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px ' + MONO;
    ctx.fillStyle = t.muted;
    ctx.fillText('ARMUSE.APP/WRAPPED', W - 72, H - 84);
  }

  // ================= 5. SLIDE GENRE MUSIK =================
  function slideGenres(ctx, themeId, d) {
    const t = THEMES[themeId] || THEMES.acid;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, 400);
    ctx.clip();
    renderPattern(ctx, t.pattern, W, 400);
    ctx.restore();

    drawDoodleLoops(ctx);
    drawYearBadge(ctx, d.year, 72, 80, 80, 240, t);

    const topGenre = (d.topGenres[0] && d.topGenres[0][0]) || 'Pop';
    const cardY = 320;
    roundRect(ctx, 72, cardY, W - 144, 460, 28);
    ctx.fillStyle = t.cardBg;
    ctx.fill();
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 28px ' + SANS;
    ctx.fillStyle = t.muted;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
    ctx.fillText('TOP GENRE KAMU', W / 2, cardY + 90);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    ctx.font = '900 96px ' + SANS;
    ctx.fillStyle = t.text;
    ctx.fillText(ellipsize(ctx, topGenre, 800), W / 2, cardY + 230);

    const pillText = 'Aliran musik yang paling mendominasi';
    ctx.font = '700 28px ' + SANS;
    ctx.fillStyle = t.dark ? t.badgeColor : '#000000';
    ctx.fillText(pillText, W / 2, cardY + 320);

    const otherGenres = d.topGenres.slice(1, 6);
    if (otherGenres.length) {
      const gTop = cardY + 540;
      ctx.textAlign = 'left';
      ctx.font = '800 32px ' + SANS;
      ctx.fillStyle = t.muted;
      ctx.fillText('Genre Lain Yang Sering Diputar', 76, gTop);

      let by = gTop + 40;
      otherGenres.forEach(([gName, gCount], idx) => {
        roundRect(ctx, 72, by, W - 144, 96, 16);
        ctx.fillStyle = t.cardBg;
        ctx.fill();
        ctx.strokeStyle = t.border;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '800 32px ' + SANS;
        ctx.fillStyle = t.text;
        ctx.fillText((idx + 2) + '. ' + gName, 110, by + 48);

        ctx.textAlign = 'right';
        ctx.font = '700 26px ' + SANS;
        ctx.fillStyle = t.muted;
        ctx.fillText(gCount + ' pemutaran', W - 110, by + 48);

        by += 116;
      });
    }

    drawSpotifyStyleLogo(ctx, 72, H - 84, t);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px ' + MONO;
    ctx.fillStyle = t.muted;
    ctx.fillText('ARMUSE.APP/WRAPPED', W - 72, H - 84);
  }

  // ================= 6. SLIDE PENUTUP =================
  function slideClosing(ctx, themeId, d) {
    const t = THEMES[themeId] || THEMES.acid;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H * 0.48);
    ctx.clip();
    renderPattern(ctx, t.pattern, W, H * 0.48);
    ctx.restore();

    drawDoodleLoops(ctx);

    const cardY = H * 0.38;
    roundRect(ctx, 72, cardY, W - 144, 940, 32);
    ctx.fillStyle = t.cardBg;
    ctx.fill();
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const badgeW = 200, badgeH = 68;
    roundRect(ctx, W / 2 - badgeW / 2, cardY + 70, badgeW, badgeH, 34);
    ctx.fillStyle = t.badgeColor;
    ctx.fill();
    ctx.font = '900 36px ' + SANS;
    ctx.fillStyle = t.badgeText;
    ctx.textBaseline = 'middle';
    ctx.fillText('WRAPPED ' + d.year, W / 2, cardY + 70 + badgeH / 2 + 2);

    ctx.textBaseline = 'alphabetic';
    ctx.font = '900 80px ' + SANS;
    ctx.fillStyle = t.text;
    ctx.fillText('Terima Kasih!', W / 2, cardY + 250);

    ctx.font = '600 34px ' + SANS;
    ctx.fillStyle = t.muted;
    ctx.fillText('Sudah mendengarkan musik', W / 2, cardY + 320);
    ctx.fillText('sepanjang tahun ini bersama Armuse.', W / 2, cardY + 375);

    roundRect(ctx, 140, cardY + 450, W - 280, 190, 20);
    ctx.fillStyle = t.faint;
    ctx.fill();

    ctx.font = '900 84px ' + SANS;
    ctx.fillStyle = t.dark ? t.badgeColor : '#000000';
    ctx.fillText(String(d.favCount || 0), W / 2, cardY + 545);

    ctx.font = '700 26px ' + SANS;
    ctx.fillStyle = t.muted;
    ctx.fillText('Lagu Favorit Ditandai di Pustaka', W / 2, cardY + 595);

    ctx.font = '700 30px ' + SANS;
    ctx.fillStyle = t.text;
    ctx.fillText('Sampai jumpa di rekap tahun berikutnya ✨', W / 2, cardY + 730);

    drawSpotifyStyleLogo(ctx, 72, H - 84, t);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '800 24px ' + MONO;
    ctx.fillStyle = t.muted;
    ctx.fillText('ARMUSE.APP/WRAPPED', W - 72, H - 84);
  }

  // ================= DAFTAR SLIDE =================
  const SLIDES = [
    { id: 'summary', label: 'Rekap Lengkap (Spotify)', draw: slideSummary },
    { id: 'tracks', label: 'Top 5 Lagu', draw: slideTracks },
    { id: 'artists', label: 'Top 5 Artis', draw: slideArtists },
    { id: 'time', label: 'Waktu Dengar', draw: slideTime },
    { id: 'genres', label: 'Genre Musik', draw: slideGenres },
    { id: 'closing', label: 'Penutup', draw: slideClosing },
  ];

  // ================= STATE & RENDER =================
  let data = null, theme = 'acid', idx = 0;
  let baseCanvas = null, baseKey = '';

  function renderCurrent() {
    const canvas = $('#wrapped-canvas');
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const key = [idx, theme, data.hasData, logoReady, coverGen].join('|');
    if (key !== baseKey || !baseCanvas) {
      if (!baseCanvas) {
        baseCanvas = document.createElement('canvas');
        baseCanvas.width = W;
        baseCanvas.height = H;
      }
      const bg = baseCanvas.getContext('2d');
      resetCtx(bg);
      bg.clearRect(0, 0, W, H);
      SLIDES[idx].draw(bg, theme, data);
      baseKey = key;
    }
    resetCtx(ctx);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(baseCanvas, 0, 0);
  }

  const invalidate = () => { baseKey = ''; renderCurrent(); };

  function renderChrome() {
    const d = $('#wrapped');
    if (!d) return;
    $$('.wr-dot', d).forEach((b, i) => {
      b.classList.toggle('active', i === idx);
      b.classList.toggle('done', i < idx);
    });
    const lbl = $('#wrapped-slidelabel', d);
    if (lbl) lbl.textContent = (idx + 1) + '/' + SLIDES.length + ' · ' + SLIDES[idx].label;

    $$('.wr-theme-card', d).forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });

    $$('.wr-listitem', d).forEach((b, i) => {
      b.classList.toggle('active', i === idx);
    });

    const p = $('#wr-prev', d), n = $('#wr-next', d);
    if (p) p.disabled = idx === 0;
    if (n) n.disabled = idx === SLIDES.length - 1;
  }

  function goTo(i) {
    idx = clamp(i, 0, SLIDES.length - 1);
    invalidate();
    renderChrome();
  }

  function dialogHtml() {
    return `
      <div class="dlg-head">
        <h2 id="wrapped-h">Armuse Wrapped ${data.year}</h2>
        <p>Rekap musik tahunan dengan tema grafis ala Spotify Wrapped (Neo-Brutalism &amp; Op-Art). Simpan atau bagikan ke media sosial.</p>
      </div>
      <div class="dlg-body wr-body">
        <div class="wr-stage">
          <div class="wr-dots">${SLIDES.map(() => '<button type="button" class="wr-dot" role="tab"></button>').join('')}</div>
          <div class="wr-canvaswrap">
            <canvas id="wrapped-canvas" width="${W}" height="${H}"></canvas>
            <button type="button" class="wr-zone wr-zone-l" id="wr-prev" aria-label="Slide sebelumnya">‹</button>
            <button type="button" class="wr-zone wr-zone-r" id="wr-next" aria-label="Slide berikutnya">›</button>
          </div>
          <div class="wr-slidelabel" id="wrapped-slidelabel"></div>
        </div>
        <div class="wr-side">
          <section class="share-sec">
            <h3>Pilihan Tema Spotify</h3>
            <div class="wr-theme-grid">
              ${Object.values(THEMES).map((t) => `
                <button type="button" class="wr-theme-card ${t.id === theme ? 'active' : ''}" data-theme="${t.id}">
                  <div class="wr-theme-swatch" style="background:${t.badgeColor};"></div>
                  <div class="wr-theme-meta">
                    <b class="wr-theme-name">${esc(t.label)}</b>
                    <span class="wr-theme-tag">${esc(t.tag)}</span>
                  </div>
                </button>
              `).join('')}
            </div>
          </section>
          <section class="share-sec">
            <h3>Daftar Slide Cerita</h3>
            <div class="wr-list">
              ${SLIDES.map((s, i) => `
                <button type="button" class="wr-listitem ${i === idx ? 'active' : ''}" data-goto="${i}">
                  <span class="wr-list-num">${i + 1}</span>
                  <span class="wr-list-title">${esc(s.label)}</span>
                </button>
              `).join('')}
            </div>
          </section>
        </div>
      </div>
      <div class="dlg-foot">
        <span class="spacer"></span>
        <button class="btn-quiet" data-r="close">Tutup</button>
        <button class="btn-quiet" data-r="copy">Salin Gambar</button>
        <button class="btn-quiet" data-r="save">Simpan Slide Ini (PNG)</button>
        <button class="btn-primary" data-r="saveall">Simpan Semua (${SLIDES.length} PNG)</button>
      </div>`;
  }

  function exportName(i) {
    const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').trim();
    return 'Armuse Wrapped ' + data.year + ' - ' + (i + 1) + ' ' + safe(SLIDES[i].label) + '.png';
  }
  function canvasToBlob(canvas) { return new Promise((res) => canvas.toBlob(res, 'image/png')); }

  function wireDialog(d) {
    $$('.wr-dot', d).forEach((b, i) => b.addEventListener('click', () => goTo(i)));
    $$('.wr-listitem', d).forEach((b) => b.addEventListener('click', () => goTo(+b.dataset.goto)));
    $$('.wr-theme-card', d).forEach((b) => b.addEventListener('click', () => {
      theme = b.dataset.theme;
      invalidate();
      renderChrome();
    }));
    $('#wr-prev', d).addEventListener('click', () => goTo(idx - 1));
    $('#wr-next', d).addEventListener('click', () => goTo(idx + 1));

    let swipeX = null;
    const canvas = $('#wrapped-canvas', d);
    canvas.addEventListener('pointerdown', (e) => { swipeX = e.clientX; });
    canvas.addEventListener('pointerup', (e) => {
      if (swipeX === null) return;
      const dx = e.clientX - swipeX;
      swipeX = null;
      if (Math.abs(dx) > 40) goTo(idx + (dx < 0 ? 1 : -1));
    });

    d.onkeydown = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(idx - 1); }
    };

    d.onclick = async (e) => {
      const act = e.target.closest('[data-r]');
      if (!act) return;
      const r = act.dataset.r;
      if (r === 'close') { d.close(); return; }
      if (r === 'save' || r === 'copy') {
        const blob = await canvasToBlob($('#wrapped-canvas'));
        if (r === 'save') {
          const buf = new Uint8Array(await blob.arrayBuffer());
          if (api.saveImage) {
            const res = await api.saveImage({ data: Array.from(buf), suggestedName: exportName(idx) });
            if (res && res.ok && RD.toast) RD.toast('Slide Wrapped berhasil disimpan.');
          }
        } else {
          try {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            if (RD.toast) RD.toast('Slide Wrapped disalin ke clipboard.');
          } catch (_) {
            if (RD.toast) RD.toast('Gagal menyalin — gunakan tombol "Simpan Slide Ini".');
          }
        }
      } else if (r === 'saveall') {
        if (!api.saveImage) return;
        act.disabled = true;
        const prevIdx = idx;
        let saved = 0;
        for (let i = 0; i < SLIDES.length; i++) {
          idx = i;
          invalidate();
          const blob = await canvasToBlob($('#wrapped-canvas'));
          const buf = new Uint8Array(await blob.arrayBuffer());
          const res = await api.saveImage({ data: Array.from(buf), suggestedName: exportName(i) });
          if (res && res.ok) saved++;
        }
        idx = prevIdx;
        invalidate();
        renderChrome();
        act.disabled = false;
        if (RD.toast) RD.toast(saved ? saved + ' slide Wrapped berhasil disimpan.' : 'Penyimpanan dibatalkan.');
      }
    };
  }

  function open() {
    data = computeData();
    theme = 'acid';
    idx = 0;
    baseKey = '';
    const d = $('#wrapped');
    if (!d) return;
    d.innerHTML = dialogHtml();
    wireDialog(d);
    d.showModal();
    renderChrome();
    renderCurrent();
  }

  RD.wrapped = {
    open,
    THEMES,
    _test: {
      SLIDES,
      computeData,
      logoReady: () => logoReady,
      renderTo(ctx, slideIdx, themeId, d) {
        resetCtx(ctx);
        ctx.clearRect(0, 0, W, H);
        SLIDES[slideIdx].draw(ctx, themeId || 'acid', d);
      },
    },
  };
})();