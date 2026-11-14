'use strict';
/* Statistik dengar: akumulasi durasi dengar (ms) dan jumlah play per lagu.
   - "Play" dihitung sekali per pemutaran, begitu posisi lewat 20 detik ATAU 50% durasi
     (mencegah skip cepat ikut terhitung), mirip cara Spotify menghitung stream.
   - Durasi dengar dikirim ke main process tiap ~5 detik saat playback aktif (batching,
     supaya tidak membanjiri IPC), plus saat pause/ganti lagu/tutup aplikasi. */
(function () {
  const RD = window.RD;
  const { $ } = RD;
  const api = window.api;
  const audio = $('#audio');

  let raw = { totalMs: 0, tracks: {} };
  let track = null;
  let counted = false;
  let lastFlushAt = 0;
  let pendingMs = 0;
  let lastTick = 0;

  const FLUSH_MS = 5000;
  const COUNT_AFTER_SEC = 20;

  async function refresh() {
    try { raw = await api.getStats(); } catch (_) { /* abaikan */ }
    return raw;
  }

  function flush() {
    if (pendingMs > 0 && track) {
      const ms = pendingMs;
      pendingMs = 0;
      api.addListenMs(track.id, ms);
      raw.totalMs += ms;
      const s = raw.tracks[track.id] || (raw.tracks[track.id] = { count: 0, ms: 0, last: 0 });
      s.ms += ms;
    }
  }

  function onTrackChange(t) {
    flush(); // simpan sisa akumulasi lagu sebelumnya
    track = t;
    counted = false;
    lastTick = audio.currentTime || 0;
  }

  function onTimeUpdate() {
    if (!track || audio.paused) { lastTick = audio.currentTime; return; }
    const now = audio.currentTime;
    let delta = now - lastTick;
    lastTick = now;
    if (delta > 0 && delta < 2) pendingMs += delta * 1000; // abaikan lompatan akibat seek

    if (!counted) {
      const dur = audio.duration;
      if (now >= COUNT_AFTER_SEC || (isFinite(dur) && dur > 0 && now >= dur * 0.5)) {
        counted = true;
        api.recordPlay(track.id);
        const s = raw.tracks[track.id] || (raw.tracks[track.id] = { count: 0, ms: 0, last: 0 });
        s.count++;
        s.last = Date.now();
      }
    }

    const t = performance.now();
    if (t - lastFlushAt > FLUSH_MS) { lastFlushAt = t; flush(); }
  }

  function bind() {
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('pause', flush);
    window.addEventListener('beforeunload', flush);
  }

  async function init() { await refresh(); bind(); }

  RD.stats = { init, refresh, raw: () => raw, onTrackChange };
})();
