'use strict';
/* Pemilihan perangkat audio output. Enumerasi perangkat pakai API browser standar.
   Diterapkan lewat AudioContext.setSinkId() pada engine.ctx (AudioContext milik
   AudioEngine di engine.js) — sudah dikonfirmasi dari kode engine.js bahwa AudioContext
   disimpan sebagai properti "ctx". Fallback ke nama properti lain/audio.setSinkId tetap
   disertakan untuk jaga-jaga bila engine.js berubah di kemudian hari. */
(function () {
  const RD = window.RD;
  const { $, esc } = RD;
  const api = window.api;
  const audio = $('#audio');

  function findEngineCtx() {
    const e = RD.engine;
    if (!e) return null;
    return e.ctx || e.audioCtx || e.context || e.audioContext || e._ctx || null;
  }

  async function ensureLabels(devices) {
    const missing = devices.some((d) => !d.label);
    if (!missing || !navigator.mediaDevices.getUserMedia) return devices;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return navigator.mediaDevices.enumerateDevices();
    } catch (_) {
      return devices; // izin ditolak — tetap tampilkan tanpa label
    }
  }

  async function listOutputs() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    let devices = await navigator.mediaDevices.enumerateDevices();
    devices = await ensureLabels(devices);
    return devices.filter((d) => d.kind === 'audiooutput');
  }

  async function apply(deviceId) {
    const ctx = findEngineCtx();
    if (ctx && typeof ctx.setSinkId === 'function') {
      try { await ctx.setSinkId(deviceId); return true; } catch (err) { console.warn('AudioContext.setSinkId gagal', err); }
    }
    if (typeof audio.setSinkId === 'function') {
      try { await audio.setSinkId(deviceId); return true; } catch (err) { console.warn('audio.setSinkId gagal', err); }
    }
    return false;
  }

  async function mount() {
    const host = $('#output-device');
    if (!host) return;
    host.innerHTML = `<div class="settings-block">
      <h3>Perangkat audio output</h3>
      <select id="out-device-select" aria-label="Pilih perangkat output audio"><option>Memuat perangkat…</option></select>
      <p id="out-device-note" class="note" style="margin-top:8px"></p>
    </div>`;
    const sel = $('#out-device-select', host);
    const note = $('#out-device-note', host);
    const devices = await listOutputs();
    if (!devices.length) {
      sel.innerHTML = '<option>Tidak ada perangkat terdeteksi</option>';
      sel.disabled = true;
      return;
    }
    const saved = RD.S && RD.S.settings ? RD.S.settings.outputDevice : null;
    sel.innerHTML = devices.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Perangkat audio ' + (i + 1))}</option>`).join('');
    if (saved && devices.some((d) => d.deviceId === saved)) sel.value = saved;

    sel.addEventListener('change', async () => {
      const ok = await apply(sel.value);
      if (ok) {
        api.saveSettings({ outputDevice: sel.value });
        note.textContent = 'Perangkat output diganti.';
        if (RD.toast) RD.toast('Perangkat output audio diganti', 1800);
      } else {
        note.textContent = 'Tidak bisa mengganti perangkat keluaran. Kemungkinan versi Electron/Chromium yang dipakai belum mendukung AudioContext.setSinkId().';
      }
    });
  }

  function init() {
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        if ($('#output-device')) mount();
      });
    }
  }

  RD.outputDevice = { init, mount };
})();
