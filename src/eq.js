'use strict';
/* Equalizer 10 band: slider vertikal, kurva respons, visualizer spektrum, preset. */
(function () {
  const RD = window.RD;
  const { $, $$, esc, clamp, toast } = RD;

  const RANGE = 12;          // batas +/- dB per band
  const BANDS = window.EQ_BANDS;
  const PRESETS = window.EQ_PRESETS;

  let engine = null, settings = null, saveSoon = () => {};
  let gains = BANDS.map(() => 0), preamp = 0, enabled = true, presetName = 'Flat';
  let raf = 0, running = false, ro = null;
  let els = null;

  const hz = (f) => (f >= 1000 ? (f / 1000) + 'k' : String(f));
  const dbTxt = (v) => (v > 0 ? '+' : '') + (Math.round(v * 10) / 10);

  // ---------- Preset ----------
  const customs = () => (settings.eq.custom = settings.eq.custom || {});
  const same = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.05);

  function matchPreset() {
    for (const [name, g] of Object.entries(PRESETS)) if (same(gains, g)) return name;
    for (const [name, p] of Object.entries(customs())) {
      if (same(gains, p.gains) && Math.abs((p.preamp || 0) - preamp) < 0.05) return name;
    }
    return null;
  }

  function renderPresets() {
    const cus = Object.keys(customs()).sort((a, b) => RD.cmp(a, b));
    const opt = (n) => `<option value="${esc(n)}"${n === presetName ? ' selected' : ''}>${esc(n)}</option>`;
    els.preset.innerHTML =
      `<optgroup label="Bawaan">${Object.keys(PRESETS).map(opt).join('')}</optgroup>` +
      (cus.length ? `<optgroup label="Preset saya">${cus.map(opt).join('')}</optgroup>` : '') +
      (presetName === null ? '<option value="" selected>Kustom (belum disimpan)</option>' : '');
    els.del.hidden = !(presetName && presetName in customs());
  }

  function syncPreset() {
    presetName = matchPreset();
    renderPresets();
    settings.eq.preset = presetName;
  }

  // ---------- Terapkan ke mesin audio ----------
  function push({ save = true } = {}) {
    if (engine) { engine.setGains(gains); engine.setPreamp(preamp); engine.setEnabled(enabled); }
    Object.assign(settings.eq, { enabled, preamp, gains: gains.slice() });
    if (save) saveSoon();
  }

  // ---------- UI band ----------
  function bandsHtml() {
    return BANDS.map((f, i) => `<div class="band" data-i="${i}">
      <span class="db" id="eq-db-${i}">0</span>
      <div class="slot" tabindex="0" role="slider" aria-label="${hz(f)} hertz"
           aria-valuemin="${-RANGE}" aria-valuemax="${RANGE}" aria-valuenow="0" aria-valuetext="0 desibel">
        <i class="fill"></i><i class="thumb"></i>
      </div>
      <span class="hz">${hz(f)}</span>
    </div>`).join('');
  }

  function paintBand(i) {
    const slot = els.slots[i];
    if (!slot) return;
    const v = gains[i];
    const pad = 8;                                   // ruang agar thumb tidak terpotong
    const h = slot.clientHeight - pad * 2;
    const y = pad + (1 - (v + RANGE) / (2 * RANGE)) * h;
    const mid = pad + h / 2;
    const fill = slot.querySelector('.fill');
    fill.style.top = Math.min(y, mid) + 'px';
    fill.style.height = Math.abs(mid - y) + 'px';
    slot.querySelector('.thumb').style.top = y + 'px';
    slot.setAttribute('aria-valuenow', Math.round(v * 10) / 10);
    slot.setAttribute('aria-valuetext', `${dbTxt(v)} desibel`);
    els.dbs[i].textContent = dbTxt(v);
  }

  function paintAll() {
    for (let i = 0; i < BANDS.length; i++) paintBand(i);
    els.pre.value = preamp;
    els.preOut.textContent = `${dbTxt(preamp)} dB`;
    els.on.checked = enabled;
    $('#tab-eq').classList.toggle('off', !enabled);
    drawCurve();
  }

  function valueFromEvent(slot, clientY) {
    const r = slot.getBoundingClientRect();
    const pad = 8;
    const h = r.height - pad * 2;
    const rel = clamp((clientY - r.top - pad) / (h || 1), 0, 1);
    let v = (1 - rel) * 2 * RANGE - RANGE;
    v = Math.round(v * 2) / 2;                       // langkah 0,5 dB
    return Math.abs(v) < 0.75 ? 0 : v;               // magnet ringan ke 0 dB
  }

  function setBand(i, v, { save = true } = {}) {
    gains[i] = clamp(v, -RANGE, RANGE);
    paintBand(i);
    drawCurve();
    if (engine) engine.setBand(i, enabled ? gains[i] : 0);
    Object.assign(settings.eq, { gains: gains.slice() });
    syncPreset();
    if (save) saveSoon();
  }

  function bindBands() {
    els.bands.addEventListener('pointerdown', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      const i = +slot.parentElement.dataset.i;
      slot.classList.add('drag');
      try { slot.setPointerCapture(e.pointerId); } catch (_) {}
      slot.focus();
      setBand(i, valueFromEvent(slot, e.clientY), { save: false });
      const move = (ev) => setBand(i, valueFromEvent(slot, ev.clientY), { save: false });
      const up = () => {
        slot.classList.remove('drag');
        slot.removeEventListener('pointermove', move);
        slot.removeEventListener('pointerup', up);
        slot.removeEventListener('pointercancel', up);
        saveSoon();
      };
      slot.addEventListener('pointermove', move);
      slot.addEventListener('pointerup', up);
      slot.addEventListener('pointercancel', up);
    });

    els.bands.addEventListener('dblclick', (e) => {
      const slot = e.target.closest('.slot');
      if (slot) setBand(+slot.parentElement.dataset.i, 0);
    });

    els.bands.addEventListener('keydown', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      const i = +slot.parentElement.dataset.i;
      const step = e.shiftKey ? 3 : 0.5;
      const k = e.key;
      if (k === 'ArrowUp' || k === 'ArrowRight') setBand(i, gains[i] + step);
      else if (k === 'ArrowDown' || k === 'ArrowLeft') setBand(i, gains[i] - step);
      else if (k === 'Home') setBand(i, RANGE);
      else if (k === 'End') setBand(i, -RANGE);
      else if (k === 'PageUp') setBand(i, gains[i] + 3);
      else if (k === 'PageDown') setBand(i, gains[i] - 3);
      else if (k === '0' || k === 'Backspace' || k === 'Delete') setBand(i, 0);
      else return;
      e.preventDefault();
    });
  }

  // ---------- Kanvas: kurva respons + spektrum ----------
  const F_MIN = 20, F_MAX = 20000;
  const xOf = (f, w) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;

  function sizeCanvas() {
    const c = els.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return false;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, w, h };
  }

  function drawSpectrum(g, w, h) {
    if (!engine || !running) return;
    const data = engine.readSpectrum();
    const nyq = engine.ctx.sampleRate / 2;
    const bins = data.length;
    const cols = 56;
    g.fillStyle = 'rgba(237, 239, 242, .085)';
    for (let c = 0; c < cols; c++) {
      const f0 = F_MIN * Math.pow(F_MAX / F_MIN, c / cols);
      const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (c + 1) / cols);
      let lo = Math.floor((f0 / nyq) * bins), hi = Math.ceil((f1 / nyq) * bins);
      lo = clamp(lo, 0, bins - 1); hi = clamp(Math.max(hi, lo + 1), 1, bins);
      let peak = 0;
      for (let i = lo; i < hi; i++) if (data[i] > peak) peak = data[i];
      const bh = (peak / 255) * h * 0.92;
      if (bh < 1) continue;
      const x = xOf(f0, w), x2 = xOf(f1, w);
      g.fillRect(x + 0.7, h - bh, Math.max(1.2, x2 - x - 1.4), bh);
    }
  }

  function drawCurve() {
    const s = sizeCanvas();
    if (!s) return;
    const { g, w, h } = s;
    g.clearRect(0, 0, w, h);

    // Garis bantu: 0 dB dan tanda frekuensi
    g.strokeStyle = 'rgba(237, 239, 242, .1)';
    g.lineWidth = 1;
    g.beginPath();
    for (const f of [100, 1000, 10000]) { const x = Math.round(xOf(f, w)) + 0.5; g.moveTo(x, 0); g.lineTo(x, h); }
    g.stroke();

    drawSpectrum(g, w, h);

    const mid = h / 2;
    g.strokeStyle = 'rgba(237, 239, 242, .22)';
    g.beginPath(); g.moveTo(0, mid + 0.5); g.lineTo(w, mid + 0.5); g.stroke();

    // Kurva gabungan dari filter (dB -> piksel, skala +/-15 dB)
    const N = 220;
    const resp = engine ? engine.response(N) : new Array(N).fill(0);
    const yOf = (db) => mid - clamp(db / 15, -1, 1) * (mid - 6);
    const pts = resp.map((db, i) => [(i / (N - 1)) * w, yOf(enabled ? db : 0)]);

    const accent = RD.accentNow || '#F2B33D';
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,.14)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');

    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineTo(w, mid); g.lineTo(0, mid); g.closePath();
    g.fillStyle = grad; g.fill();

    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.strokeStyle = enabled ? accent : 'rgba(237, 239, 242, .35)';
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.stroke();

    // Titik tiap band
    g.fillStyle = enabled ? accent : 'rgba(237, 239, 242, .35)';
    BANDS.forEach((f) => {
      const x = clamp(xOf(f, w), 2, w - 2);
      const idx = clamp(Math.round((x / w) * (N - 1)), 0, N - 1);
      g.beginPath();
      g.arc(x, yOf(enabled ? resp[idx] : 0), 2.6, 0, Math.PI * 2);
      g.fill();
    });
  }

  function loop() {
    if (!running) return;
    drawCurve();
    raf = requestAnimationFrame(loop);
  }

  // ---------- Aksi panel ----------
  function applyPreset(name) {
    const p = PRESETS[name] ? { gains: PRESETS[name], preamp: 0 } : customs()[name];
    if (!p) return;
    gains = p.gains.slice();
    if ('preamp' in p) preamp = p.preamp || 0;
    presetName = name;
    settings.eq.preset = name;
    push();
    paintAll();
    renderPresets();
  }

  async function savePreset() {
    const name = await RD.ask({
      title: 'Simpan preset',
      message: 'Pengaturan band dan penguat awal saat ini akan disimpan dengan nama ini.',
      input: { label: 'Nama preset', value: presetName && !PRESETS[presetName] ? presetName : '' },
      ok: 'Simpan',
    });
    if (!name) return;
    if (PRESETS[name]) { toast(`“${name}” adalah preset bawaan. Pakai nama lain.`); return; }
    customs()[name] = { gains: gains.slice(), preamp };
    presetName = name;
    settings.eq.preset = name;
    saveSoon();
    renderPresets();
    toast(`Preset “${name}” disimpan.`);
  }

  async function delPreset() {
    const name = presetName;
    if (!name || !(name in customs())) return;
    const ok = await RD.ask({ title: 'Hapus preset?', message: `“${name}” akan dihapus. Pengaturan band saat ini tidak berubah.`, ok: 'Hapus' });
    if (!ok) return;
    delete customs()[name];
    saveSoon();
    syncPreset();
    toast(`Preset “${name}” dihapus.`);
  }

  function reset() {
    gains = BANDS.map(() => 0);
    preamp = 0;
    presetName = 'Flat';
    settings.eq.preset = 'Flat';
    push();
    paintAll();
    renderPresets();
  }

  // ---------- API ----------
  const eq = {
    init(ctx) {
      engine = ctx.engine;
      settings = ctx.settings;
      saveSoon = ctx.saveSoon || saveSoon;

      const e = settings.eq = settings.eq || {};
      enabled = e.enabled !== false;
      preamp = Number.isFinite(e.preamp) ? clamp(e.preamp, -12, 12) : 0;
      gains = Array.isArray(e.gains) && e.gains.length === BANDS.length
        ? e.gains.map((v) => clamp(Number(v) || 0, -RANGE, RANGE))
        : BANDS.map(() => 0);
      e.custom = e.custom || {};

      els = {
        bands: $('#eq-bands'), canvas: $('#eq-canvas'), on: $('#eq-on'),
        preset: $('#eq-preset'), save: $('#eq-save'), del: $('#eq-del'), resetBtn: $('#eq-reset'),
        pre: $('#eq-pre'), preOut: $('#eq-pre-out'),
      };
      els.bands.innerHTML = bandsHtml();
      els.slots = $$('.slot', els.bands);
      els.dbs = BANDS.map((_, i) => $('#eq-db-' + i));

      bindBands();
      els.on.addEventListener('change', () => {
        enabled = els.on.checked;
        push();
        paintAll();
      });
      els.preset.addEventListener('change', () => { if (els.preset.value) applyPreset(els.preset.value); });
      els.save.addEventListener('click', savePreset);
      els.del.addEventListener('click', delPreset);
      els.resetBtn.addEventListener('click', reset);
      els.pre.addEventListener('input', () => {
        preamp = Number(els.pre.value);
        els.preOut.textContent = `${dbTxt(preamp)} dB`;
        push();
        drawCurve();
        syncPreset();
      });

      if (window.ResizeObserver) {
        ro = new ResizeObserver(() => { paintAll(); });
        ro.observe(els.canvas);
        ro.observe(els.bands);
      }
      window.addEventListener('resize', () => paintAll());

      push({ save: false });
      syncPreset();
      paintAll();
    },

    /** Mulai menggambar spektrum (dipanggil saat tab equalizer dibuka). */
    start() {
      paintAll();
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    },

    /** Hentikan animasi saat panel ditutup agar tidak membuang daya. */
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (els) drawCurve();
    },

    /** Dipanggil app.js saat aksen berubah agar kurva ikut berwarna sampul. */
    repaint() { if (els) drawCurve(); },

    applyPreset,
    getPreset: () => presetName || 'Kustom',
    getPresets: () => [...Object.keys(PRESETS), ...Object.keys(customs())],
    isEnabled: () => enabled,
    setEnabled(val) {
      enabled = !!val;
      if (els && els.on) els.on.checked = enabled;
      push();
      paintAll();
    },
  };

  RD.eq = eq;
})();
