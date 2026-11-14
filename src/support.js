'use strict';
/* Halaman & Modal "Support Me" — QRIS DANA Langsung & Saweria */
(function () {
  const RD = window.RD;
  const { $, esc, toast } = RD;
  const api = window.api;

  const SAWERIA_URL = 'https://saweria.co/alfaathhh';
  const GITHUB_URL = 'https://github.com/senioralfath1-ux/Armuse-1.0.3';
  const GITHUB_ISSUES_URL = 'https://github.com/senioralfath1-ux/Armuse-1.0.3/issues';
  const AUTHOR_NAME = 'Alfath';
  const APP_VERSION = '1.0.3';

  function openLink(url) {
    if (!url) return;
    if (api && api.openExternal) {
      api.openExternal(url).catch(() => {});
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async function copyText(text, successMsg) {
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
    if (toast) toast(successMsg || 'Tautan berhasil disalin');
  }

  function renderView() {
    return `
      <div class="support-page">
        <!-- Header Ringkas -->
        <header class="support-head-simple">
          <div class="support-head-left">
            <img class="support-logo" src="icon.png" alt="Armuse" width="46" height="46">
            <div>
              <div class="support-title-row">
                <h1>Armuse Support</h1>
                <span class="support-badge">v${esc(APP_VERSION)}</span>
                <span class="support-badge support-badge-mit">MIT</span>
              </div>
              <p class="support-sub">Dukungan & donasi langsung untuk pengembang: <strong>${esc(AUTHOR_NAME)}</strong></p>
            </div>
          </div>
        </header>

        <!-- Dual Equal Boxes: QRIS DANA (Kiri) & Saweria / GitHub (Kanan) -->
        <div class="support-dialog-grid">
          <!-- Box Kiri: QRIS DANA -->
          <div class="support-box support-box-qris">
            <div class="support-box-head">
              <span class="support-box-icon">💳</span>
              <div class="support-box-titles">
                <h3>QRIS / DANA</h3>
                <p>Scan langsung dari HP (DANA, BCA, GoPay, OVO, ShopeePay, dll.)</p>
              </div>
            </div>

            <div class="support-qris-frame">
              <img class="support-qris-img" src="qris-dana.png" alt="QRIS DANA ${esc(AUTHOR_NAME)}" width="175" height="175">
            </div>

            <div class="support-box-foot">
              <span class="support-dot-live"></span>
              <span>QRIS DANA Siap Dipindai</span>
            </div>
          </div>

          <!-- Box Kanan: Saweria & Web -->
          <div class="support-box support-box-saweria">
            <div class="support-box-head">
              <span class="support-box-icon">☕</span>
              <div class="support-box-titles">
                <h3>Saweria Online</h3>
                <p>Dukungan via kartu / e-wallet di web Saweria</p>
              </div>
            </div>

            <div class="support-saweria-body">
              <div class="support-url-row">
                <div class="support-url-box">
                  <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  <span class="support-url-text">${esc(SAWERIA_URL)}</span>
                </div>
                <button type="button" class="btn-ghost support-btn-copy-inline" data-support-act="copy-saweria" title="Salin Tautan Saweria">
                  <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span>Salin</span>
                </button>
              </div>

              <button type="button" class="btn-primary support-btn-cta" data-support-act="open-saweria">
                <span>☕ Buka Saweria</span>
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </button>
            </div>

            <div class="support-box-foot support-box-foot-gh">
              <button type="button" class="btn-ghost support-btn-gh-full" data-support-act="open-github">
                <svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.05 11.05 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
                <span>Star on GitHub</span>
              </button>
              <button type="button" class="btn-ghost support-btn-gh-full" data-support-act="open-issues">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>Laporkan Isu</span>
              </button>
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
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <h2 id="support-dlg-h">Support Me</h2>
          <span class="support-badge">QRIS & Saweria</span>
        </div>
        <button type="button" class="icon-btn support-dlg-close" data-support-act="close-modal" aria-label="Tutup">
          <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="dlg-body support-dlg-body">
        <div class="support-dialog-grid">
          <!-- Box Kiri: QRIS DANA -->
          <div class="support-box support-box-qris">
            <div class="support-box-head">
              <span class="support-box-icon">💳</span>
              <div class="support-box-titles">
                <h3>QRIS / DANA</h3>
                <p>Scan via DANA, BCA, OVO, GoPay, dll.</p>
              </div>
            </div>

            <div class="support-qris-frame">
              <img class="support-qris-img" src="qris-dana.png" alt="QRIS DANA" width="160" height="160">
            </div>

            <div class="support-box-foot">
              <span class="support-dot-live"></span>
              <span>Siap Dipindai dari HP</span>
            </div>
          </div>

          <!-- Box Kanan: Saweria -->
          <div class="support-box support-box-saweria">
            <div class="support-box-head">
              <span class="support-box-icon">☕</span>
              <div class="support-box-titles">
                <h3>Saweria Online</h3>
                <p>saweria.co/alfaathhh</p>
              </div>
            </div>

            <div class="support-saweria-body">
              <button type="button" class="btn-primary support-btn-cta" data-support-act="open-saweria">
                <span>☕ Buka Saweria</span>
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </button>

              <button type="button" class="btn-ghost support-btn-copy-full" data-support-act="copy-saweria">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>Salin Tautan Saweria</span>
              </button>
            </div>

            <div class="support-box-foot support-box-foot-gh">
              <button type="button" class="btn-ghost support-btn-gh-full" data-support-act="open-github">
                <svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.05 11.05 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
                <span>Star on GitHub</span>
              </button>
            </div>
          </div>
        </div>

        <div class="support-dialog-foot">
          <button type="button" class="btn-quiet support-foot-link" data-support-act="go-support-view">
            <span>Buka Halaman Support Lengkap →</span>
          </button>
        </div>
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
            <h3>Dukung Kreator (Saweria & QRIS DANA)</h3>
            <p class="sc-sub">Armuse 100% gratis & open-source oleh ${esc(AUTHOR_NAME)}.</p>
          </div>
        </div>
        <div class="support-settings-actions">
          <button type="button" class="btn-primary support-settings-btn" data-support-act="open-saweria">
            <span>☕ Saweria</span>
          </button>
          <button type="button" class="btn-quiet support-settings-btn" data-support-act="topbar-support">
            <span>💳 QRIS DANA</span>
          </button>
          <button type="button" class="btn-quiet support-settings-btn" data-support-act="go-support-view">
            <span>Halaman Support</span>
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
      if (act === 'topbar-support' || act === 'open-modal') {
        openModal();
      } else if (act === 'close-modal') {
        closeModal();
      } else if (act === 'open-saweria') {
        openLink(SAWERIA_URL);
      } else if (act === 'copy-saweria') {
        copyText(SAWERIA_URL, 'Tautan Saweria berhasil disalin');
      } else if (act === 'open-github') {
        openLink(GITHUB_URL);
      } else if (act === 'open-issues') {
        openLink(GITHUB_ISSUES_URL);
      } else if (act === 'copy-github') {
        copyText(GITHUB_URL, 'Tautan repositori GitHub berhasil disalin');
      } else if (act === 'go-support-view') {
        closeModal();
        const sDlg = $('#settings');
        if (sDlg && sDlg.open) sDlg.close();
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
