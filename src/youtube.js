'use strict';
/* Fitur unduh dan konversi audio YouTube ke pustaka musik lokal */
(function () {
  const RD = window.RD;
  const { $, $$, esc, ic, toast } = RD;
  const api = window.api;

  const tt = (key, params) => (window.RD && RD.i18n ? RD.i18n.t(key, params) : key);

  const FORMATS = [
    { id: 'mp3', label: 'MP3', desc: '320 kbps · Kualitas tinggi & kompatibel', badge: 'Populer' },
    { id: 'flac', label: 'FLAC', desc: 'Lossless · Kualitas studio tanpa kompresi', badge: 'Lossless' },
    { id: 'wav', label: 'WAV', desc: 'PCM tak terkompresi · Format standar master', badge: 'Lossless' },
    { id: 'm4a', label: 'M4A', desc: 'AAC 256 kbps · Kualitas tinggi & efisien', badge: 'AAC' },
    { id: 'opus', label: 'OPUS', desc: '160 kbps · Codec audio modern efisien', badge: 'Modern' },
  ];

  const state = {
    url: '',
    format: 'mp3',
    folder: '',
    info: null,
    loadingInfo: false,
    downloading: false,
    progress: { percent: 0, text: 'Menyiapkan unduhan...', speed: '', eta: '', size: '', stage: '' },
    lastDownloaded: null,
    history: [],
    status: null,
  };

  if (api && api.onYtdlProgress) {
    api.onYtdlProgress((p) => {
      state.progress = {
        percent: p.percent != null ? Math.round(p.percent) : state.progress.percent,
        text: p.text || (p.stage === 'converting' ? `Mengonversi ke ${state.format.toUpperCase()}...` : state.progress.text),
        speed: p.speed || '',
        eta: p.eta || '',
        size: p.size || '',
        stage: p.stage || '',
      };
      updateProgressEl();
    });
  }

  function updateProgressEl() {
    const bar = $('#ytdl-pbar-fill');
    const text = $('#ytdl-pbar-text');
    const meta = $('#ytdl-pbar-meta');
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, state.progress.percent))}%`;
    if (text) text.textContent = state.progress.text;
    if (meta) {
      const parts = [];
      if (state.progress.percent != null) parts.push(`${state.progress.percent}%`);
      if (state.progress.speed) parts.push(state.progress.speed);
      if (state.progress.size) parts.push(state.progress.size);
      if (state.progress.eta) parts.push(`Sisa waktu: ${state.progress.eta}`);
      meta.textContent = parts.join(' · ');
    }
  }

  async function checkStatus() {
    if (api && api.ytdlStatus) {
      try {
        state.status = await api.ytdlStatus();
      } catch (_) {}
    }
  }

  async function fetchInfo(url) {
    if (!url || !url.trim()) {
      toast('Tautan YouTube tidak boleh kosong.');
      return;
    }
    state.loadingInfo = true;
    state.url = url.trim();
    renderContent();
    try {
      const res = await api.ytdlInfo(state.url);
      if (res && res.ok) {
        state.info = res;
      } else {
        toast((res && res.error) || 'Gagal mengambil informasi video YouTube.');
      }
    } catch (e) {
      toast('Gagal memuat info: ' + (e.message || String(e)));
    } finally {
      state.loadingInfo = false;
      renderContent();
    }
  }

  async function startDownload() {
    if (state.downloading) return;
    const urlInput = $('#ytdl-url-input');
    const currentUrl = (urlInput && urlInput.value.trim()) || state.url;
    if (!currentUrl) {
      toast('Tautan YouTube belum dimasukkan.');
      return;
    }
    state.url = currentUrl;

    const folders = (RD.S && RD.S.settings && RD.S.settings.folders) || [];
    let targetFolder = state.folder || folders[0];
    if (!targetFolder && api && api.ytdlDefaultFolder) {
      try { targetFolder = await api.ytdlDefaultFolder(); } catch (_) {}
    }
    if (!targetFolder) {
      toast('Pilih atau tambahkan folder musik tujuan terlebih dahulu.');
      return;
    }
    state.folder = targetFolder;

    state.downloading = true;
    state.progress = { percent: 0, text: 'Memulai unduhan...', speed: '', eta: '', size: '', stage: 'starting' };
    state.lastDownloaded = null;
    renderContent();

    try {
      const res = await api.ytdlDownload({
        url: state.url,
        format: state.format,
        destDir: state.folder,
      });

      if (res && res.ok) {
        toast('Lagu berhasil diunduh dan dikonversi!');
        if (RD.rescan) {
          try { await RD.rescan({ quiet: true }); } catch (_) {}
        }

        let foundTrack = null;
        if (RD.S && RD.S.tracks && res.path) {
          const normPath = res.path.toLowerCase().replace(/\\/g, '/');
          foundTrack = RD.S.tracks.find((t) => t.path.toLowerCase().replace(/\\/g, '/') === normPath);
        }

        const histItem = {
          title: (state.info && state.info.title) || res.filename || 'Audio YouTube',
          channel: (state.info && state.info.channel) || 'YouTube',
          thumbnail: (state.info && state.info.thumbnail) || '',
          format: state.format.toUpperCase(),
          path: res.path,
          trackId: foundTrack ? foundTrack.id : null,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        state.lastDownloaded = histItem;
        state.history.unshift(histItem);

        state.url = '';
        state.info = null;
      } else {
        toast((res && res.error) || 'Pengunduhan gagal.');
      }
    } catch (e) {
      toast('Kesalahan: ' + (e.message || String(e)));
    } finally {
      state.downloading = false;
      renderContent();
    }
  }

  async function cancelDownload() {
    if (!state.downloading) return;
    try {
      if (api && api.ytdlCancel) await api.ytdlCancel();
      toast(tt('youtube.cancelled', 'Pengunduhan dibatalkan.'));
    } catch (_) {}
    state.downloading = false;
    renderContent();
  }

  function renderView() {
    const S = RD.S;
    const folders = (S && S.settings && S.settings.folders) || [];
    if (!state.folder && folders.length) state.folder = folders[0];

    const formatPills = FORMATS.map((f) => `
      <button type="button" class="ytdl-pill ${state.format === f.id ? 'active' : ''}" data-ytdl-format="${f.id}">
        <div class="ytdl-pill-top">
          <span class="ytdl-pill-name">${esc(f.label)}</span>
          <span class="ytdl-pill-badge">${esc(f.badgeKey ? tt(f.badgeKey, f.badge) : f.badge)}</span>
        </div>
        <span class="ytdl-pill-desc">${esc(f.descKey ? tt(f.descKey, f.desc) : f.desc)}</span>
      </button>
    `).join('');

    const folderOptions = folders.length
      ? folders.map((fd) => `<option value="${esc(fd)}" ${state.folder === fd ? 'selected' : ''}>${esc(fd)}</option>`).join('')
      : `<option value="">${esc(tt('youtube.noFolderDefault', '(Belum ada folder - otomatis ke folder Musik standar)'))}</option>`;

    let previewHtml = '';
    if (state.loadingInfo) {
      previewHtml = `
        <div class="ytdl-preview ytdl-preview-loading">
          <div class="ytdl-spinner"></div>
          <span>${esc(tt('youtube.loadingInfo', 'Mengambil informasi video YouTube...'))}</span>
        </div>
      `;
    } else if (state.info) {
      previewHtml = `
        <div class="ytdl-preview">
          <div class="ytdl-thumb-box">
            ${state.info.thumbnail ? `<img src="${esc(state.info.thumbnail)}" alt="${esc(state.info.title)}" class="ytdl-thumb">` : `<div class="ytdl-thumb-ph">${ic('music')}</div>`}
            ${state.info.durationString ? `<span class="ytdl-duration">${esc(state.info.durationString)}</span>` : ''}
          </div>
          <div class="ytdl-preview-meta">
            <h3 class="ytdl-preview-title" title="${esc(state.info.title)}">${esc(state.info.title)}</h3>
            <p class="ytdl-preview-channel">${esc(state.info.channel)}</p>
            <p class="ytdl-preview-fmt">${esc(tt('youtube.conversionFormat', 'Format konversi:'))} <b>${esc(state.format.toUpperCase())}</b></p>
          </div>
        </div>
      `;
    }

    let progressHtml = '';
    if (state.downloading) {
      progressHtml = `
        <div class="ytdl-progress-box">
          <div class="ytdl-pbar-head">
            <span id="ytdl-pbar-text">${esc(state.progress.text)}</span>
            <span id="ytdl-pbar-meta">${state.progress.percent}%</span>
          </div>
          <div class="ytdl-pbar-track">
            <div id="ytdl-pbar-fill" class="ytdl-pbar-fill" style="width:${state.progress.percent}%"></div>
          </div>
          <div class="ytdl-progress-actions">
            <button type="button" class="btn-ghost" data-ytdl-act="cancel">${ic('x')}${esc(tt('youtube.cancel'))}</button>
          </div>
        </div>
      `;
    }

    let successHtml = '';
    if (state.lastDownloaded) {
      const ld = state.lastDownloaded;
      successHtml = `
        <div class="ytdl-success-banner">
          <div class="ytdl-success-info">
            <span class="ytdl-success-icon">${ic('music')}</span>
            <div>
              <b>${esc(ld.title)}</b>
              <small>${esc(tt('youtube.successSaved', { format: ld.format }))}</small>
            </div>
          </div>
          <div class="ytdl-success-actions">
            ${ld.trackId ? `<button type="button" class="btn-primary" data-act="play-track-id" data-id="${esc(ld.trackId)}">${ic('play', 'fill')}${esc(tt('youtube.playNow'))}</button>` : ''}
            ${ld.path ? `<button type="button" class="btn-ghost" data-ytdl-act="reveal" data-path="${esc(ld.path)}">${ic('folder')}${esc(tt('youtube.openFolder'))}</button>` : ''}
          </div>
        </div>
      `;
    }

    const historyRows = state.history.map((h) => `
      <div class="ytdl-hist-row">
        ${h.thumbnail ? `<img src="${esc(h.thumbnail)}" class="ytdl-hist-thumb" alt="">` : `<div class="ytdl-hist-thumb-ph">${ic('music')}</div>`}
        <div class="ytdl-hist-meta">
          <b class="ytdl-hist-title">${esc(h.title)}</b>
          <span class="ytdl-hist-sub">${esc(h.channel)} · <span class="ytdl-tag">${esc(h.format)}</span> · ${esc(h.time)}</span>
        </div>
        <div class="ytdl-hist-actions">
          ${h.trackId ? `<button type="button" class="icon-btn" data-act="play-track-id" data-id="${esc(h.trackId)}" title="${esc(tt('youtube.playNow'))}">${ic('play', 'fill')}</button>` : ''}
          ${h.path ? `<button type="button" class="icon-btn" data-ytdl-act="reveal" data-path="${esc(h.path)}" title="${esc(tt('youtube.openFolder'))}">${ic('folder')}</button>` : ''}
        </div>
      </div>
    `).join('');

    return `
      <div class="ytdl-container">
        <header class="view-head">
          <div class="title">
            <h1>${esc(tt('youtube.title'))}</h1>
            <p class="sub">${esc(tt('youtube.desc'))}</p>
          </div>
        </header>

        ${successHtml}

        <div class="ytdl-card">
          <div class="ytdl-field-group">
            <label class="ytdl-label" for="ytdl-url-input">${esc(tt('youtube.urlLabel'))}</label>
            <div class="ytdl-input-row">
              <input id="ytdl-url-input" type="url" class="ytdl-input" placeholder="${esc(tt('youtube.urlPlaceholder'))}" value="${esc(state.url)}" autocomplete="off" spellcheck="false" ${state.downloading ? 'disabled' : ''}>
              <button type="button" class="btn-ghost" data-ytdl-act="paste" title="${esc(tt('youtube.paste'))}" ${state.downloading ? 'disabled' : ''}>${esc(tt('youtube.paste'))}</button>
              <button type="button" class="btn-ghost" data-ytdl-act="inspect" title="${esc(tt('youtube.inspect'))}" ${state.downloading ? 'disabled' : ''}>${esc(tt('youtube.inspect'))}</button>
            </div>
          </div>

          ${previewHtml}

          <div class="ytdl-field-group">
            <label class="ytdl-label">${esc(tt('youtube.formatLabel'))}</label>
            <div class="ytdl-formats-grid">
              ${formatPills}
            </div>
          </div>

          <div class="ytdl-field-group">
            <label class="ytdl-label" for="ytdl-folder-select">${esc(tt('youtube.folderLabel'))}</label>
            <div class="ytdl-folder-row">
              <select id="ytdl-folder-select" class="ytdl-select" ${state.downloading ? 'disabled' : ''}>
                ${folderOptions}
              </select>
              <button type="button" class="btn-ghost" data-act="add-folder" title="${esc(tt('youtube.folderLabel'))}" ${state.downloading ? 'disabled' : ''}>${ic('folderPlus')}${esc(tt('folder.addLocal', 'Folder Baru'))}</button>
            </div>
            <small class="ytdl-folder-hint">${esc(tt('youtube.desc'))}</small>
          </div>

          ${progressHtml}

          ${!state.downloading ? `
            <div class="ytdl-submit-row">
              <button type="button" class="btn-primary ytdl-download-btn" data-ytdl-act="download">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                ${esc(tt('youtube.dlBtn'))}
              </button>
            </div>
          ` : ''}
        </div>

        ${state.history.length ? `
          <div class="ytdl-history-section">
            <h2>${esc(tt('youtube.historyTitle'))}</h2>
            <div class="ytdl-history-list">
              ${historyRows}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderContent() {
    if (RD.S && RD.S.view && RD.S.view.type === 'youtube') {
      if (RD.render) RD.render(true);
    }
  }

  function bindEvents(root = document) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-ytdl-act]');
      if (btn) {
        const act = btn.dataset.ytdlAct;
        if (act === 'paste') {
          try {
            const text = await navigator.clipboard.readText();
            if (text) {
              const input = $('#ytdl-url-input');
              if (input) input.value = text.trim();
              state.url = text.trim();
              fetchInfo(state.url);
            }
          } catch (_) {
            toast('Tidak dapat mengakses clipboard.');
          }
        } else if (act === 'inspect') {
          const input = $('#ytdl-url-input');
          const val = input ? input.value.trim() : state.url;
          fetchInfo(val);
        } else if (act === 'download') {
          const input = $('#ytdl-url-input');
          if (input) state.url = input.value.trim();
          startDownload();
        } else if (act === 'cancel') {
          cancelDownload();
        } else if (act === 'reveal') {
          const p = btn.dataset.path;
          if (p && api && api.reveal) api.reveal(p);
        }
        return;
      }

      const pill = e.target.closest('[data-ytdl-format]');
      if (pill && !state.downloading) {
        state.format = pill.dataset.ytdlFormat;
        $$('[data-ytdl-format]').forEach((p) => p.classList.toggle('active', p.dataset.ytdlFormat === state.format));
        const fmtLabel = $('.ytdl-preview-fmt b');
        if (fmtLabel) fmtLabel.textContent = state.format.toUpperCase();
      }
    });

    root.addEventListener('change', (e) => {
      const sel = e.target.closest('#ytdl-folder-select');
      if (sel) {
        state.folder = sel.value;
      }
    });

    root.addEventListener('keydown', (e) => {
      if (e.target.id === 'ytdl-url-input' && e.key === 'Enter') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (!state.info || state.url !== val) {
          fetchInfo(val);
        } else {
          startDownload();
        }
      }
    });
  }

  RD.youtube = {
    render: renderView,
    init() {
      checkStatus();
      bindEvents();
    },
  };
})();
