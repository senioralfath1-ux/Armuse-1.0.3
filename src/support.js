'use strict';
/* Panel & Dialog "Support Us" (Dukung Kreator) — Saweria & Open Source GitHub */
(function () {
  const RD = window.RD;
  const { $, esc, toast } = RD;
  const api = window.api;

  const SAWERIA_URL = 'https://saweria.co/alfaathhh';
  const GITHUB_URL = 'https://github.com/senioralfath1-ux/Armuse-1.0.3';
  const AUTHOR_NAME = 'Alfath';
  const APP_VERSION = '1.0.3';

  // QR SVG statis untuk https://saweria.co/alfaathhh (sepenuhnya offline, tanpa request luar)
  const SAWERIA_QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 31 31" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h31v31H0z"/><path stroke="#000000" d="M1 1.5h7m1 0h1m1 0h1m1 0h1m5 0h1m3 0h7M1 2.5h1m5 0h1m2 0h1m2 0h1m3 0h1m1 0h3m1 0h1m5 0h1M1 3.5h1m1 0h3m1 0h1m2 0h1m1 0h1m1 0h1m1 0h6m1 0h1m1 0h3m1 0h1M1 4.5h1m1 0h3m1 0h1m1 0h2m1 0h1m2 0h3m1 0h1m3 0h1m1 0h3m1 0h1M1 5.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h2m1 0h1m1 0h1m3 0h1m1 0h3m1 0h1M1 6.5h1m5 0h1m1 0h4m1 0h3m2 0h3m1 0h1m5 0h1M1 7.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M9 8.5h4m2 0h1m2 0h2m1 0h1M1 9.5h1m3 0h1m1 0h4m1 0h1m1 0h5m2 0h6m2 0h1M3 10.5h1m2 0h1m1 0h6m8 0h8M2 11.5h9m3 0h3m1 0h2m1 0h3m5 0h1M9 12.5h1m1 0h1m1 0h2m1 0h3m3 0h1m3 0h1m1 0h2M2 13.5h2m3 0h1m2 0h5m3 0h1m1 0h3m5 0h1M1 14.5h1m1 0h1m2 0h1m1 0h3m1 0h1m1 0h2m1 0h3m3 0h7M1 15.5h1m1 0h1m1 0h1m1 0h1m2 0h1m1 0h1m4 0h2m2 0h2m2 0h3m1 0h1M1 16.5h2m2 0h1m2 0h1m1 0h2m3 0h1m2 0h1m1 0h2m1 0h1m4 0h2M1 17.5h2m3 0h2m1 0h2m1 0h1m1 0h5m2 0h2m1 0h1m3 0h1M1 18.5h1m1 0h3m4 0h3m5 0h2m1 0h1m1 0h4m1 0h2M3 19.5h1m2 0h3m2 0h1m1 0h4m1 0h1m2 0h3m3 0h1m1 0h1M4 20.5h1m3 0h1m3 0h1m1 0h1m1 0h3m1 0h2m1 0h2m3 0h2M1 21.5h3m1 0h1m1 0h2m1 0h2m1 0h2m3 0h1m2 0h6m2 0h1M9 22.5h2m1 0h4m1 0h5m3 0h1m3 0h1M1 23.5h7m1 0h1m1 0h1m5 0h2m1 0h2m1 0h1m1 0h3m1 0h1M1 24.5h1m5 0h1m3 0h2m2 0h1m2 0h1m1 0h2m3 0h1m2 0h2M1 25.5h1m1 0h3m1 0h1m1 0h1m3 0h5m1 0h8m1 0h2M1 26.5h1m1 0h3m1 0h1m2 0h2m1 0h1m4 0h2m8 0h1M1 27.5h1m1 0h3m1 0h1m2 0h2m1 0h4m2 0h1m2 0h1m3 0h4M1 28.5h1m5 0h1m2 0h5m1 0h2m3 0h1m3 0h2m1 0h2M1 29.5h7m1 0h2m3 0h1m6 0h1m1 0h1m1 0h1m2 0h1"/></svg>';

  const tt = (key, params) => (RD.i18n ? RD.i18n.t(key, params) : key);

  function openLink(url) {
    if (!url) return;
    if (api && api.openExternal) api.openExternal(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copyText(text, msgKey) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_e) {}
      document.body.removeChild(ta);
    }
    if (toast) toast(tt(msgKey || 'support.toast.copied'));
  }

  function renderView() {
    return `
      <div class="remote-container support-container">
        <header class="view-head">
          <div class="title">
            <h1>${esc(tt('support.title'))}</h1>
            <p class="sub">${esc(tt('support.subtitle', { author: AUTHOR_NAME }))}</p>
          </div>
        </header>

        <div class="remote-grid support-grid">
          <!-- Kolom Kiri: Saweria QR & Donasi -->
          <div class="remote-card support-hero-card">
            <div class="support-badge-banner">
              <span class="support-heart-pill">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </span>
              <div class="status-banner-text">
                <b>${esc(tt('support.saweria.bannerTitle'))}</b>
                <small>${esc(tt('support.saweria.bannerSub', { author: AUTHOR_NAME }))}</small>
              </div>
            </div>

            <div class="remote-qr-box support-qr-box">
              <div class="remote-qr-wrapper support-qr-wrapper" data-support-act="open-saweria" title="${esc(tt('support.saweria.openBtn'))}">
                ${SAWERIA_QR_SVG}
              </div>
              <div class="remote-qr-caption">
                <div class="scan-hint-badge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  <span>${esc(tt('support.saweria.qrBadge'))}</span>
                </div>
                <p>${esc(tt('support.saweria.qrHint'))}</p>
              </div>
            </div>

            <div class="remote-url-group">
              <div class="remote-url-head">
                <label class="remote-label">${esc(tt('support.saweria.urlLabel'))}</label>
                <div class="remote-url-actions">
                  <button type="button" class="btn-url-act" data-support-act="copy-saweria">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>${esc(tt('remote.url.copy'))}</span>
                  </button>
                </div>
              </div>
              <div class="remote-url-field-wrap">
                <svg class="url-globe-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <input type="text" class="remote-url-input" value="${esc(SAWERIA_URL)}" readonly id="support-saweria-val" spellcheck="false">
              </div>
            </div>

            <div class="support-actions-stack">
              <button type="button" class="btn-primary support-btn-main" data-support-act="open-saweria">
                <svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span>${esc(tt('support.saweria.openBtn'))}</span>
              </button>
            </div>
          </div>

          <!-- Kolom Kanan: Cerita Proyek, Open Source & Kontribusi -->
          <div class="remote-card support-info-card">
            <div class="guide-header-wrap">
              <div class="guide-title-box">
                <div class="support-creator-row">
                  <img src="icon.png" alt="Armuse" class="support-app-logo" width="44" height="44">
                  <div>
                    <h2 class="remote-sec-title">Armuse <span class="support-ver-chip">v${esc(APP_VERSION)}</span></h2>
                    <p class="guide-subtitle">${esc(tt('support.about.byline', { author: AUTHOR_NAME }))}</p>
                  </div>
                </div>
              </div>
            </div>

            <p class="support-story">${esc(tt('support.about.story'))}</p>

            <div class="remote-steps support-perks">
              <div class="remote-step">
                <span class="step-num">♥</span>
                <div class="step-content">
                  <b>${esc(tt('support.why1.title'))}</b>
                  <p>${esc(tt('support.why1.desc'))}</p>
                </div>
              </div>
              <div class="remote-step">
                <span class="step-num">★</span>
                <div class="step-content">
                  <b>${esc(tt('support.why2.title'))}</b>
                  <p>${esc(tt('support.why2.desc'))}</p>
                </div>
              </div>
              <div class="remote-step">
                <span class="step-num">⚡</span>
                <div class="step-content">
                  <b>${esc(tt('support.why3.title'))}</b>
                  <p>${esc(tt('support.why3.desc'))}</p>
                </div>
              </div>
            </div>

            <div class="remote-tips-card support-github-card">
              <div class="tips-card-head">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.05 11.05 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
                <span>${esc(tt('support.github.title'))}</span>
              </div>
              <p class="support-gh-desc">${esc(tt('support.github.desc'))}</p>
              <div class="remote-actions-row">
                <button type="button" class="btn-ghost remote-btn-half" data-support-act="open-github">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span>${esc(tt('support.github.starBtn'))}</span>
                </button>
                <button type="button" class="btn-ghost remote-btn-half" data-support-act="copy-github">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span>${esc(tt('support.github.copyBtn'))}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderDialogHtml() {
    return `
      <div class="dlg-head support-dlg-head">
        <div class="support-dlg-title-row">
          <span class="support-heart-pill">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          </span>
          <div>
            <h2 id="support-dlg-h">${esc(tt('support.title'))}</h2>
            <p>${esc(tt('support.about.byline', { author: AUTHOR_NAME }))}</p>
          </div>
        </div>
        <button type="button" class="icon-btn" data-support-act="close-modal" aria-label="Tutup">
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="dlg-body support-dlg-body">
        <div class="support-dlg-grid">
          <div class="remote-qr-box support-dlg-qr-col">
            <div class="remote-qr-wrapper support-qr-wrapper" data-support-act="open-saweria" title="${esc(tt('support.saweria.openBtn'))}">
              ${SAWERIA_QR_SVG}
            </div>
            <div class="scan-hint-badge">
              <span>${esc(tt('support.saweria.qrBadge'))}</span>
            </div>
            <code class="support-dlg-url">${esc(SAWERIA_URL)}</code>
          </div>
          <div class="support-dlg-info-col">
            <p class="support-story">${esc(tt('support.about.story'))}</p>
            <div class="support-actions-stack">
              <button type="button" class="btn-primary support-btn-main" data-support-act="open-saweria">
                <svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span>${esc(tt('support.saweria.openBtn'))} (saweria.co/alfaathhh)</span>
              </button>
              <div class="remote-actions-row">
                <button type="button" class="btn-ghost remote-btn-half" data-support-act="copy-saweria">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span>${esc(tt('remote.url.copy'))} Link Saweria</span>
                </button>
                <button type="button" class="btn-ghost remote-btn-half" data-support-act="open-github">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span>${esc(tt('support.github.starBtn'))}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="dlg-foot">
        <button type="button" class="btn-quiet" data-support-act="go-support-view">${esc(tt('support.settings.viewPage'))}</button>
        <span class="spacer"></span>
        <button type="button" class="btn-primary" data-support-act="close-modal">${esc(tt('settings.done'))}</button>
      </div>
    `;
  }

  function openModal() {
    const dlg = $('#support-dlg');
    if (!dlg) {
      if (RD.nav) RD.nav('support');
      return;
    }
    dlg.innerHTML = renderDialogHtml();
    if (!dlg.open) dlg.showModal();
  }

  function closeModal() {
    const dlg = $('#support-dlg');
    if (dlg && dlg.open) dlg.close();
  }

  function settingsBlockHtml() {
    return `
      <section class="settings-block support-settings-block">
        <div class="sc-head">
          <div>
            <h3>${esc(tt('support.settings.title'))}</h3>
            <p class="sc-sub">${esc(tt('support.settings.desc', { author: AUTHOR_NAME }))}</p>
          </div>
        </div>
        <div class="support-settings-actions">
          <button type="button" class="btn-primary support-settings-btn" data-support-act="open-saweria">
            <svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span>${esc(tt('support.saweria.openBtn'))}</span>
          </button>
          <button type="button" class="btn-quiet support-settings-btn" data-support-act="open-github">
            <svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.05 11.05 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
            <span>GitHub Repo</span>
          </button>
          <button type="button" class="btn-quiet support-settings-btn" data-support-act="go-support-view">
            <span>${esc(tt('support.settings.viewPage'))}</span>
          </button>
        </div>
      </section>`;
  }

  function bindEvents(root = document) {
    root.addEventListener('click', (e) => {
      const dlg = $('#support-dlg');
      if (dlg && dlg.open && e.target === dlg) {
        closeModal();
        return;
      }
      const btn = e.target.closest('[data-support-act]');
      if (!btn) return;
      const act = btn.dataset.supportAct;
      if (act === 'open-modal') {
        openModal();
      } else if (act === 'close-modal') {
        closeModal();
      } else if (act === 'open-saweria') {
        openLink(SAWERIA_URL);
      } else if (act === 'copy-saweria') {
        copyText(SAWERIA_URL, 'support.toast.copied');
      } else if (act === 'open-github') {
        openLink(GITHUB_URL);
      } else if (act === 'copy-github') {
        copyText(GITHUB_URL, 'support.toast.copied');
      } else if (act === 'go-support-view') {
        const sDlg = $('#settings');
        if (sDlg && sDlg.open) sDlg.close();
        closeModal();
        if (RD.nav) RD.nav('support');
      }
    });
  }

  RD.support = {
    SAWERIA_URL,
    GITHUB_URL,
    AUTHOR_NAME,
    render: renderView,
    openModal,
    closeModal,
    settingsBlockHtml,
    openLink,
    init() {
      bindEvents();
    },
  };
})();
