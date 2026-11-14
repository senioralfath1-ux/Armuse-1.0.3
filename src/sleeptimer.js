'use strict';
/* Timer tidur: hentikan musik otomatis setelah X menit, atau setelah lagu yang
   sedang diputar selesai. Murni di sisi renderer, tidak butuh perubahan main process. */
(function () {
  const RD = window.RD;
  const { $ } = RD;
  const audio = $('#audio');

  let endAt = null;   // epoch ms kapan berhenti (mode durasi)
  let atTrackEnd = false; // mode "sampai lagu ini selesai"
  let ticker = null;

  function fmtRemain(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function getStatus() {
    return {
      active: !!endAt || atTrackEnd,
      atTrackEnd,
      remainMs: endAt ? Math.max(0, endAt - Date.now()) : 0,
      remainText: atTrackEnd ? 'Akhir lagu' : (endAt ? fmtRemain(endAt - Date.now()) : 'Mati'),
    };
  }

  function updateBadge() {
    const btn = $('#btn-sleep');
    if (btn) {
      const active = !!endAt || atTrackEnd;
      btn.classList.toggle('active', active);
      btn.title = atTrackEnd
        ? 'Timer tidur: berhenti setelah lagu ini selesai'
        : (endAt ? `Timer tidur: ${fmtRemain(endAt - Date.now())} lagi` : 'Timer tidur');
    }
    if (RD.island && RD.island.onSleepTick) RD.island.onSleepTick(getStatus());
  }

  function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }

  function clear() {
    endAt = null;
    atTrackEnd = false;
    stopTicker();
    updateBadge();
  }

  function fire() {
    audio.pause();
    if (RD.toast) RD.toast('Timer tidur selesai — musik dihentikan', 2400);
    clear();
  }

  function setMinutes(min) {
    atTrackEnd = false;
    endAt = Date.now() + min * 60000;
    stopTicker();
    ticker = setInterval(() => { if (endAt && endAt - Date.now() <= 0) fire(); else updateBadge(); }, 1000);
    updateBadge();
    if (RD.toast) RD.toast(`Timer tidur diatur: ${min} menit`, 1800);
  }

  function setAtTrackEnd() {
    endAt = null;
    atTrackEnd = true;
    stopTicker();
    updateBadge();
    if (RD.toast) RD.toast('Musik akan berhenti setelah lagu ini selesai', 2000);
  }

  function onEnded() {
    if (!atTrackEnd) return;
    atTrackEnd = false;
    updateBadge();
    audio.pause(); // berjalan setelah listener lain (mis. lanjut ke lagu berikutnya) karena didaftarkan belakangan
  }

  function openPicker() {
    const btn = $('#btn-sleep');
    if (!btn || !RD.openMenu) return;
    const r = btn.getBoundingClientRect();
    const items = [
      { label: '5 menit', run: () => setMinutes(5) },
      { label: '10 menit', run: () => setMinutes(10) },
      { label: '15 menit', run: () => setMinutes(15) },
      { label: '30 menit', run: () => setMinutes(30) },
      { label: '60 menit', run: () => setMinutes(60) },
      { sep: true },
      { label: 'Sampai lagu ini selesai', run: setAtTrackEnd },
    ];
    if (endAt || atTrackEnd) items.push({ sep: true }, { label: 'Matikan timer', run: clear });
    RD.openMenu(r.left, r.bottom + 6, items);
  }

  function bind() {
    const btn = $('#btn-sleep');
    if (btn) btn.addEventListener('click', openPicker);
    audio.addEventListener('ended', onEnded);
  }

  function init() { bind(); updateBadge(); }

  RD.sleepTimer = { init, setMinutes, setAtTrackEnd, clear, getStatus };
})();
