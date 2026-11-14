'use strict';
/* Visualizer spectrum: memakai AnalyserNode di engine.js. */
(function () {
  const F_MIN = 20, F_MAX = 20000;
  const COLS = 48;
  let running = false;
  let raf = null;

  function draw() {
    raf = null;
    const RD = window.RD;
    if (!RD || !RD.$) return;
    const $ = RD.$;
    const canvas = $('#visualizer');
    const engine = RD.engine;
    if (!running || !canvas || !engine) return;
    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = canvas.clientWidth * dpr);
    const h = (canvas.height = canvas.clientHeight * dpr);
    if (!w || !h) { raf = requestAnimationFrame(draw); return; }
    const c = canvas.getContext('2d');
    try { var data = engine.readSpectrum(); } catch (e) { return; }
    const nyq = engine.ctx.sampleRate / 2;
    const bins = data.length;

    c.clearRect(0, 0, w, h);
    const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#4c8bf5';
    c.fillStyle = accent;
    const gap = w * 0.008;
    const barW = Math.max(1, (w - gap * (COLS - 1)) / COLS);

    for (let col = 0; col < COLS; col++) {
      // Kelompokkan bin FFT linear ke kolom berskala logaritmik (20 Hz - 20 kHz), sama seperti eq.js.
      const f0 = F_MIN * Math.pow(F_MAX / F_MIN, col / COLS);
      const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (col + 1) / COLS);
      let lo = Math.floor((f0 / nyq) * bins), hi = Math.ceil((f1 / nyq) * bins);
      lo = Math.max(0, Math.min(lo, bins - 1));
      hi = Math.max(lo + 1, Math.min(hi, bins));
      let peak = 0;
      for (let i = lo; i < hi; i++) if (data[i] > peak) peak = data[i];
      const v = peak / 255;
      const barH = Math.max(h * 0.025, v * h);
      c.globalAlpha = 0.35 + v * 0.65;
      c.fillRect(col * (barW + gap), h - barH, barW, barH);
    }
    c.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  }

  function start() {
    running = true;
    if (!raf) raf = requestAnimationFrame(draw);
  }

  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  // Tidak butuh aksi khusus saat ganti lagu — analyser mengikuti audio utama secara otomatis.
  function onTrackChange() {}

  function init() {}

  RD.visualizer = { init, start, stop, onTrackChange };
})();
