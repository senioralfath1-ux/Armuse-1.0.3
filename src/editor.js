'use strict';
/* Dialog "Edit tag": bisa untuk satu lagu atau banyak lagu sekaligus.
 * Perubahan disimpan sebagai override di pustaka (aman, tidak menyentuh file),
 * dengan pilihan menuliskannya ke tag ID3 file MP3. */
(function () {
  const RD = window.RD;
  const { $, $$, esc, ic, clamp, coverEl, toast } = RD;
  const api = window.api;
  const tt = (key, params) => (window.RD && RD.i18n ? RD.i18n.t(key, params) : key);
  const fmtCount = (n, kind) => (window.RD && RD.i18n && RD.i18n.formatCount ? RD.i18n.formatCount(n, kind) : `${n} ${kind}`);

  const FIELDS = [
    { key: 'title', labelKey: 'editor.title', label: 'Judul', cls: 'full' },
    { key: 'artist', labelKey: 'editor.artist', label: 'Artis' },
    { key: 'albumArtist', labelKey: 'editor.albumArtist', label: 'Artis album' },
    { key: 'album', labelKey: 'editor.album', label: 'Album' },
    { key: 'genre', labelKey: 'editor.genre', label: 'Genre' },
    { key: 'year', labelKey: 'editor.year', label: 'Tahun', num: true, max: 4 },
    { key: 'track', labelKey: 'editor.track', label: 'Nomor lagu', num: true, max: 3 },
    { key: 'disc', labelKey: 'editor.disc', label: 'Cakram', num: true, max: 2 },
  ];
  const SRC = { title: 'title', artist: 'artist', albumArtist: 'albumArtist', album: 'album', genre: 'genre', year: 'year', track: 'trackNo', disc: 'discNo' };

  // Nilai bersama beberapa lagu: sama semua -> nilainya, beda -> null
  function shared(tracks, key) {
    const first = tracks[0][SRC[key]] ?? '';
    return tracks.every((t) => (t[SRC[key]] ?? '') === first) ? first : null;
  }

  function tagState(tracks) {
    const count = new Map();
    for (const t of tracks) for (const g of t.tags) count.set(g, (count.get(g) || 0) + 1);
    return [...count.entries()]
      .sort((a, b) => RD.cmp(a[0], b[0]))
      .map(([name, n]) => ({ name, all: n === tracks.length }));
  }

  RD.openEditor = function openEditor(ids) {
    const S = RD.S;
    const tracks = ids.map((id) => S.byId.get(id)).filter(Boolean);
    if (!tracks.length) return;
    const multi = tracks.length > 1;
    const d = $('#editor');

    // ---------- Keadaan kerja ----------
    const dirty = new Set();                  // field yang sengaja diubah pengguna
    const vals = {};                          // nilai field saat ini
    FIELDS.forEach((f) => { vals[f.key] = shared(tracks, f.key); });

    let tags = tagState(tracks);
    const addTags = new Set(), removeTags = new Set();

    const ratingShared = tracks.every((t) => t.rating === tracks[0].rating) ? tracks[0].rating : null;
    let rating = ratingShared, ratingDirty = false;

    const favShared = tracks.every((t) => t.fav === tracks[0].fav) ? tracks[0].fav : null;
    let fav = favShared, favDirty = false;

    let cover = tracks[0].cover, coverDirty = false;
    const coverLabel = tracks[0].album || tracks[0].title;

    const mp3 = tracks.filter((t) => /\.mp3$/i.test(t.path)).length;
    let writeFile = false;

    // ---------- Markup ----------
    const fieldHtml = (f) => {
      const v = vals[f.key];
      const val = v == null ? '' : String(v || '');
      return `<div class="field ${f.cls || ''}">
        <label for="ed-${f.key}">${esc(tt(f.labelKey, f.label))}</label>
        <input id="ed-${f.key}" data-f="${f.key}" value="${esc(val)}"
          ${f.num ? `inputmode="numeric" maxlength="${f.max}"` : 'maxlength="200"'}
          placeholder="${v == null ? esc(tt('editor.mixed', '(beragam)')) : ''}" autocomplete="off" spellcheck="false">
      </div>`;
    };

    const chipHtml = (t) => `<span class="chip${t.all ? '' : ' some'}" data-tag="${esc(t.name)}">${esc(t.name)}
      <button type="button" data-rm="${esc(t.name)}" aria-label="${esc(tt('playlists.removeCover', 'Hapus'))} tag ${esc(t.name)}">${ic('x')}</button></span>`;

    const starsHtml = () => [1, 2, 3, 4, 5].map((n) =>
      `<button type="button" data-star="${n}" class="${rating != null && n <= rating ? 'on' : ''}" aria-label="${n} star">${ic('star')}</button>`).join('');

    d.innerHTML = `
      <div class="dlg-head">
        <h2 id="ed-h">${multi ? esc(tt('menu.editTagsCount', { count: tracks.length })) : esc(tt('common.editTag', 'Edit tag'))}</h2>
        <p>${multi
          ? esc(tt('editor.multiDesc', 'Kolom yang dibiarkan kosong tidak akan diubah. Mengisi kolom akan menyamakan nilainya untuk semua lagu terpilih.'))
          : esc(tracks[0].path)}</p>
      </div>
      <div class="dlg-body">
        <div class="ed-cover">
          <div class="sleeve"><div class="vinyl"><div class="disc"></div></div>
            <div class="cover" id="ed-cover-box">${coverEl(cover, coverLabel)}</div></div>
          <div class="row-btns">
            <button type="button" class="btn-quiet" id="ed-cover-pick">${ic('image')} ${esc(tt('editor.changeCover', 'Ganti sampul'))}</button>
            <button type="button" class="btn-quiet" id="ed-cover-clear"${cover ? '' : ' hidden'}>${ic('trash')} ${esc(tt('editor.removeCover', 'Hapus sampul'))}</button>
          </div>
          <div class="field">
            <span class="lbl-t">${esc(tt('editor.rating', 'Nilai'))}</span>
            <div class="stars" id="ed-stars">${starsHtml()}</div>
          </div>
          <label class="chk"><input type="checkbox" id="ed-fav"${fav ? ' checked' : ''}>
            <span>${esc(tt('editor.markFav', 'Tandai sebagai favorit'))}</span></label>
        </div>

        <div class="fields">
          ${FIELDS.map(fieldHtml).join('')}
          <div class="field full">
            <span class="lbl-t">${esc(tt('editor.myTags', 'Tag saya'))}</span>
            <div class="tag-edit" id="ed-tags">
              ${tags.map(chipHtml).join('')}
              <input id="ed-tag-in" placeholder="${tags.length ? esc(tt('editor.addTagPh', 'Tambah tag…')) : esc(tt('editor.tagPlaceholder', 'mis. santai, kerja, nostalgia'))}" maxlength="30" autocomplete="off" spellcheck="false">
            </div>
          </div>
        </div>
      </div>
      <div class="dlg-foot">
        <label class="chk" ${mp3 ? '' : 'title="No MP3 files selected"'}>
          <input type="checkbox" id="ed-write"${mp3 ? '' : ' disabled'}>
          <span>${mp3
            ? esc(tt('editor.writeMp3', { mp3, count: tracks.length }))
            : esc(tt('editor.mp3Only', 'Menulis tag ke file hanya didukung untuk MP3. Perubahan disimpan di aplikasi saja.'))}</span>
        </label>
        <span class="spacer"></span>
        <button type="button" class="btn-quiet" id="ed-cancel">${esc(tt('common.cancel', 'Batal'))}</button>
        <button type="button" class="btn-primary" id="ed-save">${esc(tt('editor.save', 'Simpan'))}</button>
      </div>`;

    // ---------- Interaksi ----------
    const box = $('#ed-cover-box', d);
    const tagWrap = $('#ed-tags', d);
    const tagIn = $('#ed-tag-in', d);

    $$('input[data-f]', d).forEach((inp) => {
      inp.addEventListener('input', () => {
        const f = inp.dataset.f;
        if (FIELDS.find((x) => x.key === f).num) inp.value = inp.value.replace(/\D/g, '');
        vals[f] = inp.value;
        dirty.add(f);
      });
    });

    $('#ed-cover-pick', d).addEventListener('click', async () => {
      const p = await api.pickCover();
      if (!p) return;
      cover = p;
      coverDirty = true;
      box.innerHTML = coverEl(cover, coverLabel);
      $('#ed-cover-clear', d).hidden = false;
    });

    $('#ed-cover-clear', d).addEventListener('click', () => {
      cover = null;
      coverDirty = true;
      box.innerHTML = RD.phEl(coverLabel);
      $('#ed-cover-clear', d).hidden = true;
    });

    const stars = $('#ed-stars', d);
    stars.addEventListener('click', (e) => {
      const b = e.target.closest('[data-star]');
      if (!b) return;
      const n = +b.dataset.star;
      rating = rating === n ? 0 : n;          // klik bintang yang sama -> kosongkan
      ratingDirty = true;
      stars.innerHTML = starsHtml();
    });

    const favBox = $('#ed-fav', d);
    if (fav == null) favBox.indeterminate = true;
    favBox.addEventListener('change', () => { fav = favBox.checked; favDirty = true; });

    const writeBox = $('#ed-write', d);
    writeBox.addEventListener('change', () => { writeFile = writeBox.checked; });

    function redrawTags() {
      $$('.chip', tagWrap).forEach((c) => c.remove());
      tagIn.insertAdjacentHTML('beforebegin', tags.map(chipHtml).join(''));
    }

    function addTag(raw) {
      const name = raw.trim().replace(/\s+/g, ' ');
      if (!name) return;
      if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
        const t = tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
        if (!t.all) { t.all = true; addTags.add(t.name); removeTags.delete(t.name); redrawTags(); }
        return;
      }
      tags = [...tags, { name, all: true }].sort((a, b) => RD.cmp(a.name, b.name));
      addTags.add(name);
      removeTags.delete(name);
      redrawTags();
    }

    tagIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        addTag(tagIn.value);
        tagIn.value = '';
      } else if (e.key === 'Backspace' && !tagIn.value && tags.length) {
        e.preventDefault();
        const last = tags[tags.length - 1];
        tags = tags.slice(0, -1);
        removeTags.add(last.name);
        addTags.delete(last.name);
        redrawTags();
      }
    });
    tagIn.addEventListener('blur', () => { if (tagIn.value.trim()) { addTag(tagIn.value); tagIn.value = ''; } });

    tagWrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (b) {
        const name = b.dataset.rm;
        tags = tags.filter((t) => t.name !== name);
        removeTags.add(name);
        addTags.delete(name);
        redrawTags();
        return;
      }
      if (!e.target.closest('.chip')) tagIn.focus();
    });

    // ---------- Simpan ----------
    async function save() {
      const patch = {};
      const fields = {};
      for (const key of dirty) {
        const f = FIELDS.find((x) => x.key === key);
        let v = (vals[key] ?? '').toString().trim();
        if (f.num) v = v ? String(clamp(parseInt(v, 10) || 0, 0, 99999)) : '';
        fields[key] = v;
      }
      if (Object.keys(fields).length) patch.fields = fields;
      if (addTags.size) patch.addTags = [...addTags];
      if (removeTags.size) patch.removeTags = [...removeTags];
      if (ratingDirty) patch.rating = rating || 0;
      if (favDirty) patch.favorite = !!fav;
      if (coverDirty) patch.cover = cover;

      if (!Object.keys(patch).length) { d.close(); return; }

      const btn = $('#ed-save', d);
      btn.disabled = true;
      btn.textContent = 'Menyimpan…';
      try {
        const r = await api.updateTracks({ ids: tracks.map((t) => t.id), patch, writeFile });
        RD.applyUpdated(r.tracks, ids);
        d.close();
        let msg = multi ? `${fmtCount(r.tracks.length, 'song')} updated.` : tt('editor.savedToast', 'Tag berhasil disimpan');
        if (writeFile) {
          msg += r.written ? ` (${r.written} MP3 written)` : '';
          if (r.skipped && r.skipped.length) msg += ` (${r.skipped.length} skipped)`;
        }
        toast(msg.trim());
      } catch (err) {
        console.error(err);
        btn.disabled = false;
        btn.textContent = tt('editor.save', 'Simpan');
        toast('Gagal menyimpan tag: ' + err.message, 6000);
      }
    }

    $('#ed-save', d).addEventListener('click', save);
    $('#ed-cancel', d).addEventListener('click', () => d.close());
    d.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target !== tagIn) { e.preventDefault(); save(); }
    };

    d.showModal();
    const first = $(multi ? '#ed-artist' : '#ed-title', d);
    if (first) { first.focus(); first.select(); }
  };
})();
