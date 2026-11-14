'use strict';
/* Playlist: menyimpan daftar playlist dari main process, dan menyediakan dialog
   "tambah ke playlist" yang bisa dipanggil dari mana saja (baris lagu, now-playing). */
(function () {
  const RD = window.RD;
  const { $, esc, toast } = RD;
  const api = window.api;

  const tt = (key, params) => (window.RD && RD.i18n ? RD.i18n.t(key, params) : key);

  let all = [];

  async function refresh() {
    all = await api.playlists();
    return all;
  }

  function byId(id) {
    return all.find((p) => p.id === id);
  }

  async function createNew(initialTrackIds) {
    const name = await RD.ask({
      title: tt('playlists.newTitle'),
      input: { label: tt('playlists.nameLabel'), value: '' },
      ok: tt('playlists.create')
    });
    if (name === null) return null;
    const p = await api.createPlaylist(name);
    if (initialTrackIds && initialTrackIds.length) await api.addToPlaylist(p.id, initialTrackIds);
    await refresh();
    return p.id;
  }

  function renderPicker(trackIds) {
    const d = $('#playlist-picker');
    const inAll = (p) => trackIds.every((id) => p.trackIds.includes(id));
    d.innerHTML = `<div class="dlg-head"><h2 id="plp-h">${esc(tt('playlists.addTitle'))}</h2><p>${trackIds.length > 1 ? esc(tt('playlists.selectedCount', { count: trackIds.length })) : ''}</p></div>
      <div class="dlg-body">
        <div class="plp-list">${all.length
          ? all.map((p) => `<label class="plp-row"><input type="checkbox" data-id="${p.id}"${inAll(p) ? ' checked' : ''}><span>${esc(p.name)}</span><small>${esc(tt('playlists.trackCount', { count: p.trackIds.length }))}</small></label>`).join('')
          : `<p class="lyr-hint">${esc(tt('playlists.empty'))}</p>`}</div>
        <button class="btn-ghost" id="plp-new">${RD.PLAYLIST_ADD_ICON || '+'} ${esc(tt('playlists.newTitle'))}</button>
      </div>
      <div class="dlg-foot"><span class="spacer"></span><button class="btn-primary" data-r="1">${esc(tt('playlists.done'))}</button></div>`;
    d.querySelectorAll('.plp-row input').forEach((cb) => {
      cb.addEventListener('change', async () => {
        const id = cb.dataset.id;
        if (cb.checked) await api.addToPlaylist(id, trackIds);
        else for (const tid of trackIds) await api.removeFromPlaylist(id, tid);
        await refresh();
        toast(cb.checked ? tt('playlists.addedToast') : tt('playlists.removedToast'), 1600);
      });
    });
    $('#plp-new', d).addEventListener('click', async () => {
      const id = await createNew(trackIds);
      if (id) renderPicker(trackIds);
    });
    d.onclick = (e) => { if (e.target.closest('[data-r]')) d.close(); };
  }

  function openPicker(trackIds) {
    if (!trackIds || !trackIds.length) return;
    renderPicker(trackIds);
    $('#playlist-picker').showModal();
  }

  async function init() { await refresh(); }

  RD.playlists = { init, refresh, all: () => all, byId, openPicker, createNew };
})();
