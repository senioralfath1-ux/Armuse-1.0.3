'use strict';
/* Inti aplikasi: state, tampilan pustaka, seleksi, pemutaran, antrean. */
(function () {
  const RD = window.RD;
  const { $, $$, esc, cmp, ic, fmt, fmtLong, coverEl, phEl, colorFor, accentCss, setAccent, toast } = RD;
  const api = window.api;

  const S = (RD.S = {
    tracks: [], byId: new Map(),
    albums: [], albumById: new Map(), artists: [],
    tagCounts: new Map(), genreCounts: new Map(),
    settings: null,
    view: { type: 'albums', key: null }, history: [], renderKey: '',
    query: '', selected: new Set(), anchor: null, visible: [],
    queue: [], orig: [], qi: -1,
    shuffle: false, repeat: 'off', playing: false, muted: false, lastVol: 0.8,
    scanning: false, offline: new Set(), tab: null, errStreak: 0, accentToken: 0,
  });

  const PLAYLIST_ADD_ICON = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="14" y2="6"/><line x1="3" y1="12" x2="14" y2="12"/><line x1="3" y1="18" x2="10" y2="18"/><line x1="18" y1="14" x2="18" y2="22"/><line x1="14" y1="18" x2="22" y2="18"/></svg>';
  RD.PLAYLIST_ADD_ICON = PLAYLIST_ADD_ICON;

  const audio = $('#audio');
  let engine = null;
  try { engine = new window.AudioEngine(audio); } catch (err) { console.error('Web Audio tidak tersedia', err); }
  RD.engine = engine;
  const tt = (key, params) => (window.RD && RD.i18n ? RD.i18n.t(key, params) : key);
  const fmtCount = (n, kind) => (window.RD && RD.i18n && RD.i18n.formatCount ? RD.i18n.formatCount(n, kind) : `${n} ${kind}`);

  function displayArtist(name) {
    if (!name || name === 'Artis tidak dikenal' || name === 'Unknown Artist' || name === '不明なアーティスト') {
      return tt('common.unknownArtist', 'Unknown Artist');
    }
    return name;
  }

  function displayAlbum(name) {
    if (!name || name === 'Tanpa album' || name === 'No Album' || name === 'アルバムなし') {
      return tt('common.noAlbum', 'No Album');
    }
    return name;
  }

  // ============================================================ Data
  function hydrate(t) {
    const c = t.custom || (t.custom = {}), m = t.meta;
    t.title = c.title ?? m.title;
    t.artist = c.artist ?? m.artist ?? '';
    t.album = c.album ?? m.album ?? '';
    t.albumArtist = c.albumArtist ?? m.albumArtist ?? '';
    t.year = c.year ?? m.year ?? null;
    t.genre = c.genre ?? m.genre ?? '';
    t.trackNo = c.track ?? m.track ?? 0;
    t.discNo = c.disc ?? m.disc ?? 0;
    t.cover = c.cover ?? m.cover ?? null;
    t.tags = c.tags || [];
    t.rating = c.rating || 0;
    t.fav = !!c.favorite;
    t.displayArtist = t.artist || t.albumArtist || '';
    t.genres = t.genre ? t.genre.split(/\s*[,;]\s*/).filter(Boolean) : [];
    t.search = (window.jpSearch ? window.jpSearch.buildIndex(t) : [t.title, t.artist, t.album, t.albumArtist, t.genre, t.tags.join(' ')].join(' ').toLowerCase());
    return t;
  }

  function setTracks(list) {
    S.tracks = list.map(hydrate);
    buildIndex();
  }

  function buildIndex() {
    S.byId = new Map(S.tracks.map((t) => [t.id, t]));
    const albums = new Map();
    for (const t of S.tracks) {
      const artist = t.albumArtist || t.artist || '';
      const title = t.album || '';
      const key = (artist + '\u0001' + title).toLowerCase();
      let a = albums.get(key);
      if (!a) {
        let id = 'a' + RD.hash(key).toString(36);
        while (S.albumById.has(id) && S.albumById.get(id).key !== key && albums.has(id)) id += '_';
        a = { id, key, title, artist, year: null, cover: null, tracks: [], duration: 0, added: 0, single: !t.album };
        albums.set(key, a);
      }
      a.tracks.push(t);
      t.albumId = a.id;
    }
    const byId = new Map();
    for (const a of albums.values()) {
      a.tracks.sort((x, y) => (x.discNo || 0) - (y.discNo || 0) || (x.trackNo || 0) - (y.trackNo || 0) || cmp(x.title, y.title));
      const withCover = a.tracks.find((t) => t.custom.cover) || a.tracks.find((t) => t.cover);
      a.cover = withCover ? withCover.cover : null;
      const years = a.tracks.map((t) => t.year).filter(Boolean);
      a.year = years.length ? Math.min(...years) : null;
      a.duration = a.tracks.reduce((s, t) => s + (t.duration || 0), 0);
      a.added = Math.max(...a.tracks.map((t) => t.added || 0));
      byId.set(a.id, a);
    }
    S.albumById = byId;
    S.albums = [...byId.values()];

    const artists = new Map();
    for (const a of S.albums) {
      let r = artists.get(a.artist);
      if (!r) artists.set(a.artist, (r = { name: a.artist, albums: [], count: 0 }));
      r.albums.push(a);
      r.count += a.tracks.length;
    }
    S.artists = [...artists.values()].sort((x, y) => cmp(x.name, y.name));

    S.tagCounts = new Map();
    S.genreCounts = new Map();
    for (const t of S.tracks) {
      t.tags.forEach((g) => S.tagCounts.set(g, (S.tagCounts.get(g) || 0) + 1));
      t.genres.forEach((g) => S.genreCounts.set(g, (S.genreCounts.get(g) || 0) + 1));
    }
  }

  const current = () => S.byId.get(S.queue[S.qi]);
  const inFolder = (p, f) => p.startsWith(f) && (p.length === f.length || /[\\/]/.test(p[f.length]) || /[\\/]$/.test(f));

  let saveTimer;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = S.settings;
      api.saveSettings({ volume: s.volume, shuffle: S.shuffle, repeat: S.repeat, sort: s.sort, eq: s.eq });
    }, 300);
  }
  RD.saveSoon = saveSoon;

  // ============================================================ Navigasi
  function go(type, key = null, push = true) {
    if (push) S.history.push({ ...S.view });
    S.view = { type, key };
    S.selected.clear();
    S.anchor = null;
    render();
  }
  function nav(type) {
    S.history = [];
    S.view = { type, key: null };
    S.selected.clear();
    S.anchor = null;
    render();
  }
  function back() {
    const v = S.history.pop();
    if (!v) return;
    S.view = v;
    S.selected.clear();
    render();
  }

  // ============================================================ Tampilan
  const SORTS = {
    albums: [
      ['title', 'sort.title', 'Judul'],
      ['artist', 'sort.artist', 'Artis'],
      ['year', 'sort.year', 'Tahun terbaru'],
      ['added', 'sort.added', 'Baru ditambahkan']
    ],
    songs: [
      ['title', 'sort.title', 'Judul'],
      ['artist', 'sort.artist', 'Artis'],
      ['album', 'sort.album', 'Album'],
      ['added', 'sort.added', 'Baru ditambahkan'],
      ['rating', 'sort.rating', 'Rating'],
      ['duration', 'sort.duration', 'Terpanjang']
    ],
  };
  function sortSelect(kind) {
    const cur = S.settings.sort[kind] || SORTS[kind][0][0];
    return `<label class="sort">${esc(tt('sort.label', 'Urutkan'))}<select data-sort="${kind}" aria-label="${esc(tt('sort.label', 'Urutkan'))}">${SORTS[kind].map(([v, k, fallback]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(tt(k, fallback))}</option>`).join('')}</select></label>`;
  }
  function head(title, count, tools = '') {
    return `<div class="view-head"><h1>${esc(title)}</h1><span class="count">${esc(count)}</span><div class="head-tools">${tools}</div></div>`;
  }
  function getPlayTools() {
    return `<button class="btn-primary" data-act="play-all">${ic('play', 'fill')}${esc(tt('player.play', 'Putar'))}</button><button class="btn-ghost" data-act="shuffle-all">${ic('shuffle')}${esc(tt('player.shuffle', 'Acak'))}</button>`;
  }
  const playTools = getPlayTools();

  function sortedAlbums() {
    const q = S.query.trim().toLowerCase();
    let list = S.albums;
    if (q) {
      list = list.filter((a) => {
        const titleArtist = a.title + ' ' + a.artist;
        if (window.jpSearch ? window.jpSearch.test(titleArtist, q) : titleArtist.toLowerCase().includes(q)) return true;
        return a.tracks.some((t) => (window.jpSearch ? window.jpSearch.test(t.search, q) : t.search.includes(q)));
      });
    }
    const k = S.settings.sort.albums || 'title';
    const by = {
      title: (a, b) => cmp(a.title, b.title),
      artist: (a, b) => cmp(a.artist, b.artist) || (a.year || 0) - (b.year || 0) || cmp(a.title, b.title),
      year: (a, b) => (b.year || 0) - (a.year || 0) || cmp(a.title, b.title),
      added: (a, b) => b.added - a.added || cmp(a.title, b.title),
    }[k];
    return list.slice().sort(by);
  }

  function sortedTracks(list) {
    const q = S.query.trim().toLowerCase();
    if (q) list = list.filter((t) => (window.jpSearch ? window.jpSearch.test(t.search, q) : t.search.includes(q)));
    const k = S.settings.sort.songs || 'title';
    const by = {
      title: (a, b) => cmp(a.title, b.title),
      artist: (a, b) => cmp(a.displayArtist, b.displayArtist) || cmp(a.album, b.album) || (a.trackNo || 0) - (b.trackNo || 0),
      album: (a, b) => cmp(a.album, b.album) || (a.discNo || 0) - (b.discNo || 0) || (a.trackNo || 0) - (b.trackNo || 0),
      added: (a, b) => (b.added || 0) - (a.added || 0) || cmp(a.title, b.title),
      rating: (a, b) => b.rating - a.rating || cmp(a.title, b.title),
      duration: (a, b) => b.duration - a.duration,
    }[k];
    return list.slice().sort(by);
  }

  function albumCard(a) {
    return `<article class="album" data-id="${a.id}" data-dom tabindex="0" aria-label="${esc(a.title)}, ${esc(a.artist)}">
      <div class="sleeve">
        <div class="vinyl"><div class="disc"></div></div>
        <div class="cover">${coverEl(a.cover, a.title)}</div>
        <button class="pbtn" data-act="play-album" aria-label="Putar ${esc(a.title)}">${ic('play', 'fill')}</button>
      </div>
      <div class="meta"><h3>${esc(a.title)}</h3><div class="by">${esc(a.artist)}</div><div class="sub">${a.year ? a.year + ', ' : ''}${a.tracks.length} lagu</div></div>
    </article>`;
  }

  function tagChips(t, max = 3) {
    const shown = t.tags.slice(0, max).map((g) => `<span class="chip" data-tag="${esc(g)}" title="Lihat semua lagu bertag ${esc(g)}">${esc(g)}</span>`);
    if (t.tags.length > max) shown.push(`<span class="chip plain">+${t.tags.length - max}</span>`);
    return shown.join('');
  }

  function rowHtml(t, i, o) {
    const cur = current();
    const isCur = cur && cur.id === t.id;
    const lead = o.inAlbum ? t.trackNo || i + 1 : i + 1;
    const showArtist = !o.inAlbum || (t.artist && t.artist !== o.albumArtist);
    return `<div class="row${S.selected.has(t.id) ? ' sel' : ''}${isCur ? ' playing' : ''}" data-id="${t.id}" data-i="${i}" role="row" aria-selected="${S.selected.has(t.id)}">
      <div class="lead"><span class="n">${lead}</span><span class="bars" aria-hidden="true"><i></i><i></i><i></i></span><button class="go" data-act="play-row" aria-label="Putar ${esc(t.title)}">${ic('play', 'fill')}</button></div>
      <div class="tcell">${o.inAlbum ? '' : `<div class="thumb">${coverEl(t.cover, t.album || t.title)}</div>`}<div class="tt"><b>${esc(t.title)}</b>${showArtist ? `<small>${esc(t.displayArtist)}</small>` : ''}</div></div>
      ${o.inAlbum ? '' : `<div class="alb" data-act="open-album" title="${esc(t.album || 'Tanpa album')}">${esc(t.album || 'Tanpa album')}</div>`}
      <div class="tagcell">${tagChips(t)}</div>
      <button class="fav" data-act="fav" aria-pressed="${t.fav}" aria-label="Favorit">${ic('heart', t.fav ? 'fill' : '')}</button>
      ${o.inPlaylist
        ? `<button class="addpl" data-act="remove-from-playlist" aria-label="Hapus dari playlist">${ic('x')}</button>`
        : `<button class="addpl" data-act="add-to-playlist" aria-label="Tambah ke playlist">${PLAYLIST_ADD_ICON}</button>`}
      <span class="dur">${fmt(t.duration)}</span>
      <button class="edit" data-act="edit-row" aria-label="Edit tag">${ic('pencil')}</button>
    </div>`;
  }

  function trackTable(list, o = {}) {
    S.visible = list.map((t) => t.id);
    return `<div class="tracks${o.inAlbum ? ' in-album' : ''}" role="grid">
      <div class="thead"><span>#</span><span>Judul</span>${o.inAlbum ? '' : '<span>Album</span>'}<span>Tag</span><span></span><span></span><span class="r">Durasi</span><span></span></div>
      ${list.map((t, i) => rowHtml(t, i, o)).join('')}
    </div>`;
  }

  const noResult = () => `<div class="empty"><h2>Tidak ada hasil</h2><p>Tidak ada yang cocok dengan “${esc(S.query)}”. Coba kata kunci lain.</p></div>`;

  function welcome() {
    const s = (h, l, c) => `<div class="sleeve ${c}"><div class="vinyl"><div class="disc"></div></div><div class="cover"><div class="cv ph" style="--h:${h}"><span>${l}</span></div></div></div>`;
    return `<div class="welcome">
      <div class="copy">
        <h1>Mulai dari satu folder musik</h1>
        <p>Armuse membaca lagu, sampul, dan tag dari folder di komputer Anda. Semuanya berjalan offline, tanpa akun dan tanpa unggahan.</p>
        <button class="btn-primary" data-act="add-folder">${ic('folderPlus')}Tambah folder musik</button>
      </div>
      <div class="fan" aria-hidden="true">${s(28, 'R', 's0')}${s(205, 'D', 's1')}${s(340, '♪', 's2')}</div>
    </div>`;
  }

  function viewAlbums() {
    if (!S.settings.folders.length && !S.tracks.length) return welcome();
    if (!S.tracks.length) return `<div class="empty"><h2>Belum ada lagu yang ditemukan</h2><p>Pastikan folder berisi file MP3, FLAC, M4A, AAC, OGG, OPUS, atau WAV, lalu pindai ulang.</p><p style="margin-top:16px"><button class="btn-ghost" data-act="rescan">${ic('refresh')}Pindai ulang</button></p></div>`;
    const list = sortedAlbums();
    const h = head('Album', `${list.length} album`, sortSelect('albums'));
    return h + (list.length ? `<div class="grid">${list.map(albumCard).join('')}</div>` : noResult());
  }

  function viewArtists() {
    if (!S.tracks.length) return viewAlbums();
    const q = S.query.trim().toLowerCase();
    const list = q
      ? S.artists.filter((r) => {
          if (window.jpSearch ? window.jpSearch.test(r.name, q) : r.name.toLowerCase().includes(q)) return true;
          return r.albums.some((a) => a.tracks.some((t) => (window.jpSearch ? window.jpSearch.test(t.search, q) : t.search.includes(q))));
        })
      : S.artists;
    const card = (r) => {
      const covers = r.albums.slice(0, 3);
      return `<article class="artist" data-name="${esc(r.name)}" tabindex="0">
        <div class="pile${covers.length === 1 ? ' one' : ''}">${covers.map((a, i) => `<div class="pc p${i}">${coverEl(a.cover, a.title)}</div>`).join('')}</div>
        <h3>${esc(r.name)}</h3><p>${r.albums.length} album, ${r.count} lagu</p></article>`;
    };
    return head('Artis', `${list.length} artis`) + (list.length ? `<div class="artist-grid">${list.map(card).join('')}</div>` : noResult());
  }

  function viewArtist(name) {
    const r = S.artists.find((x) => x.name === name);
    if (!r) return viewArtists();
    const albums = r.albums.slice().sort((a, b) => (b.year || 0) - (a.year || 0));
    S.visible = albums.flatMap((a) => a.tracks.map((t) => t.id));
    return head(r.name, `${r.albums.length} album, ${r.count} lagu`, playTools) + `<div class="grid">${albums.map(albumCard).join('')}</div>`;
  }

  function viewAlbum(id) {
    const a = S.albumById.get(id);
    if (!a) return viewAlbums();
    const artistLink = `<button data-act="open-artist" data-name="${esc(a.artist)}">${esc(a.artist)}</button>`;
    const facts = [a.year, `${a.tracks.length} lagu`, fmtLong(a.duration)].filter(Boolean).join(', ');
    return `<section class="album-head" data-id="${a.id}" data-dom>
      <div class="sleeve"><div class="vinyl"><div class="disc"></div></div><div class="cover">${coverEl(a.cover, a.title)}</div></div>
      <div class="info">
        <div class="kind">${a.single ? 'Lagu lepas' : 'Album'}</div>
        <h1>${esc(a.title)}</h1>
        <div class="who">${artistLink}</div>
        <div class="facts">${esc(facts)}</div>
        <div class="album-actions">
          <button class="btn-primary" data-act="play-all">${ic('play', 'fill')}Putar</button>
          <button class="btn-ghost" data-act="shuffle-all">${ic('shuffle')}Acak</button>
          <button class="btn-ghost" data-act="edit-album">${ic('pencil')}Edit tag album</button>
        </div>
      </div>
    </section>
    <div style="height:18px"></div>
    ${trackTable(a.tracks, { inAlbum: true, albumArtist: a.artist })}`;
  }

  function viewSongs(list, title, tools = true) {
    const sorted = sortedTracks(list);
    const h = head(title, `${sorted.length} lagu`, (tools && sorted.length ? playTools : '') + sortSelect('songs'));
    return h + (sorted.length ? trackTable(sorted) : S.query ? noResult() : `<div class="empty"><h2>Belum ada lagu di sini</h2><p>${title === 'Favorit' ? 'Tekan ikon hati pada sebuah lagu untuk menambahkannya ke favorit.' : 'Coba tambahkan folder musik dulu.'}</p></div>`);
  }

  function viewTags() {
    const cloud = (map, act) => [...map.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))
      .map(([k, n]) => `<button data-act="${act}" data-name="${esc(k)}">${esc(k)}<small>${n}</small></button>`).join('');
    return head('Tag & genre', '') + `
      <section class="tag-section"><h2>Tag saya</h2>
        <p>Label buatan Anda sendiri, misalnya “santai” atau “olahraga”. Tambahkan lewat menu edit tag pada sebuah lagu.</p>
        ${S.tagCounts.size ? `<div class="tag-cloud">${cloud(S.tagCounts, 'open-tag')}</div>` : '<p style="margin:0">Belum ada tag. Pilih lagu, lalu klik “Edit tag”.</p>'}
      </section>
      <section class="tag-section"><h2>Genre</h2>
        <p>Diambil dari tag di file musik, atau dari perubahan yang Anda buat.</p>
        ${S.genreCounts.size ? `<div class="tag-cloud">${cloud(S.genreCounts, 'open-genre')}</div>` : '<p style="margin:0">Belum ada genre yang terbaca.</p>'}
      </section>`;
  }

  function viewFolders() {
    const currentTab = S.folderTab || 'all';
    const localFolders = (S.settings && S.settings.folders) || [];
    const tt = (k) => (window.RD && RD.i18n ? RD.i18n.t(k) : k);

    const gd = S.gdrive || {
      folderUrl: (S.settings && S.settings.gdriveFolderUrl) || 'https://drive.google.com/drive/folders/1sVsVhxeQns63ltyyBpzm4LYSj1M6s-b3?usp=sharing',
      folderUrls: (S.settings && S.settings.gdriveFolderUrls) || [(S.settings && S.settings.gdriveFolderUrl) || 'https://drive.google.com/drive/folders/1sVsVhxeQns63ltyyBpzm4LYSj1M6s-b3?usp=sharing'],
      cachedCount: 50,
      maxCache: (S.settings && S.settings.gdriveMaxCache) || 50,
      cacheSizeFormatted: '2.3 GB',
      totalCatalogTracks: 469,
      totalCovers: 111
    };

    const cloudUrls = (gd.folderUrls && gd.folderUrls.length) ? gd.folderUrls : [gd.folderUrl].filter(Boolean);
    const maxCacheLimit = gd.maxCache || 50;

    // Segmented Tab Bar (High-End Front-End Glass Pill Control)
    const tabBar = `
      <div class="folder-segmented-control" role="tablist">
        <button class="seg-btn ${currentTab === 'all' ? 'active' : ''}" data-act="folder-tab" data-tab="all" role="tab">
          ${ic('layers', 'seg-icon')}
          <span>${tt('folder.tabAll')}</span>
          <span class="seg-badge">${localFolders.length + cloudUrls.length}</span>
        </button>
        <button class="seg-btn ${currentTab === 'local' ? 'active' : ''}" data-act="folder-tab" data-tab="local" role="tab">
          ${ic('hardDrive', 'seg-icon')}
          <span>${tt('folder.tabLocal')}</span>
          <span class="seg-badge">${localFolders.length}</span>
        </button>
        <button class="seg-btn ${currentTab === 'cloud' ? 'active' : ''}" data-act="folder-tab" data-tab="cloud" role="tab">
          ${ic('cloud', 'seg-icon')}
          <span>${tt('folder.tabCloud')}</span>
          <span class="seg-badge">${cloudUrls.length}</span>
        </button>
      </div>`;

    // 1. SECTION FOLDER LOKAL
    const rows = localFolders.map((f) => {
      const n = S.tracks.filter((t) => inFolder(t.path, f)).length;
      const off = S.offline.has(f);
      return `
        <div class="storage-item ${off ? 'off' : ''}">
          <div class="storage-item-icon">${ic('folder')}</div>
          <div class="storage-item-info">
            <span class="storage-item-title" title="${esc(f)}">${esc(f)}</span>
            <div class="storage-item-meta">
              <span>${off ? tt('folder.offline') : `${n} ${tt('folder.songsIndexed')}`}</span>
            </div>
          </div>
          <button class="btn-quiet" data-act="remove-folder" data-path="${esc(f)}" style="color:#ff6666; font-size:12px; height:28px; padding:0 12px; border-radius:6px; display:inline-flex; align-items:center; gap:5px;">
            ${ic('trash')} ${tt('folder.remove')}
          </button>
        </div>`;
    }).join('');

    const localSection = `
      <div class="storage-card">
        <div class="storage-header">
          <div class="storage-title-wrap">
            <div class="storage-icon-squircle">
              ${ic('hardDrive')}
            </div>
            <div>
              <h3 class="storage-heading">${tt('folder.localTitle')}</h3>
              <div class="storage-subheading">${tt('folder.localDesc')}</div>
            </div>
          </div>
          <span class="status-pill">
            <span class="dot"></span>${localFolders.length} ${tt('folder.tabLocal')}
          </span>
        </div>

        <div class="storage-list">
          ${rows || '<div class="empty" style="padding:16px 0; color:var(--muted); font-size:13px;">Belum ada direktori lokal.</div>'}
        </div>

        <div class="toolbar-actions" style="margin-top: 16px;">
          <button class="btn-primary" data-act="add-folder" style="gap:6px;">
            ${ic('folderPlus')} ${tt('folder.addLocal')}
          </button>
          <button class="btn-ghost" data-act="rescan" style="gap:6px;">
            ${ic('refresh')} ${tt('folder.rescan')}
          </button>
        </div>
      </div>`;

    // 2. SECTION PENYIMPANAN CLOUD
    const cloudUrlsListHtml = cloudUrls.map((u) => {
      let folderId = u;
      const m1 = u.match(/folders\/([a-zA-Z0-9_-]+)/);
      if (m1) folderId = m1[1];
      else {
        const m2 = u.match(/id=([a-zA-Z0-9_-]+)/);
        if (m2) folderId = m2[1];
      }
      return `
        <div class="storage-item">
          <div class="storage-item-icon" style="color:#1ed760; background:rgba(30,215,96,0.08);">
            ${ic('link')}
          </div>
          <div class="storage-item-info">
            <span class="storage-item-title" title="${esc(u)}">${esc(u)}</span>
            <div class="storage-item-meta">
              <span class="meta-id">ID: ${esc(folderId)}</span>
              <span style="color:#1ed760; display:inline-flex; align-items:center; gap:4px;">
                ${ic('check')} ${tt('folder.ready')}
              </span>
            </div>
          </div>
          ${cloudUrls.length > 1 ? `
            <button class="btn-quiet" data-act="gdrive-remove-url" data-url="${esc(u)}" style="color:#ff6666; font-size:12px; height:28px; padding:0 12px; border-radius:6px; display:inline-flex; align-items:center; gap:5px;">
              ${ic('trash')} ${tt('folder.remove')}
            </button>` : `
            <span style="font-size:11px; color:var(--muted); background:rgba(255,255,255,0.05); padding:3px 8px; border-radius:6px;">${tt('folder.primarySource')}</span>
          `}
        </div>`;
    }).join('');

    const cloudSection = `
      <div class="storage-card cloud-card">
        <div class="storage-header">
          <div class="storage-title-wrap">
            <div class="storage-icon-squircle cloud-tint">
              ${ic('cloud')}
            </div>
            <div>
              <h3 class="storage-heading">${tt('folder.cloudTitle')}</h3>
              <div class="storage-subheading">${tt('folder.cloudDesc')}</div>
            </div>
          </div>
          <span class="status-pill online">
            <span class="dot pulse"></span>${tt('folder.activeStreaming')}
          </span>
        </div>

        <!-- Daftar Link Folder Cloud Terhubung -->
        <div style="margin-bottom: 20px;">
          <div class="sub-section-header">
            <span class="sub-section-title">
              ${ic('link')} ${tt('folder.connectedFolders')} (${cloudUrls.length})
            </span>
            <span class="sub-section-hint">${tt('folder.multiLinkSupport')}</span>
          </div>
          <div class="cloud-links-list">
            ${cloudUrlsListHtml}
          </div>

          <!-- Form Tambah Link Folder Cloud Baru -->
          <div class="input-action-group">
            <div class="input-with-icon-wrap">
              <span class="input-lead-icon">${ic('link')}</span>
              <input type="text" id="gdrive-new-url" class="modern-text-input" placeholder="${esc(tt('folder.inputPlaceholder'))}" spellcheck="false" autocomplete="off">
            </div>
            <button class="btn-primary" data-act="gdrive-add-url" style="gap:6px; padding:0 16px; flex-shrink:0;">
              ${ic('plus')} ${tt('folder.addFolder')}
            </button>
          </div>
        </div>

        <!-- Pengaturan Kapasitas Smart Cache Lagu -->
        <div class="settings-inner-box">
          <div class="settings-box-header">
            <div class="settings-box-title-row">
              <div class="settings-box-icon">${ic('database')}</div>
              <div>
                <span class="settings-box-title">${tt('folder.cacheTitle')}</span>
                <span class="settings-box-desc">${tt('folder.cacheDesc')}</span>
              </div>
            </div>
            <div class="cache-limit-tag">${maxCacheLimit} Lagu</div>
          </div>

          <div class="cache-controls-strip">
            <div class="cache-input-group">
              <div class="stepper-container">
                <span class="stepper-prefix">Batas:</span>
                <input type="number" id="gdrive-max-cache-input" min="10" max="2000" step="10" value="${maxCacheLimit}">
                <span class="stepper-suffix">lagu</span>
              </div>
              <button class="btn-primary" data-act="gdrive-save-cache-limit" style="height:32px; padding:0 14px; font-size:12px; gap:5px;">
                ${ic('check')} ${tt('folder.saveLimit')}
              </button>
            </div>

            <div class="cache-preset-chips">
              <span style="font-size:11.5px; color:var(--muted); margin-right:4px;">${tt('folder.quickPicks')}</span>
              <button class="preset-chip-btn ${maxCacheLimit === 50 ? 'active' : ''}" data-act="gdrive-set-cache-preset" data-val="50">50</button>
              <button class="preset-chip-btn ${maxCacheLimit === 100 ? 'active' : ''}" data-act="gdrive-set-cache-preset" data-val="100">100</button>
              <button class="preset-chip-btn ${maxCacheLimit === 200 ? 'active' : ''}" data-act="gdrive-set-cache-preset" data-val="200">200</button>
              <button class="preset-chip-btn ${maxCacheLimit === 500 ? 'active' : ''}" data-act="gdrive-set-cache-preset" data-val="500">500</button>
              <button class="preset-chip-btn ${maxCacheLimit === 1000 ? 'active' : ''}" data-act="gdrive-set-cache-preset" data-val="1000">1000</button>
            </div>
          </div>
        </div>

        <!-- Panel Statistik -->
        <div class="stat-tiles-grid">
          <div class="stat-tile">
            <div class="stat-tile-top">
              <span class="stat-tile-label">${tt('folder.cloudLib')}</span>
              <span class="stat-tile-icon">${ic('music')}</span>
            </div>
            <div class="stat-tile-val">${gd.totalCatalogTracks || 0}</div>
            <div class="stat-tile-sub">Lagu terindeks</div>
          </div>

          <div class="stat-tile">
            <div class="stat-tile-top">
              <span class="stat-tile-label">${tt('folder.cachedTracks')}</span>
              <span class="stat-tile-icon">${ic('database')}</span>
            </div>
            <div class="stat-tile-val" style="color:#1ed760;">
              ${gd.cachedCount || 0} <span style="font-size:13px; font-weight:500; color:var(--muted);">/ ${maxCacheLimit}</span>
            </div>
            <div class="stat-tile-sub">${gd.cacheSizeFormatted || '0 B'}</div>
            <div class="stat-progress-bar">
              <div class="stat-progress-fill" style="width: ${Math.min(100, Math.round(((gd.cachedCount || 0) / maxCacheLimit) * 100))}%;"></div>
            </div>
          </div>

          <div class="stat-tile">
            <div class="stat-tile-top">
              <span class="stat-tile-label">${tt('folder.covers')}</span>
              <span class="stat-tile-icon">${ic('image')}</span>
            </div>
            <div class="stat-tile-val">${gd.totalCovers || 0}</div>
            <div class="stat-tile-sub">Cover resolusi tinggi</div>
          </div>
        </div>

        <!-- Tombol Aksi Cloud & Cache -->
        <div class="toolbar-actions">
          <button class="btn-primary" data-act="gdrive-sync" style="gap:6px;">
            ${ic('refresh')} ${tt('folder.sync')}
          </button>
          <button class="btn-ghost" data-act="gdrive-open-cache" style="gap:6px;">
            ${ic('folder')} ${tt('folder.openCache')} (${gd.cachedCount || 0})
          </button>
          <button class="btn-ghost" data-act="gdrive-open-covers" style="gap:6px;">
            ${ic('image')} ${tt('folder.openCovers')}
          </button>
          <button class="btn-quiet" data-act="gdrive-clear-cache" style="color:#ff6666; gap:6px; margin-left:auto;">
            ${ic('trash')} ${tt('folder.clearCache')}
          </button>
        </div>
        <div id="gdrive-sync-progress" style="display:none; margin-top:14px; font-size:12.5px; color:var(--accent);"></div>
      </div>`;

    let contentHtml = '';
    if (currentTab === 'all') {
      contentHtml = localSection + cloudSection;
    } else if (currentTab === 'local') {
      contentHtml = localSection;
    } else if (currentTab === 'cloud') {
      contentHtml = cloudSection;
    }

    return head(tt('folder.title'), `${localFolders.length} local · ${cloudUrls.length} cloud`) + `
      ${tabBar}
      ${contentHtml}
      <div class="callout-banner">
        <div class="callout-icon">${ic('sparkles')}</div>
        <div class="callout-body">
          ${tt('folder.note')}
        </div>
      </div>
      <div id="output-device"></div>`;
  }

  function viewPlaylists() {
    const list = RD.playlists ? RD.playlists.all() : [];
    const tools = `<button class="btn-primary" data-act="new-playlist">${PLAYLIST_ADD_ICON}Playlist baru</button>`;
    const card = (p) => {
      const cover = p.trackIds.map((id) => S.byId.get(id)).find((t) => t && t.cover);
      return `<article class="album" data-pl="${p.id}" tabindex="0" aria-label="${esc(p.name)}">
        <div class="sleeve"><div class="vinyl"><div class="disc"></div></div><div class="cover">${coverEl(p.cover || (cover ? cover.cover : null), p.name)}</div>
        <button class="pbtn" data-act="play-playlist" data-pl="${p.id}" aria-label="Putar ${esc(p.name)}">${ic('play', 'fill')}</button></div>
        <div class="meta"><h3>${esc(p.name)}</h3><div class="sub">${p.trackIds.length} lagu</div></div>
      </article>`;
    };
    return head('Playlist', `${list.length} playlist`, tools) + (list.length
      ? `<div class="grid">${list.map(card).join('')}</div>`
      : `<div class="empty"><h2>Belum ada playlist</h2><p>Buat playlist untuk mengelompokkan lagu favorit Anda, lalu tambahkan lagu lewat ikon di samping tiap lagu.</p></div>`);
  }

  function viewPlaylist(id) {
    const p = RD.playlists ? RD.playlists.byId(id) : null;
    if (!p) return viewPlaylists();
    const tracks = p.trackIds.map((tid) => S.byId.get(tid)).filter(Boolean);
    const tools = `<button class="btn-primary" data-act="play-all">${ic('play', 'fill')}Putar</button><button class="btn-ghost" data-act="shuffle-all">${ic('shuffle')}Acak</button><button class="btn-ghost" data-act="edit-playlist-cover">${ic('pencil')}Ganti sampul</button>${p.cover ? `<button class="btn-ghost" data-act="clear-playlist-cover">${ic('x')}Hapus sampul</button>` : ''}<button class="btn-ghost" data-act="rename-playlist">${ic('pencil')}Ganti nama</button><button class="btn-ghost" data-act="delete-playlist">${ic('x')}Hapus</button>`;
    S.visible = tracks.map((t) => t.id);
    return head(p.name, `${tracks.length} lagu`, tools) + (tracks.length
      ? trackTable(tracks, { inPlaylist: true, playlistId: p.id })
      : `<div class="empty"><h2>Playlist ini kosong</h2><p>Klik ikon “tambah ke playlist” pada sebuah lagu untuk menambahkannya ke sini.</p></div>`);
  }

  function viewStats() {
    const raw = RD.stats ? RD.stats.raw() : { totalMs: 0, tracks: {} };
    const totalPlays = Object.values(raw.tracks).reduce((s, r) => s + (r.count || 0), 0);
    const cards = [
      { label: tt('stats.totalTime'), value: raw.totalMs > 0 ? fmtLong(raw.totalMs / 1000) : tt('stats.zeroMinutes') },
      { label: tt('stats.totalTracks'), value: String(totalPlays) },
      { label: tt('stats.libraryTracks'), value: String(S.tracks.length) },
      { label: tt('stats.favTracks'), value: String(S.tracks.filter((t) => t.fav).length) },
    ];
    const cardsHtml = `<div class="stat-cards">${cards.map((c) => `<div class="stat-card"><b>${esc(c.value)}</b><span>${esc(c.label)}</span></div>`).join('')}</div>`;

    const withCount = S.tracks.map((t) => ({ t, r: raw.tracks[t.id] })).filter((x) => x.r && x.r.count > 0);
    const topTracks = withCount.slice().sort((a, b) => b.r.count - a.r.count).slice(0, 10);

    const artistAgg = new Map(), albumAgg = new Map();
    withCount.forEach(({ t, r }) => {
      artistAgg.set(t.displayArtist, (artistAgg.get(t.displayArtist) || 0) + r.count);
      const al = t.album || tt('stats.noAlbum');
      albumAgg.set(al, (albumAgg.get(al) || 0) + r.count);
    });
    const topArtists = [...artistAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topAlbums = [...albumAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const genreEntries = [...S.genreCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const recentAdded = S.tracks.slice().sort((a, b) => (b.added || 0) - (a.added || 0)).slice(0, 8);

    const trackRow = ({ t, r }) => `<div class="stat-row" data-act="play-track-id" data-id="${t.id}"><div class="th">${coverEl(t.cover, t.album || t.title)}</div><div class="ti"><b>${esc(t.title)}</b><small>${esc(t.displayArtist)}</small></div><span class="ct">${r.count}${tt('stats.playedTimesSuffix')}</span></div>`;

    const barList = (entries) => {
      if (!entries.length) return `<p class="lyr-hint">${esc(tt('stats.emptyHint'))}</p>`;
      const max = entries[0][1] || 1;
      return entries.map(([label, count]) => `<div class="stat-bar"><span class="lbl" title="${esc(label)}">${esc(label)}</span><div class="bar"><i style="width:${Math.round((count / max) * 100)}%"></i></div><span class="n">${count}</span></div>`).join('');
    };

    const recentHtml = recentAdded.length
      ? `<div class="stat-mini-grid">${recentAdded.map((t) => `<div class="stat-mini" data-act="play-track-id" data-id="${t.id}"><div class="th">${coverEl(t.cover, t.album || t.title)}</div><b>${esc(t.title)}</b><small>${esc(t.displayArtist)}</small></div>`).join('')}</div>`
      : `<p class="lyr-hint">${esc(tt('stats.emptyLibrary'))}</p>`;

    return head(tt('stats.title'), tt('stats.desc'), `<button class="btn-primary" data-act="open-wrapped">${esc(tt('stats.wrapped'))}</button>`) + cardsHtml + `
      <div class="stat-cols">
        <section class="stat-block"><h2>${esc(tt('stats.topTracks'))}</h2>${topTracks.length ? topTracks.map(trackRow).join('') : `<p class="lyr-hint">${esc(tt('stats.emptyHint'))}</p>`}</section>
        <section class="stat-block">
          <h2>${esc(tt('stats.topArtists'))}</h2>${barList(topArtists)}
          <h2 style="margin-top:22px">${esc(tt('stats.topAlbums'))}</h2>${barList(topAlbums)}
        </section>
      </div>
      <section class="stat-block"><h2>${esc(tt('stats.genreDist'))}</h2>${barList(genreEntries)}</section>
      <section class="stat-block"><h2>${esc(tt('stats.recentAdded'))}</h2>${recentHtml}</section>`;
  }

  function render() {
    const el = $('#content');
    const v = S.view;
    const key = v.type + '|' + (v.key || '');
    const keepScroll = S.renderKey === key;
    const top = el.scrollTop;
    S.visible = [];
    let html;
    switch (v.type) {
      case 'artists': html = viewArtists(); break;
      case 'artist': html = viewArtist(v.key); break;
      case 'album': html = viewAlbum(v.key); break;
      case 'songs': html = viewSongs(S.tracks, tt('nav.songs', 'Lagu')); break;
      case 'favorites': html = viewSongs(S.tracks.filter((t) => t.fav), tt('nav.favorites', 'Favorit')); break;
      case 'tags': html = viewTags(); break;
      case 'tag': html = viewSongs(S.tracks.filter((t) => t.tags.includes(v.key)), v.key); break;
      case 'genre': html = viewSongs(S.tracks.filter((t) => t.genres.includes(v.key)), v.key); break;
      case 'folders': html = viewFolders(); break;
      case 'playlists': html = viewPlaylists(); break;
      case 'playlist': html = viewPlaylist(v.key); break;
      case 'stats': html = viewStats(); break;
      case 'youtube': html = RD.youtube ? RD.youtube.render() : ''; break;
      case 'remote': html = RD.remote ? RD.remote.render() : ''; break;
      case 'support': html = RD.support ? RD.support.render() : ''; break;
      default: html = viewAlbums();
    }
    el.innerHTML = html;
    if (v.type === 'folders' && RD.outputDevice) RD.outputDevice.mount();
    el.scrollTop = keepScroll ? top : 0;
    if (!keepScroll) {
      el.classList.remove('view-enter');
      void el.offsetWidth;
      el.classList.add('view-enter');
      clearTimeout(el._veTimer);
      el._veTimer = setTimeout(() => el.classList.remove('view-enter'), 220);
    }
    S.renderKey = key;
    syncChrome();
  }

  function syncChrome() {
    const root = { artist: 'artists', album: 'albums', tag: 'tags', genre: 'tags', playlist: 'playlists' }[S.view.type] || S.view.type;
    $$('#nav button, .nav-foot').forEach((b) => b.classList.toggle('active', b.dataset.view === root));
    $('#btn-back').hidden = !S.history.length;
    $('#stats').textContent = S.tracks.length ? `${S.tracks.length} lagu, ${S.albums.length} album` : '';
    updateMarks();
    refreshSelection();
  }

  function updateMarks() {
    const t = current();
    $$('.album, .album-head').forEach((el) => {
      const cur = !!t && t.albumId === el.dataset.id;
      el.classList.toggle('is-current', cur);
      el.classList.toggle('is-spinning', cur && S.playing);
    });
    $$('#content .row').forEach((el) => el.classList.toggle('playing', !!t && el.dataset.id === t.id));
    $('#content').classList.toggle('is-playing', S.playing);
  }

  // ============================================================ Seleksi & menu
  function refreshSelection() {
    $$('#content .row').forEach((r) => {
      const on = S.selected.has(r.dataset.id);
      r.classList.toggle('sel', on);
      r.setAttribute('aria-selected', on);
    });
    const bar = $('#selbar');
    const n = S.selected.size;
    bar.hidden = !n;
    if (n) {
      bar.innerHTML = `<span class="n">${n} lagu dipilih</span>
        <button class="strong" data-act="sel-play">${ic('play', 'fill')}Putar</button>
        <button data-act="sel-next">${ic('queueNext')}Putar berikutnya</button>
        <button data-act="sel-queue">${ic('list')}Tambah ke antrean</button>
        <button data-act="sel-edit">${ic('pencil')}Edit tag</button>
        <button data-act="sel-clear" aria-label="Batalkan pilihan">${ic('x')}</button>`;
    }
  }

  function onRowSelect(row, e) {
    const id = row.dataset.id, i = +row.dataset.i;
    if (e.shiftKey && S.anchor != null) {
      const [a, b] = [Math.min(S.anchor, i), Math.max(S.anchor, i)];
      if (!(e.ctrlKey || e.metaKey)) S.selected.clear();
      for (let k = a; k <= b; k++) S.selected.add(S.visible[k]);
    } else if (e.ctrlKey || e.metaKey) {
      if (S.selected.has(id)) S.selected.delete(id); else S.selected.add(id);
      S.anchor = i;
    } else {
      if (S.selected.size === 1 && S.selected.has(id)) S.selected.clear(); else S.selected = new Set([id]);
      S.anchor = i;
    }
    refreshSelection();
  }

  const menu = $('#ctx');
  function openMenu(x, y, items) {
    menu.innerHTML = items.map((it, i) => (it.sep ? '<hr>' : `<button role="menuitem" data-i="${i}">${it.icon ? ic(it.icon) : ''}<span>${esc(it.label)}</span></button>`)).join('');
    menu._items = items;
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
    const first = $('button', menu);
    if (first) first.focus({ preventScroll: true });
  }
  const closeMenu = () => { menu.hidden = true; };
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const it = menu._items[+b.dataset.i];
    closeMenu();
    it.run();
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#ctx')) closeMenu(); }, true);

  const idsForAlbum = (id) => (S.albumById.get(id) || { tracks: [] }).tracks.map((t) => t.id);

  function trackMenu(x, y, row) {
    const id = row.dataset.id;
    if (!S.selected.has(id)) { S.selected = new Set([id]); S.anchor = +row.dataset.i; refreshSelection(); }
    const ids = [...S.selected];
    const list = ids.map((i) => S.byId.get(i));
    const allFav = list.every((t) => t.fav);
    const items = [
      { label: ids.length > 1 ? 'Putar pilihan' : 'Putar dari sini', icon: 'play', run: () => (ids.length > 1 ? startQueue(ids, 0) : startQueue(S.visible, +row.dataset.i)) },
      { label: 'Putar berikutnya', icon: 'queueNext', run: () => enqueue(ids, true) },
      { label: 'Tambah ke antrean', icon: 'list', run: () => enqueue(ids, false) },
      { sep: true },
      { label: allFav ? 'Hapus dari favorit' : 'Tambah ke favorit', icon: 'heart', run: () => toggleFav(ids, !allFav) },
      { label: ids.length > 1 ? `Edit tag ${ids.length} lagu` : 'Edit tag', icon: 'pencil', run: () => RD.openEditor(ids) },
    ];
    if (ids.length === 1) items.push({ sep: true }, { label: 'Tampilkan di folder', icon: 'folder', run: () => api.reveal(list[0].path) });
    openMenu(x, y, items);
  }

  function albumMenu(x, y, id) {
    const ids = idsForAlbum(id);
    openMenu(x, y, [
      { label: 'Putar album', icon: 'play', run: () => startQueue(ids, 0) },
      { label: 'Acak album', icon: 'shuffle', run: () => startQueue(ids, Math.floor(Math.random() * ids.length), true) },
      { label: 'Putar berikutnya', icon: 'queueNext', run: () => enqueue(ids, true) },
      { label: 'Tambah ke antrean', icon: 'list', run: () => enqueue(ids, false) },
      { sep: true },
      { label: 'Edit tag album', icon: 'pencil', run: () => RD.openEditor(ids) },
    ]);
  }

  function setPlaylistCover(id) {
    api.setPlaylistCover(id).then(() => RD.playlists.refresh()).then(render);
  }

  function clearPlaylistCover(id) {
    api.clearPlaylistCover(id).then(() => RD.playlists.refresh()).then(render);
  }

  function renamePlaylistFlow(id) {
    const cur = RD.playlists && RD.playlists.byId(id);
    RD.ask({ title: 'Ganti nama playlist', input: { label: 'Nama', value: cur ? cur.name : '' }, ok: 'Simpan' })
      .then((name) => { if (name) api.renamePlaylist(id, name).then(() => RD.playlists.refresh()).then(render); });
  }

  function deletePlaylistFlow(id) {
    RD.ask({ title: 'Hapus playlist ini?', message: 'Lagu di dalamnya tidak dihapus dari pustaka, hanya playlistnya.', ok: 'Hapus' })
      .then((ok) => { if (ok) api.deletePlaylist(id).then(() => RD.playlists.refresh()).then(() => nav('playlists')); });
  }

  function playlistMenu(x, y, id) {
    const p = RD.playlists && RD.playlists.byId(id);
    if (!p) return;
    const ids = p.trackIds.filter((tid) => S.byId.has(tid));
    openMenu(x, y, [
      { label: 'Putar playlist', icon: 'play', run: () => startQueue(ids, 0) },
      { label: 'Acak playlist', icon: 'shuffle', run: () => startQueue(ids, Math.floor(Math.random() * ids.length), true) },
      { label: 'Putar berikutnya', icon: 'queueNext', run: () => enqueue(ids, true) },
      { label: 'Tambah ke antrean', icon: 'list', run: () => enqueue(ids, false) },
      { sep: true },
      { label: 'Ganti sampul', icon: 'pencil', run: () => setPlaylistCover(id) },
      { label: 'Ganti nama', icon: 'pencil', run: () => renamePlaylistFlow(id) },
      { label: 'Hapus playlist', icon: 'x', run: () => deletePlaylistFlow(id) },
    ]);
  }

  // ============================================================ Pemutaran
  const shuffleArr = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  function startQueue(ids, idx, forceShuffle = false) {
    if (!ids.length) return;
    if (forceShuffle && !S.shuffle) { S.shuffle = true; updateModes(); saveSoon(); }
    S.orig = ids.slice();
    if (S.shuffle) {
      const cur = ids[idx];
      const rest = shuffleArr(ids.filter((_, i) => i !== idx));
      S.queue = [cur, ...rest];
      S.qi = 0;
    } else {
      S.queue = ids.slice();
      S.qi = idx;
    }
    loadCurrent(true);
  }

  function enqueue(ids, asNext) {
    if (!ids.length) return;
    if (!S.queue.length) { startQueue(ids, 0); return; }
    if (asNext) {
      S.queue.splice(S.qi + 1, 0, ...ids);
      const oi = S.orig.indexOf(S.queue[S.qi]);
      S.orig.splice(oi < 0 ? S.orig.length : oi + 1, 0, ...ids);
    } else {
      S.queue.push(...ids);
      S.orig.push(...ids);
    }
    toast(asNext ? `${ids.length} lagu diputar berikutnya` : `${ids.length} lagu ditambahkan ke antrean`);
    renderQueue();
  }

  function loadCurrent(autoplay = true) {
    const t = current();
    if (!t) return;
    audio.src = api.mediaUrl(t.path);
    if (engine) engine.resume();
    if (autoplay) audio.play().catch((err) => { if (err && err.name !== 'AbortError') console.warn(err); });
    updateNowPlaying();
    renderQueue();
    updateMarks();

    if (activeTrackStatusTimer) {
      clearInterval(activeTrackStatusTimer);
      activeTrackStatusTimer = null;
    }

    if (!t.cloud && (!t.path || !t.path.startsWith('gdrive://'))) {
      activeTrackBufPct = 100;
    } else {
      activeTrackBufPct = 0;
      if (t.gdriveId && api.gdriveTrackStatus) {
        const pollStatus = async () => {
          try {
            const st = await api.gdriveTrackStatus(t.gdriveId);
            if (st.cached || st.isDone) {
              activeTrackBufPct = 100;
              if (activeTrackStatusTimer) {
                clearInterval(activeTrackStatusTimer);
                activeTrackStatusTimer = null;
              }
            } else {
              activeTrackBufPct = Math.max(activeTrackBufPct, (st.progress || 0) * 100);
            }
          } catch (_) {}
        };
        pollStatus();
        activeTrackStatusTimer = setInterval(pollStatus, 600);
      }
    }

    // Pre-fetch lagu berikutnya dalam antrean untuk latensi 0ms saat transisi
    if (api.gdrivePrefetch && S.queue && S.queue.length > S.qi + 1) {
      const nextId = S.queue[S.qi + 1];
      const nextT = S.byId.get(nextId);
      if (nextT && nextT.cloud && nextT.gdriveId) {
        api.gdrivePrefetch(nextT.gdriveId, nextT.path).catch(() => {});
      }
    }
  }

  function togglePlay() {
    if (!S.queue.length) {
      const ids = S.visible.length ? S.visible : S.tracks.map((t) => t.id);
      if (ids.length) startQueue(ids, 0);
      return;
    }
    if (engine) engine.resume();
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }

  function next(auto = false) {
    if (!S.queue.length) return;
    if (auto && S.repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    let i = S.qi + 1;
    if (i >= S.queue.length) {
      if (S.repeat === 'all') i = 0;
      else { audio.pause(); audio.currentTime = 0; setPlaying(false); return; }
    }
    S.qi = i;
    loadCurrent(true);
  }

  function prev() {
    if (!S.queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (S.qi > 0) S.qi--;
    else if (S.repeat === 'all') S.qi = S.queue.length - 1;
    else { audio.currentTime = 0; return; }
    loadCurrent(true);
  }

  function toggleShuffle() {
    S.shuffle = !S.shuffle;
    const cur = S.queue[S.qi];
    if (S.queue.length) {
      if (S.shuffle) {
        const head = S.queue.slice(0, S.qi + 1);
        S.queue = head.concat(shuffleArr(S.queue.slice(S.qi + 1)));
      } else {
        S.queue = S.orig.slice();
        const i = S.queue.indexOf(cur);
        if (i >= 0) S.qi = i;
      }
      renderQueue();
    }
    updateModes();
    saveSoon();
  }

  function toggleRepeat() {
    S.repeat = { off: 'all', all: 'one', one: 'off' }[S.repeat];
    updateModes();
    saveSoon();
    toast({ off: 'Ulangi: mati', all: 'Ulangi semua lagu', one: 'Ulangi satu lagu' }[S.repeat], 1600);
  }

  function updateModes() {
    const sh = $('#btn-shuffle'), rp = $('#btn-repeat');
    sh.setAttribute('aria-pressed', S.shuffle);
    rp.setAttribute('aria-pressed', S.repeat !== 'off');
    rp.querySelector('[data-ic]').innerHTML = ic(S.repeat === 'one' ? 'repeat1' : 'repeat');
  }

  function setPlaying(on) {
    S.playing = on;
    const b = $('#btn-play');
    b.innerHTML = ic(on ? 'pause' : 'play', 'fill');
    b.setAttribute('aria-label', on ? 'Jeda' : 'Putar');
    updateMarks();
    if (on) requestAnimationFrame(tick);
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
    renderMiniBar();
  }

  function setRange(el, v, max) {
    el.value = v;
    el.style.setProperty('--pct', (max ? (v / max) * 100 : 0) + '%');
  }

  function getMaxBufferedTime() {
    let max = 0;
    if (audio.buffered && audio.buffered.length > 0) {
      for (let i = 0; i < audio.buffered.length; i++) {
        const end = audio.buffered.end(i);
        if (end > max) max = end;
      }
    }
    return max;
  }

  let seeking = false;
  let activeTrackBufPct = 0;
  let activeTrackStatusTimer = null;

  function tick() {
    if (!seeking) {
      const d = audio.duration;
      if (d && isFinite(d)) {
        setRange($('#seek'), (audio.currentTime / d) * 1000, 1000);
        const maxBuf = getMaxBufferedTime();
        const htmlBufPct = (maxBuf / d) * 100;
        const displayBuf = Math.min(100, Math.max(activeTrackBufPct, htmlBufPct));
        $('#seek').style.setProperty('--buf', displayBuf + '%');
      }
      $('#t-cur').textContent = fmt(audio.currentTime);
    }
    if (S.playing) requestAnimationFrame(tick);
  }

  function renderMiniBar() {
    const t = current();
    const qEl = $('#np-quality');
    $('#mb-cover').innerHTML = coverEl(t ? t.cover : null, t ? t.title : 'Armuse');
    $('#mb-title').textContent = t ? t.title : 'Belum ada lagu';
    $('#mb-artist').textContent = t ? t.displayArtist : 'Armuse';
    const q = $('#mb-quality');
    if (qEl && !qEl.hidden) { q.innerHTML = qEl.innerHTML; q.hidden = false; } else { q.hidden = true; }
    const play = $('#mb-play');
    play.innerHTML = ic(S.playing ? 'pause' : 'play', 'fill');
    play.setAttribute('aria-label', S.playing ? 'Jeda' : 'Putar');
    const fav = $('#mb-fav');
    const isFav = t ? !!t.fav : false;
    fav.setAttribute('aria-pressed', isFav);
    fav.innerHTML = ic('heart', isFav ? 'fill' : '');
    if (RD.island && RD.island.update) RD.island.update();
  }

  function updateNowPlaying() {
    const t = current();
    $('#np-title').textContent = t ? t.title : 'Belum ada lagu';
    $('#np-artist').textContent = t ? t.displayArtist : 'Pilih lagu untuk mulai';
    $('#np-cover').innerHTML = t ? coverEl(t.cover, t.album || t.title) : '';
    $('#np-cover').disabled = !t;
    const fav = $('#np-fav');
    fav.setAttribute('aria-pressed', !!(t && t.fav));
    fav.querySelector('[data-ic]').innerHTML = ic('heart', t && t.fav ? 'fill' : '');
    fav.disabled = !t;
    document.title = t ? `${t.title} - ${t.displayArtist}` : 'Armuse';
    $('#t-dur').textContent = fmt(t ? t.duration : 0);
    const token = ++S.accentToken;
    if (t && t.cover) colorFor(t.cover).then((c) => { if (token === S.accentToken) setAccent(c ? accentCss(c) : null); });
    else setAccent(null);
    if (RD.quality) RD.quality.update(t);
    if (RD.lyrics) RD.lyrics.onTrackChange(t);
    if (RD.nowPlaying) RD.nowPlaying.onTrackChange(t);
    if (RD.stats) RD.stats.onTrackChange(t);
    if (RD.visualizer) RD.visualizer.onTrackChange(t);
    renderMiniBar();
    if ('mediaSession' in navigator && t) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.displayArtist, album: t.album,
        artwork: [], // skema media:// tidak diterima MediaSession
      });
    }
  }

  function toggleFav(ids, val) {
    const list = ids.map((i) => S.byId.get(i)).filter(Boolean);
    if (!list.length) return;
    if (val === undefined) val = !list.every((t) => t.fav);
    list.forEach((t) => { if (val) t.custom.favorite = true; else delete t.custom.favorite; t.fav = val; });
    api.updateTracks({ ids, patch: { favorite: val } });
    const set = new Set(ids);
    $$('#content .row').forEach((r) => {
      if (!set.has(r.dataset.id)) return;
      const b = r.querySelector('.fav');
      b.setAttribute('aria-pressed', val);
      b.innerHTML = ic('heart', val ? 'fill' : '');
    });
    updateNowPlaying();
    if (S.view.type === 'favorites') render();
  }

  // Dipanggil editor setelah tag disimpan
  RD.applyUpdated = (updated, ids) => {
    const map = new Map(updated.map((t) => [t.id, hydrate(t)]));
    S.tracks = S.tracks.map((t) => map.get(t.id) || t);
    buildIndex();
    if (S.view.type === 'album' && !S.albumById.has(S.view.key)) {
      const t = S.byId.get(ids[0]);
      if (t) S.view.key = t.albumId; else nav('albums');
    }
    if (S.view.type === 'artist' && !S.artists.some((r) => r.name === S.view.key)) nav('artists');
    render();
    updateNowPlaying();
    renderQueue();
  };

  // ============================================================ Antrean
  function renderQueue() {
    const targets = $$('#tab-queue, #npt-queue');
    if (!targets.length) return;
    let html;
    if (!S.queue.length) {
      html = '<div class="q-empty">Antrean kosong. Putar sebuah album atau lagu, atau pilih “Tambah ke antrean” dari menu klik kanan.</div>';
    } else {
      const item = (id, i, cur) => {
        const t = S.byId.get(id);
        if (!t) return '';
        return `<div class="q-item${cur ? ' cur' : ''}" data-qi="${i}"><div class="th">${coverEl(t.cover, t.album || t.title)}</div>
          <div><b>${esc(t.title)}</b><small>${esc(t.displayArtist)}</small></div>
          ${cur ? '<span></span>' : `<button class="rm" data-act="q-rm" aria-label="Hapus dari antrean">${ic('x')}</button>`}</div>`;
      };
      const upcoming = S.queue.slice(S.qi + 1);
      const LIMIT = 150;
      html = `<div class="q-h"><span>Sedang diputar</span></div>${item(S.queue[S.qi], S.qi, true)}
        <div class="q-h"><span>Berikutnya, ${upcoming.length} lagu</span>${upcoming.length ? '<button class="btn-quiet" data-act="q-clear">Kosongkan</button>' : ''}</div>
        ${upcoming.slice(0, LIMIT).map((id, k) => item(id, S.qi + 1 + k, false)).join('') || '<div class="q-empty" style="padding:8px 0">Tidak ada lagu berikutnya.</div>'}
        ${upcoming.length > LIMIT ? `<div class="q-empty" style="padding:10px 0">dan ${upcoming.length - LIMIT} lagu lagi</div>` : ''}`;
    }
    targets.forEach((el) => { el.innerHTML = html; });
  }

  function openDrawer(tab) {
    const d = $('#drawer');
    if (d.classList.contains('open') && S.tab === tab) { closeDrawer(); return; }
    S.tab = tab;
    d.classList.add('open');
    d.inert = false;
    $$('.drawer-tabs [role=tab]').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
    $('#btn-queue').setAttribute('aria-pressed', tab === 'queue');
    $('#btn-eq').setAttribute('aria-pressed', tab === 'eq');
    if (tab === 'queue') { RD.eq.stop(); renderQueue(); }
    else if (tab === 'quality') { RD.eq.stop(); if (RD.quality) RD.quality.showTab(); }
    else RD.eq.start();
  }
  function closeDrawer() {
    const d = $('#drawer');
    d.classList.remove('open');
    d.inert = true;
    S.tab = null;
    $('#btn-queue').setAttribute('aria-pressed', false);
    $('#btn-eq').setAttribute('aria-pressed', false);
    RD.eq.stop();
  }

  RD.openDrawer = openDrawer;
  RD.goAlbum = (id) => go('album', id);
  RD.openMenu = openMenu;

  // ============================================================ Dialog kecil (konfirmasi / input teks)
  RD.ask = function ask({ title, message, input, ok, cancel }) {
    const okText = ok || (window.RD && RD.i18n ? RD.i18n.t('settings.dialog.ok') : 'OK');
    const cancelText = cancel || (window.RD && RD.i18n ? RD.i18n.t('settings.dialog.cancel') : 'Batal');
    return new Promise((resolve) => {
      const d = $('#prompt');
      d.innerHTML = `<div class="dlg-head"><h2 id="pr-title">${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ''}</div>
        <div class="dlg-body">${input ? `<div class="field"><label for="pr-in">${esc(input.label)}</label><input id="pr-in" value="${esc(input.value || '')}" maxlength="40" autocomplete="off" spellcheck="false"></div>` : ''}</div>
        <div class="dlg-foot"><span class="spacer"></span><button class="btn-quiet" data-r="0">${esc(cancelText)}</button><button class="btn-primary" data-r="1">${esc(okText)}</button></div>`;
      let result = null;
      const finish = (yes) => { result = yes ? (input ? $('#pr-in', d).value.trim() : true) : null; d.close(); };
      d.onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) finish(b.dataset.r === '1'); };
      d.onkeydown = (e) => { if (e.key === 'Enter' && input) { e.preventDefault(); finish(true); } };
      d.onclose = () => resolve(result);
      d.showModal();
      const f = input ? $('#pr-in', d) : $('.btn-primary', d);
      f.focus();
      if (input) f.select();
    });
  };

  // ============================================================ Pustaka: pindai & folder
  async function rescan({ quiet = false } = {}) {
    if (S.scanning || !S.settings.folders.length) return;
    S.scanning = true;
    const btn = $('#btn-scan');
    btn.classList.add('spin');
    $('#scan-bar').hidden = false;
    const before = S.tracks.length;
    try {
      const r = await api.scan();
      if (r.busy) return;
      S.offline = new Set(r.offline || []);
      setTracks(r.tracks);
      render();
      const diff = S.tracks.length - before;
      if (!quiet || diff !== 0) toast(diff > 0 && before ? `${diff} lagu baru ditemukan` : `${S.tracks.length} lagu di pustaka`);
      if (r.offline && r.offline.length) toast(`${r.offline.length} folder tidak terhubung. Datanya tetap disimpan.`, 4500);
      if (r.failed) console.warn(`${r.failed} file tidak terbaca tag-nya`);
    } catch (err) {
      console.error(err);
      toast('Pemindaian gagal. Periksa akses ke folder musik.');
    } finally {
      S.scanning = false;
      btn.classList.remove('spin');
      $('#scan-bar').hidden = true;
      $('#scan-status').textContent = '';
    }
  }

  async function addFolder() {
    const r = await api.addFolder();
    S.settings.folders = r.settings.folders;
    if (r.added) await rescan(); else render();
  }

  async function removeFolder(path) {
    const ok = await RD.ask({
      title: 'Hapus folder dari pustaka?',
      message: 'Lagu dari folder ini hilang dari Armuse, termasuk tag kustom yang Anda buat. File musiknya tidak dihapus dari komputer.',
      ok: 'Hapus dari pustaka',
    });
    if (!ok) return;
    const r = await api.removeFolder(path);
    S.settings.folders = r.settings.folders;
    setTracks(r.tracks);
    const alive = new Set(S.tracks.map((t) => t.id));
    S.queue = S.queue.filter((id) => alive.has(id));
    S.orig = S.orig.filter((id) => alive.has(id));
    S.qi = Math.min(S.qi, S.queue.length - 1);
    render();
  }

  // ============================================================ Event
  function bindContent() {
    const content = $('#content');

    content.addEventListener('click', (e) => {
      const actEl = e.target.closest('[data-act]');
      if (actEl) return handleAct(actEl.dataset.act, actEl, e);
      const chip = e.target.closest('.chip[data-tag]');
      if (chip) return go('tag', chip.dataset.tag);
      const plCard = e.target.closest('.album[data-pl]');
      if (plCard) return go('playlist', plCard.dataset.pl);
      const album = e.target.closest('.album');
      if (album) return go('album', album.dataset.id);
      const artist = e.target.closest('.artist');
      if (artist) return go('artist', artist.dataset.name);
      const row = e.target.closest('.row');
      if (row) return onRowSelect(row, e);
      if (!e.target.closest('button, select, a, .thead') && S.selected.size) { S.selected.clear(); refreshSelection(); }
    });

    content.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.row');
      if (row && !e.target.closest('button, .alb, .chip')) startQueue(S.visible, +row.dataset.i);
    });

    content.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.row');
      const plCard = e.target.closest('.album[data-pl]');
      const album = e.target.closest('.album:not([data-pl])');
      if (row) { e.preventDefault(); trackMenu(e.clientX, e.clientY, row); }
      else if (plCard) { e.preventDefault(); playlistMenu(e.clientX, e.clientY, plCard.dataset.pl); }
      else if (album) { e.preventDefault(); albumMenu(e.clientX, e.clientY, album.dataset.id); }
    });

    content.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const pl = e.target.closest('.album[data-pl]');
        const album = e.target.closest('.album:not([data-pl])');
        const artist = e.target.closest('.artist');
        if (pl && e.target === pl) go('playlist', pl.dataset.pl);
        else if (album && e.target === album) go('album', album.dataset.id);
        else if (artist && e.target === artist) go('artist', artist.dataset.name);
      }
    });

    content.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-sort]');
      if (!sel) return;
      S.settings.sort[sel.dataset.sort] = sel.value;
      saveSoon();
      render();
    });

    $('#selbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) handleAct(b.dataset.act, b, e);
    });
  }

  function viewTrackIds() {
    if (S.view.type === 'album') return idsForAlbum(S.view.key);
    return S.visible.slice();
  }

  function handleAct(act, el, e) {
    const rowEl = el.closest('.row');
    switch (act) {
      case 'play-album': e.stopPropagation(); startQueue(idsForAlbum(el.closest('.album').dataset.id), 0); break;
      case 'play-row': startQueue(S.visible, +rowEl.dataset.i); break;
      case 'play-all': { const ids = viewTrackIds(); startQueue(ids, 0); break; }
      case 'shuffle-all': { const ids = viewTrackIds(); startQueue(ids, Math.floor(Math.random() * ids.length), true); break; }
      case 'fav': e.stopPropagation(); toggleFav([rowEl.dataset.id]); break;
      case 'edit-row': {
        e.stopPropagation();
        const id = rowEl.dataset.id;
        RD.openEditor(S.selected.has(id) ? [...S.selected] : [id]);
        break;
      }
      case 'edit-album': RD.openEditor(idsForAlbum(S.view.key)); break;
      case 'open-album': e.stopPropagation(); { const t = S.byId.get(rowEl.dataset.id); if (t) go('album', t.albumId); } break;
      case 'open-artist': go('artist', el.dataset.name); break;
      case 'open-tag': go('tag', el.dataset.name); break;
      case 'open-genre': go('genre', el.dataset.name); break;
      case 'add-folder': addFolder(); break;
      case 'rescan': rescan(); break;
      case 'remove-folder': removeFolder(el.dataset.path); break;
      case 'folder-tab': {
        S.folderTab = el.dataset.tab;
        render();
        break;
      }
      case 'gdrive-save-url': {
        const inp = $('#gdrive-folder-url');
        if (inp && inp.value.trim() && api.gdriveSaveUrl) {
          api.gdriveSaveUrl(inp.value.trim()).then((st) => {
            S.gdrive = st;
            toast('Link folder Google Drive berhasil disimpan');
            render();
          });
        }
        break;
      }
      case 'gdrive-add-url': {
        const inp = $('#gdrive-new-url');
        if (inp && inp.value.trim() && api.gdriveAddUrl) {
          api.gdriveAddUrl(inp.value.trim()).then((st) => {
            S.gdrive = st;
            toast(tt('folder.linkAddedToast') || 'Link folder Google Drive baru berhasil ditambahkan');
            render();
          });
        }
        break;
      }
      case 'gdrive-remove-url': {
        const u = el.dataset.url;
        if (u && api.gdriveRemoveUrl) {
          if (confirm(tt('folder.confirmRemove') || 'Hapus link folder Google Drive ini dari daftar?')) {
            api.gdriveRemoveUrl(u).then((st) => {
              S.gdrive = st;
              toast(tt('folder.linkRemovedToast') || 'Link folder cloud dihapus');
              render();
            });
          }
        }
        break;
      }
      case 'gdrive-save-cache-limit': {
        const inp = $('#gdrive-max-cache-input');
        if (inp && api.gdriveSetMaxCache) {
          const num = parseInt(inp.value, 10);
          if (!isNaN(num) && num >= 10) {
            api.gdriveSetMaxCache(num).then((st) => {
              S.gdrive = st;
              toast(`${tt('folder.cacheLimitToast') || 'Kapasitas smart cache diatur ke'} ${num} ${tt('folder.songsIndexed') || 'lagu'}`);
              render();
            });
          }
        }
        break;
      }
      case 'gdrive-set-cache-preset': {
        const val = parseInt(el.dataset.val, 10);
        if (val && api.gdriveSetMaxCache) {
          api.gdriveSetMaxCache(val).then((st) => {
            S.gdrive = st;
            toast(`${tt('folder.cacheLimitToast') || 'Kapasitas smart cache diatur ke'} ${val} ${tt('folder.songsIndexed') || 'lagu'}`);
            render();
          });
        }
        break;
      }
      case 'gdrive-sync': {
        const progEl = $('#gdrive-sync-progress');
        if (progEl) { progEl.style.display = 'block'; progEl.textContent = tt('folder.syncing') || 'Menyinkronkan pustaka Google Drive...'; }
        if (api.gdriveSync) {
          api.gdriveSync().then(async (res) => {
            if (res && res.ok) {
              toast(`${tt('folder.syncDone') || 'Sinkronisasi selesai'}: ${res.tracksCount} ${tt('folder.songsIndexed') || 'lagu'}`);
              if (api.gdriveStatus) S.gdrive = await api.gdriveStatus();
              const { tracks } = await api.loadLibrary();
              setTracks(tracks);
              render();
            } else {
              toast(`${tt('folder.syncFailed') || 'Gagal menyinkronkan'}: ${(res ? res.error : '')}`);
              if (progEl) progEl.style.display = 'none';
            }
          });
        }
        break;
      }
      case 'gdrive-open-cache': if (api.gdriveOpenFolder) api.gdriveOpenFolder('cache'); break;
      case 'gdrive-open-covers': if (api.gdriveOpenFolder) api.gdriveOpenFolder('covers'); break;
      case 'gdrive-clear-cache': {
        const count = (S.gdrive && S.gdrive.cachedCount) || 50;
        if (confirm(tt('folder.confirmClearCache') || `Kosongkan ${count} file cache lagu offline? Lagu akan distream ulang dan dicache otomatis saat diputar.`)) {
          if (api.gdriveClearCache) {
            api.gdriveClearCache().then(async () => {
              toast(tt('folder.cacheClearedToast') || 'Cache lagu offline telah dikosongkan');
              if (api.gdriveStatus) S.gdrive = await api.gdriveStatus();
              render();
            });
          }
        }
        break;
      }
      case 'sel-play': startQueue([...S.selected], 0); break;
      case 'sel-next': enqueue([...S.selected], true); break;
      case 'sel-queue': enqueue([...S.selected], false); break;
      case 'sel-edit': RD.openEditor([...S.selected]); break;
      case 'sel-clear': S.selected.clear(); refreshSelection(); break;
      case 'play-playlist': { e.stopPropagation(); const p = RD.playlists && RD.playlists.byId(el.dataset.pl); if (p) startQueue(p.trackIds.filter((id) => S.byId.has(id)), 0); break; }
      case 'add-to-playlist': { e.stopPropagation(); const id = rowEl.dataset.id; const ids = S.selected.has(id) ? [...S.selected] : [id]; if (RD.playlists) RD.playlists.openPicker(ids); break; }
      case 'remove-from-playlist': { e.stopPropagation(); const id = rowEl.dataset.id; api.removeFromPlaylist(S.view.key, id).then(() => { if (RD.playlists) RD.playlists.refresh().then(render); else render(); }); break; }
      case 'new-playlist': { if (RD.playlists) RD.playlists.createNew().then((id) => id && go('playlist', id)); break; }
      case 'edit-playlist-cover': setPlaylistCover(S.view.key); break;
      case 'clear-playlist-cover': clearPlaylistCover(S.view.key); break;
      case 'rename-playlist': renamePlaylistFlow(S.view.key); break;
      case 'delete-playlist': deletePlaylistFlow(S.view.key); break;
      case 'open-quality-drawer': openDrawer('quality'); break;
      case 'open-wrapped': if (RD.wrapped) RD.wrapped.open(); break;
      case 'play-track-id': { e.stopPropagation(); if (el.dataset.id) startQueue([el.dataset.id], 0); break; }
      default: break;
    }
  }

  function bindChrome() {
    $$('#nav button, .nav-foot[data-view]').forEach((b) => b.addEventListener('click', () => nav(b.dataset.view)));
    $('#btn-back').addEventListener('click', back);
    $('#btn-scan').addEventListener('click', () => (S.settings.folders.length ? rescan() : addFolder()));
    if (api.winMinimize) $('#win-min').addEventListener('click', () => api.winMinimize());
    if (api.winClose) $('#win-close').addEventListener('click', () => api.winClose());

    let st;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(st);
      st = setTimeout(() => {
        S.query = e.target.value;
        if (S.query && !['albums', 'artists', 'songs', 'favorites'].includes(S.view.type)) { S.history = []; S.view = { type: 'songs', key: null }; }
        render();
      }, 120);
    });

    $('#btn-play').addEventListener('click', togglePlay);
    $('#btn-next').addEventListener('click', () => next(false));
    $('#btn-prev').addEventListener('click', prev);
    $('#btn-shuffle').addEventListener('click', toggleShuffle);
    $('#btn-repeat').addEventListener('click', toggleRepeat);
    $('#btn-queue').addEventListener('click', () => openDrawer('queue'));
    $('#btn-eq').addEventListener('click', () => openDrawer('eq'));
    $('#btn-settings').addEventListener('click', () => { if (RD.settingsUI) RD.settingsUI.open(); });
    $('#drawer-close').addEventListener('click', closeDrawer);
    $$('.drawer-tabs [role=tab]').forEach((b) => b.addEventListener('click', () => { S.tab = null; openDrawer(b.dataset.tab); }));
    $('#np-fav').addEventListener('click', () => { const t = current(); if (t) toggleFav([t.id]); });
    $('#np-addpl').addEventListener('click', () => { const t = current(); if (t && RD.playlists) RD.playlists.openPicker([t.id]); });

    // ---------- Mode mini & Dynamic Island (satu jendela yang sama, dianimasikan main process) ----------
    function enterMiniMode() {
      const r = $('#btn-mini').getBoundingClientRect();
      const origin = { x: Math.round(window.screenX + r.left + r.width / 2), y: Math.round(window.screenY + r.top + r.height / 2) };
      renderMiniBar();
      document.body.classList.remove('island-mode');
      document.body.classList.add('mini-mode');
      if (api.enterMini) api.enterMini(origin);
    }
    function exitMiniMode() {
      closeMiniMenu();
      document.body.classList.remove('mini-mode', 'island-mode');
      if (api.exitMini) api.exitMini();
    }
    if (api.enterMini) {
      $('#btn-mini').addEventListener('click', enterMiniMode);
    } else {
      $('#btn-mini').hidden = true;
    }
    $('#mb-expand').addEventListener('click', exitMiniMode);
    $('#mb-prev').addEventListener('click', () => prev());
    $('#mb-play').addEventListener('click', () => togglePlay());
    $('#mb-next').addEventListener('click', () => next(true));
    $('#mb-fav').addEventListener('click', () => { const t = current(); if (t) toggleFav([t.id]); });
    if (api.onModeChanging) {
      api.onModeChanging((mode) => {
        document.body.classList.toggle('mini-mode', mode === 'mini');
        document.body.classList.toggle('island-mode', mode === 'island');
        if (mode === 'mini') renderMiniBar();
        if (RD.island && RD.island.syncModeFromMain) RD.island.syncModeFromMain(mode);
      });
    }

    // ---------- Geser jendela (Smart Window Drag) di seluruh area permukaan ----------
    if (api.startWindowDrag && api.stopWindowDrag) {
      let dragArm = false, dragActive = false, downSX = 0, downSY = 0, suppressNextClick = false;
      window.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('input, select, textarea, .rng, .slot, [contenteditable]')) return;
        const inCompact = document.body.classList.contains('island-mode') || document.body.classList.contains('mini-mode');
        const inFullDragZone = e.target.closest('#topbar, #sidebar, #player, .npov-head, .head, .album-head');
        if (!inCompact && !inFullDragZone) return;
        if (!inCompact && e.target.closest('button, a, .album, .row')) return;
        dragArm = true;
        dragActive = false;
        downSX = e.screenX;
        downSY = e.screenY;
      }, true);

      window.addEventListener('mousemove', (e) => {
        if (!dragArm) return;
        if (!dragActive && Math.hypot(e.screenX - downSX, e.screenY - downSY) > 5) {
          dragActive = true;
          document.body.classList.add('is-dragging-win');
          api.startWindowDrag();
        }
      }, true);

      const finishWindowDrag = () => {
        if (!dragArm) return;
        dragArm = false;
        if (dragActive) {
          dragActive = false;
          suppressNextClick = true;
          document.body.classList.remove('is-dragging-win');
          api.stopWindowDrag();
          setTimeout(() => { suppressNextClick = false; }, 120);
        }
      };
      window.addEventListener('mouseup', finishWindowDrag, true);
      window.addEventListener('blur', finishWindowDrag);
      window.addEventListener('click', (e) => {
        if (suppressNextClick) {
          e.stopPropagation();
          e.preventDefault();
          suppressNextClick = false;
        }
      }, true);
    }

    // Menu titik-3 di mode mini — memperbesar TINGGI jendela sungguhan (bukan overlay) supaya
    // tidak ke-crop, lewat main process (win:mini-menu), disinkronkan dengan transisi CSS max-height.
    const mbMenuTrigger = $('#mb-menu-trigger');
    const mbMenuPanel = $('#mb-menu-panel');
    let mbMenuOpen = false, mbMenuCloseTimer = null;
    function openMiniMenu() {
      if (mbMenuOpen) return;
      mbMenuOpen = true;
      if (mbMenuCloseTimer) { clearTimeout(mbMenuCloseTimer); mbMenuCloseTimer = null; }
      if (api.setMiniMenuOpen) api.setMiniMenuOpen(true);
      requestAnimationFrame(() => mbMenuPanel.classList.add('open'));
      mbMenuTrigger.setAttribute('aria-expanded', 'true');
    }
    function closeMiniMenu() {
      if (!mbMenuOpen) return;
      mbMenuOpen = false;
      mbMenuPanel.classList.remove('open');
      mbMenuTrigger.setAttribute('aria-expanded', 'false');
      if (mbMenuCloseTimer) clearTimeout(mbMenuCloseTimer);
      mbMenuCloseTimer = setTimeout(() => {
        if (api.setMiniMenuOpen) api.setMiniMenuOpen(false);
        mbMenuCloseTimer = null;
        if (mbDefaultView && mbPlaylistView) { mbDefaultView.hidden = false; mbPlaylistView.hidden = true; } // balik ke view default untuk kunjungan berikutnya
      }, 200);
    }
    mbMenuTrigger.addEventListener('click', (e) => { e.stopPropagation(); if (mbMenuOpen) closeMiniMenu(); else openMiniMenu(); });
    document.addEventListener('click', (e) => {
      if (mbMenuOpen && !mbMenuPanel.contains(e.target) && !mbMenuTrigger.contains(e.target)) closeMiniMenu();
    });

    // ---- "Tambah ke playlist" di mode mini: checklist ringkas DI DALAM menu titik-3 itu sendiri,
    // bukan dialog besar seperti mode full. Semua tetap muat di tinggi window yang sudah dibesarkan
    // sedikit untuk menu (MINI_MENU_EXTRA di main.js), jadi tidak perlu resize tambahan sama sekali.
    const mbDefaultView = $('#mb-menu-default'), mbPlaylistView = $('#mb-menu-playlist'), mbPlpList = $('#mb-plp-list');
    function showMiniMenuView(view) {
      mbDefaultView.hidden = view !== 'default';
      mbPlaylistView.hidden = view !== 'playlist';
    }
    async function renderMiniPlaylistChecklist() {
      const t = current();
      if (!t || !RD.playlists) return;
      await RD.playlists.refresh();
      const all = RD.playlists.all();
      mbPlpList.innerHTML = all.length
        ? all.map((p) => `<label class="mb-plp-row"><input type="checkbox" data-plid="${p.id}"${p.trackIds.includes(t.id) ? ' checked' : ''}><span>${esc(p.name)}</span><small>${p.trackIds.length} lagu</small></label>`).join('')
        : '<p class="mb-plp-empty">Belum ada playlist.</p>';
    }
    async function openMiniPlaylistChecklist() {
      showMiniMenuView('playlist');
      await renderMiniPlaylistChecklist();
    }

    // ---- Volume di mode mini — pakai state & fungsi yang sama dengan slider volume mode full.
    const mbVolume = $('#mb-volume');
    mbVolume.addEventListener('input', () => { S.muted = false; S.settings.volume = mbVolume.value / 100; RD.applyVol(); saveSoon(); });
    $('#mb-mute').addEventListener('click', () => { S.muted = !S.muted; RD.applyVol(); });

    mbMenuPanel.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-menu]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.menu;
      if (action === 'playlist') { openMiniPlaylistChecklist(); return; }
      if (action === 'back') { showMiniMenuView('default'); return; }
      if (action === 'playlist-new') {
        const t = current();
        if (t && RD.playlists) { await RD.playlists.createNew([t.id]); await renderMiniPlaylistChecklist(); }
        return;
      }
      closeMiniMenu();
      if (action === 'shuffle') toggleShuffle();
      else if (action === 'repeat') { S.repeat = S.repeat === 'all' ? 'one' : 'all'; updateModes(); saveSoon(); }
    });
    mbPlpList.addEventListener('change', async (e) => {
      const cb = e.target.closest('input[data-plid]');
      if (!cb) return;
      const t = current();
      if (!t) return;
      if (cb.checked) await api.addToPlaylist(cb.dataset.plid, [t.id]);
      else await api.removeFromPlaylist(cb.dataset.plid, t.id);
    });

    const openNowPlaying = () => { if (current() && RD.nowPlaying) RD.nowPlaying.open(); };
    $('#np-cover').addEventListener('click', openNowPlaying);
    $('#np-title').addEventListener('click', openNowPlaying);
    $('#np-artist').addEventListener('click', openNowPlaying);

    // Seek
    const seek = $('#seek');
    seek.addEventListener('pointerdown', () => { seeking = true; });
    seek.addEventListener('input', () => {
      const d = audio.duration;
      if (d && isFinite(d)) {
        const target = (seek.value / 1000) * d;
        $('#t-cur').textContent = fmt(target);
      }
      seek.style.setProperty('--pct', seek.value / 10 + '%');
    });
    const endSeek = () => {
      if (!seeking) return;
      seeking = false;
      const d = audio.duration;
      if (d && isFinite(d)) {
        const target = (seek.value / 1000) * d;
        audio.currentTime = target;
        $('#t-cur').textContent = fmt(target);
        seek.style.setProperty('--pct', seek.value / 10 + '%');
      }
    };
    seek.addEventListener('pointerup', endSeek);
    seek.addEventListener('change', endSeek);

    // Volume
    const vol = $('#vol');
    const applyVol = () => {
      const v = S.muted ? 0 : S.settings.volume;
      if (engine) engine.setVolume(v); else audio.volume = v;
      setRange(vol, v * 100, 100);
      const icHtml = ic(v === 0 ? 'mute' : v < 0.45 ? 'volumeLow' : 'volume');
      $('#btn-mute').querySelector('[data-ic]').innerHTML = icHtml;
      // Ikut sinkronkan kontrol volume di mode mini, supaya selalu cocok dari mana pun volume diubah.
      const mbVol = $('#mb-volume'), mbMuteBtn = $('#mb-mute');
      if (mbVol) setRange(mbVol, v * 100, 100);
      if (mbMuteBtn) mbMuteBtn.querySelector('[data-ic]').innerHTML = icHtml;
    };
    vol.addEventListener('input', () => { S.muted = false; S.settings.volume = vol.value / 100; applyVol(); saveSoon(); });
    $('#btn-mute').addEventListener('click', () => { S.muted = !S.muted; applyVol(); });
    applyVol.call(null);
    RD.applyVol = applyVol;

    // Audio events
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('playing', () => { S.errStreak = 0; });
    audio.addEventListener('ended', () => next(true));
    audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) $('#t-dur').textContent = fmt(audio.duration); });
    audio.addEventListener('error', () => {
      const t = current();
      S.errStreak++;
      toast(`Tidak bisa memutar “${t ? t.title : 'lagu'}”. Filenya mungkin hilang atau rusak.`, 3800);
      if (S.errStreak < 4 && S.qi < S.queue.length - 1) setTimeout(() => next(false), 500);
      else setPlaying(false);
    });

    // Antrean (drawer maupun panel Antrean di layar Now Playing besar)
    function handleQueueClick(e) {
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'q-rm') {
        const i = +act.closest('.q-item').dataset.qi;
        const [id] = S.queue.splice(i, 1);
        const oi = S.orig.indexOf(id);
        if (oi >= 0) S.orig.splice(oi, 1);
        renderQueue();
        return;
      }
      if (act && act.dataset.act === 'q-clear') {
        S.queue = S.queue.slice(0, S.qi + 1);
        S.orig = S.queue.slice();
        renderQueue();
        return;
      }
      const it = e.target.closest('.q-item');
      if (it && !it.classList.contains('cur')) { S.qi = +it.dataset.qi; loadCurrent(true); }
    }
    $$('#tab-queue, #npt-queue').forEach((el) => el.addEventListener('click', handleQueueClick));

    // Media keys (Windows/macOS/Linux)
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      ms.setActionHandler('play', () => { if (engine) engine.resume(); audio.play().catch(() => {}); });
      ms.setActionHandler('pause', () => audio.pause());
      ms.setActionHandler('previoustrack', prev);
      ms.setActionHandler('nexttrack', () => next(false));
      ms.setActionHandler('seekto', (d) => { if (d.seekTime != null) audio.currentTime = d.seekTime; });
    }

    api.onScanProgress((p) => {
      if (!S.scanning) return; // abaikan laporan yang tiba setelah pemindaian selesai
      $('#scan-status').textContent = `Memindai ${p.done} dari ${p.total}`;
      $('#scan-bar').style.setProperty('--p', (p.total ? (p.done / p.total) * 100 : 0) + '%');
    });

    if (api.gdriveStatus) {
      api.gdriveStatus().then((st) => { S.gdrive = st; });
    }
    if (api.onGdriveProgress) {
      api.onGdriveProgress((p) => {
        const progEl = $('#gdrive-sync-progress');
        if (progEl) {
          progEl.style.display = 'block';
          progEl.textContent = p.text || `Memproses... ${p.current}/${p.total}`;
        }
      });
    }

    // Keyboard
    document.addEventListener('keydown', (e) => {
      const typing = e.target.closest('input, textarea, select, [contenteditable]');
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') {
        if (!menu.hidden) closeMenu();
        else if (S.selected.size) { S.selected.clear(); refreshSelection(); }
        else if ($('#drawer').classList.contains('open')) closeDrawer();
        else if (typing && e.target.id === 'search') { e.target.value = ''; S.query = ''; e.target.blur(); render(); }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); $('#search').focus(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && S.visible.length) { e.preventDefault(); S.selected = new Set(S.visible); refreshSelection(); return; }
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'ArrowRight') { e.preventDefault(); next(false); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        return;
      }
      if (e.shiftKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + (e.key === 'ArrowRight' ? 10 : -10)));
        return;
      }
      if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); togglePlay(); }
      else if (e.key === 'Enter' && S.selected.size && !e.target.closest('button')) startQueue([...S.selected], 0);
    });
  }

  // ============================================================ Mulai
  async function init() {
    $$('[data-ic]').forEach((el) => { el.innerHTML = ic(el.dataset.ic); });
    const { tracks, settings } = await api.loadLibrary();
    settings.sort = settings.sort || { albums: 'title', songs: 'title' };
    settings.eq = settings.eq || {};
    S.settings = settings;
    S.shuffle = !!settings.shuffle;
    S.repeat = settings.repeat || 'off';
    setTracks(tracks);

    RD.startQueue = startQueue;
    RD.playAtQueueIndex = (qi) => {
      if (Number.isFinite(qi) && qi >= 0 && qi < S.queue.length) {
        S.qi = qi;
        loadCurrent(true);
      }
    };
    RD.togglePlay = togglePlay;
    RD.next = next;
    RD.prev = prev;
    RD.pause = () => { if (audio && !audio.paused) audio.pause(); };
    RD.play = () => { if (audio && audio.paused) audio.play().catch(() => {}); };
    RD.current = current;
    RD.rescan = rescan;
    RD.render = render;
    RD.nav = nav;
    RD.syncShortcutTooltips = (sc) => {
      const s = sc || (S.settings && S.settings.shortcuts) || {};
      const islKey = s.toggleIsland ? ` (${s.toggleIsland.replace(/CommandOrControl/g, 'Ctrl')})` : '';
      const miniKey = s.toggleMini ? ` (${s.toggleMini.replace(/CommandOrControl/g, 'Ctrl')})` : '';
      const btnIsl = $('#btn-island');
      if (btnIsl) btnIsl.title = `Dynamic Island${islKey}`;
      const mbIsl = $('#mb-to-island');
      if (mbIsl) mbIsl.title = `Dynamic Island${islKey}`;
      const btnMini = $('#btn-mini');
      if (btnMini) btnMini.title = `Mode mini${miniKey}`;
    };

    if (api.onShortcutAction) {
      api.onShortcutAction((act) => {
        if (act === 'play-pause') togglePlay();
        else if (act === 'next') next();
        else if (act === 'prev') prev();
      });
    }

    bindContent();
    bindChrome();
    RD.syncShortcutTooltips(S.settings.shortcuts);
    RD.eq.init({ engine, settings, saveSoon });
    if (RD.playlists) await RD.playlists.init();
    if (RD.nowPlaying) RD.nowPlaying.init();
    if (RD.lyrics) RD.lyrics.init();
    if (RD.sleepTimer) RD.sleepTimer.init();
    if (RD.stats) await RD.stats.init();
    if (RD.visualizer) RD.visualizer.init();
    if (RD.outputDevice) RD.outputDevice.init();
    if (RD.youtube) RD.youtube.init();
    if (RD.remote) RD.remote.init();
    if (RD.support) RD.support.init();
    if (RD.island) RD.island.init();
    if (RD.i18n) {
      if (settings.lang) RD.i18n.setLang(settings.lang);
      else RD.i18n.apply();
    }
    updateModes();
    setPlaying(false);
    updateNowPlaying();
    render();
    if (S.settings.folders.length) rescan({ quiet: true });
  }

  init().catch((err) => { window.__err = err.stack; console.error(err.stack); toast('Gagal memulai aplikasi: ' + err.message, 8000); });
})();
