'use strict';
/* Halaman "Support Us" — Dukungan Saweria & GitHub Open Source */
(function () {
  const RD = window.RD;
  const { $, esc, toast } = RD;
  const api = window.api;

  const SAWERIA_URL = 'https://saweria.co/alfaathhh';
  const GITHUB_URL = 'https://github.com/senioralfath1-ux/Armuse-1.0.3';
  const GITHUB_ISSUES_URL = 'https://github.com/senioralfath1-ux/Armuse-1.0.3/issues';
  const AUTHOR_NAME = 'Alfath';
  const APP_VERSION = '1.0.3';

  const tt = (key, fallback, params) => {
    if (!RD.i18n) return fallback || key;
    let text = RD.i18n.t(key, params);
    return text === key ? (fallback || key) : text;
  };

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
    if (toast) toast(successMsg || tt('support.toast.copied', 'Tautan berhasil disalin'));
  }

  function renderView() {
    return `
      <div class="support-page">
        <!-- Hero Header -->
        <header class="support-hero">
          <div class="support-hero-brand">
            <img class="support-hero-logo" src="icon.png" alt="Armuse" width="64" height="64">
            <div class="support-hero-meta">
              <div class="support-hero-title-row">
                <h1>Armuse</h1>
                <span class="support-chip support-chip-ver">v${esc(APP_VERSION)}</span>
                <span class="support-chip support-chip-license">MIT Open Source</span>
              </div>
              <p class="support-hero-sub">
                ${esc(tt('support.hero.sub', 'Pemutar musik audiophile bebas iklan untuk koleksi lagu pribadi Anda.'))}
              </p>
              <p class="support-hero-author">
                ${esc(tt('support.hero.by', 'Dikembangkan secara mandiri dengan penuh cinta oleh'))} <strong>${esc(AUTHOR_NAME)}</strong>
              </p>
            </div>
          </div>
        </header>

        <!-- Main Cards (Saweria & GitHub) -->
        <div class="support-sections">
          <!-- Card Saweria -->
          <section class="support-card support-card-saweria">
            <div class="support-card-head">
              <div class="support-card-badge-icon">☕</div>
              <div class="support-card-head-text">
                <h2>${esc(tt('support.saweria.title', 'Dukungan via Saweria'))}</h2>
                <p>${esc(tt('support.saweria.desc', 'Bantu pengembangan fitur baru dan traktir kopi kreator.'))}</p>
              </div>
            </div>

            <p class="support-card-body-text">
              ${esc(tt('support.saweria.longText', 'Armuse sepenuhnya gratis, tanpa langganan, tanpa iklan, dan tidak melacak data Anda. Jika aplikasi ini membantu Anda menikmati musik setiap hari, dukungan Anda melalui Saweria sangat berarti untuk kelangsungan proyek ini.'))}
            </p>

            <div class="support-url-row">
              <div class="support-url-box">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <span class="support-url-text">${esc(SAWERIA_URL)}</span>
              </div>
              <button type="button" class="btn-ghost support-btn-copy" data-support-act="copy-saweria" title="Salin tautan Saweria">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>${esc(tt('support.btn.copy', 'Salin Tautan'))}</span>
              </button>
            </div>

            <div class="support-card-actions">
              <button type="button" class="btn-primary support-btn-saweria-open" data-support-act="open-saweria">
                <span>☕ ${esc(tt('support.saweria.btnOpen', 'Buka Saweria (saweria.co/alfaathhh)'))}</span>
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </button>
            </div>
          </section>

          <!-- Card GitHub & Community -->
          <section class="support-card support-card-github">
            <div class="support-card-head">
              <div class="support-card-badge-icon">★</div>
              <div class="support-card-head-text">
                <h2>${esc(tt('support.github.title', 'Dukungan Komunitas & GitHub'))}</h2>
                <p>${esc(tt('support.github.desc', 'Dukungan gratis: beri bintang atau bantu laporkan saran dan bug.'))}</p>
              </div>
            </div>

            <p class="support-card-body-text">
              ${esc(tt('support.github.longText', 'Armuse dirilis sebagai proyek open source di GitHub. Memberikan Star atau membagikan Armuse ke teman-teman pecinta musik adalah bentuk dukungan yang sangat berharga bagi komunitas.'))}
            </p>

            <div class="support-github-actions">
              <button type="button" class="btn-ghost support-btn-gh" data-support-act="open-github">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>${esc(tt('support.github.btnStar', 'Beri Star di GitHub'))}</span>
              </button>

              <button type="button" class="btn-ghost support-btn-gh" data-support-act="open-issues">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>${esc(tt('support.github.btnIssues', 'Laporkan Masalah / Fitur'))}</span>
              </button>

              <button type="button" class="btn-ghost support-btn-gh" data-support-act="copy-github">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span>${esc(tt('support.github.btnCopyRepo', 'Salin Link Repo'))}</span>
              </button>
            </div>
          </section>
        </div>

        <!-- Pillars / Guarantees -->
        <div class="support-pillars">
          <div class="support-pillar-item">
            <div class="support-pillar-bullet">✓</div>
            <div class="support-pillar-content">
              <h3>${esc(tt('support.pillar1.title', '100% Gratis & Bebas Iklan'))}</h3>
              <p>${esc(tt('support.pillar1.desc', 'Tidak ada langganan berbayar, tidak ada banner promosi, dan tidak ada fitur yang dikunci.'))}</p>
            </div>
          </div>

          <div class="support-pillar-item">
            <div class="support-pillar-bullet">✓</div>
            <div class="support-pillar-content">
              <h3>${esc(tt('support.pillar2.title', 'Privasi & Offline Penuh'))}</h3>
              <p>${esc(tt('support.pillar2.desc', 'Seluruh lagu dan pustaka Anda tetap tersimpan di perangkat lokal tanpa analitik data rahasia.'))}</p>
            </div>
          </div>

          <div class="support-pillar-item">
            <div class="support-pillar-bullet">✓</div>
            <div class="support-pillar-content">
              <h3>${esc(tt('support.pillar3.title', 'Kode Terbuka (Open Source)'))}</h3>
              <p>${esc(tt('support.pillar3.desc', 'Dapat diaudit, dipelajari, dan dikembangkan bersama secara terbuka di bawah Lisensi MIT.'))}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function settingsBlockHtml() {
    return `
      <section class="settings-block support-settings-block">
        <div class="sc-head">
          <div>
            <h3>${esc(tt('support.settings.title', 'Dukung Pengembangan Armuse'))}</h3>
            <p class="sc-sub">${esc(tt('support.settings.desc', 'Armuse 100% gratis & open-source oleh ' + AUTHOR_NAME + '.'))}</p>
          </div>
        </div>
        <div class="support-settings-actions">
          <button type="button" class="btn-primary support-settings-btn" data-support-act="open-saweria">
            <span>☕ ${esc(tt('support.saweria.openBtnShort', 'Saweria (saweria.co/alfaathhh)'))}</span>
          </button>
          <button type="button" class="btn-quiet support-settings-btn" data-support-act="open-github">
            <svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11.05 11.05 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/></svg>
            <span>GitHub</span>
          </button>
          <button type="button" class="btn-quiet support-settings-btn" data-support-act="go-support-view">
            <span>${esc(tt('support.settings.viewPage', 'Lihat Halaman Support Us'))}</span>
          </button>
        </div>
      </section>`;
  }

  function bindEvents(root = document) {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-support-act]');
      if (!btn) return;
      const act = btn.dataset.supportAct;
      if (act === 'open-saweria') {
        openLink(SAWERIA_URL);
      } else if (act === 'copy-saweria') {
        copyText(SAWERIA_URL, tt('support.toast.saweriaCopied', 'Tautan Saweria berhasil disalin'));
      } else if (act === 'open-github') {
        openLink(GITHUB_URL);
      } else if (act === 'open-issues') {
        openLink(GITHUB_ISSUES_URL);
      } else if (act === 'copy-github') {
        copyText(GITHUB_URL, tt('support.toast.githubCopied', 'Tautan repositori GitHub berhasil disalin'));
      } else if (act === 'go-support-view') {
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
    settingsBlockHtml,
    openLink,
    init() {
      bindEvents();
    },
  };
})();
