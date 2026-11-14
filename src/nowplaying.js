'use strict';
/* Layar Now Playing besar: dibuka dari klik cover/judul di pemutar bawah.
   Menampilkan cover besar + tab Lirik / Antrean / Kualitas. */
(function () {
  const RD = window.RD;
  const { $, $$, coverEl } = RD;

  let track = null;

  function renderHead() {
    const cover = $('#npov-cover');
    if (cover) cover.innerHTML = track ? coverEl(track.cover, track.album || track.title) : '';
    const tt = (key, fallback) => (window.RD && RD.i18n ? RD.i18n.t(key) : fallback);
    const title = $('#npov-title'); if (title) title.textContent = track ? (track.title || tt('common.noAlbum', 'Tanpa album')) : tt('player.notPlaying', 'Belum ada lagu');
    const artist = $('#npov-artist'); if (artist) artist.textContent = track ? (track.displayArtist && track.displayArtist !== 'Artis tidak dikenal' && track.displayArtist !== 'Unknown Artist' ? track.displayArtist : tt('common.unknownArtist', 'Artis tidak dikenal')) : '';
    const srcFav = $('#np-fav'), dstFav = $('#npov-fav');
    if (srcFav && dstFav) {
      dstFav.setAttribute('aria-pressed', srcFav.getAttribute('aria-pressed'));
      dstFav.innerHTML = srcFav.innerHTML;
    }
    const link = $('#npov-album-link');
    if (link) link.disabled = !track;
    const addpl = $('#npov-addpl');
    if (addpl) addpl.disabled = !track;
    const share = $('#npov-share');
    if (share) share.disabled = !track;
  }

  function onTrackChange(t) { track = t; renderHead(); }

  function selectTab(name) {
    $$('#nowplaying .npov-tabs [role=tab]').forEach((b) => b.classList.toggle('active', b.dataset.npt === name));
    $$('#nowplaying .npt').forEach((s) => s.classList.toggle('active', s.id === 'npt-' + name));
  }

  function open() {
    // Jika sedang dalam mode mini atau dynamic island, kembalikan ke mode normal terlebih dahulu
    // agar overlay tidak menimpa window mini yang sempit
    if (document.body.classList.contains('mini-mode') || document.body.classList.contains('island-mode')) {
      if (window.api && window.api.exitMini) window.api.exitMini();
      if (window.api && window.api.exitIsland) window.api.exitIsland();
      document.body.classList.remove('mini-mode', 'island-mode');
    }
    window.scrollTo(0, 0);
    const ov = $('#nowplaying');
    if (!ov) return;
    ov.classList.add('open');
    ov.inert = false;
    ov.setAttribute('aria-hidden', 'false');
    renderHead();
    if (RD.visualizer) RD.visualizer.start();
  }

  function close() {
    const ov = $('#nowplaying');
    if (!ov) return;
    ov.classList.remove('open');
    ov.inert = true;
    ov.setAttribute('aria-hidden', 'true');
    if (RD.visualizer) RD.visualizer.stop();
    window.scrollTo(0, 0);
    // Bukan <dialog> bawaan, jadi tidak ada event 'close' asli — kirim event kustom sendiri
    // supaya app.js (mode mini) tahu kapan harus mengecilkan window lagi.
    ov.dispatchEvent(new CustomEvent('rd:closed'));
  }

  function bind() {
    const ov = $('#nowplaying');
    if (!ov) return;
    $('#npov-close').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
    $$('#nowplaying .npov-tabs [role=tab]').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.npt)));
    $('#npov-fav').addEventListener('click', () => { const b = $('#np-fav'); if (b) b.click(); });
    $('#npov-addpl').addEventListener('click', () => { if (track && RD.playlists) RD.playlists.openPicker([track.id]); });
    $('#npov-share').addEventListener('click', () => { if (track && RD.share) RD.share.open(track); });
    $('#npov-album-link').addEventListener('click', () => { if (track && RD.goAlbum) { RD.goAlbum(track.albumId); close(); } });
  }

  function init() { bind(); }

  RD.nowPlaying = { init, onTrackChange, open, close };
})();
