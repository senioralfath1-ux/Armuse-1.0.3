'use strict';
/* Panel Remote Hub: Menghubungkan Armuse Desktop ke iPhone / Smartphone via Web Companion PWA */
(function () {
  const RD = window.RD;
  const { $, $$, esc, ic, toast } = RD;
  const api = window.api;

  const tt = (key, params) => (RD.i18n ? RD.i18n.t(key, params) : key);

  let state = {
    running: false,
    port: 4000,
    primaryUrl: '',
    ips: [],
    qrSvg: '',
    loading: false,
  };

  async function fetchStatus() {
    if (!api || !api.remoteStatus) return;
    try {
      state.loading = true;
      const res = await api.remoteStatus();
      if (res) {
        state.running = res.running;
        state.port = res.port;
        state.primaryUrl = res.primaryUrl;
        state.ips = res.ips || [];
        state.qrSvg = res.qrSvg || '';
      }
    } catch (e) {
      console.error('[Remote] Gagal mengambil status:', e);
    } finally {
      state.loading = false;
      renderContent();
    }
  }

  async function toggleServer() {
    if (!api || !api.remoteToggle) return;
    try {
      state.loading = true;
      renderContent();
      const res = await api.remoteToggle();
      if (res) {
        state.running = res.running;
        state.port = res.port;
        state.primaryUrl = res.primaryUrl;
        state.ips = res.ips || [];
        state.qrSvg = res.qrSvg || '';
        toast(state.running ? tt('remote.toast.serverStarted') : tt('remote.toast.serverStopped'));
      }
    } catch (e) {
      toast(tt('remote.toast.serverFailed') + e.message);
    } finally {
      state.loading = false;
      renderContent();
    }
  }

  function renderView() {
    const isOnline = state.running;
    const url = state.primaryUrl || (state.ips && state.ips[0] ? state.ips[0].url : 'http://localhost:4000');

    return `
      <div class="remote-container">
        <header class="view-head">
          <div class="title">
            <h1>${esc(tt('remote.title'))}</h1>
            <p class="sub">${esc(tt('remote.desc'))}</p>
          </div>
        </header>

        <div class="remote-grid">
          <!-- Kolom Kiri: Status & Akses Server -->
          <div class="remote-card remote-hero-card">
            <div class="remote-status-banner ${isOnline ? 'online' : 'offline'}">
              <span class="status-dot"></span>
              <div class="status-banner-text">
                <b>${esc(isOnline ? tt('remote.status.online') : tt('remote.status.offline'))}</b>
                <small>${esc(isOnline ? tt('remote.status.onlineDesc', { port: state.port }) : tt('remote.status.offlineDesc'))}</small>
              </div>
            </div>

            <div class="remote-qr-box">
              ${state.qrSvg ? `
                <div class="remote-qr-wrapper">
                  ${state.qrSvg}
                </div>
              ` : `
                <div class="remote-qr-ph">
                  ${ic('smartphone')}
                  <span>${esc(tt('remote.qr.loading'))}</span>
                </div>
              `}
              <div class="remote-qr-caption">
                <div class="scan-hint-badge">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>${esc(tt('remote.qr.badge'))}</span>
                </div>
                <p>${esc(tt('remote.qr.hint'))}</p>
              </div>
            </div>

            <div class="remote-url-group">
              <div class="remote-url-head">
                <label class="remote-label">${esc(tt('remote.url.label'))}</label>
                <div class="remote-url-actions">
                  <button type="button" class="btn-url-act" data-remote-act="copy" title="${esc(tt('remote.url.copyTitle'))}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>${esc(tt('remote.url.copy'))}</span>
                  </button>
                  <button type="button" class="btn-url-act" data-remote-act="open" title="${esc(tt('remote.url.openTitle'))}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    <span>${esc(tt('remote.url.open'))}</span>
                  </button>
                </div>
              </div>
              <div class="remote-url-field-wrap">
                <svg class="url-globe-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                <input type="text" class="remote-url-input" value="${esc(url)}" readonly id="remote-url-val" spellcheck="false">
              </div>
              <small style="display:block; margin-top:7px; color:var(--text-muted, #94a3b8); font-size:11px; line-height:1.4;">
                💡 <b>${esc(tt('remote.url.mdnsTitle'))}</b> <code style="color:var(--accent, #22c55e); background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px;">http://al.local:4000</code> ${esc(tt('remote.url.mdnsNote'))}
              </small>
            </div>

            <div class="remote-actions-row">
              <button type="button" class="btn-ghost remote-btn-half" data-remote-act="refresh">
                <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                <span>${esc(tt('remote.btn.refresh'))}</span>
              </button>
              <button type="button" class="${isOnline ? 'btn-ghost btn-danger-subtle' : 'btn-primary'} remote-btn-half" data-remote-act="toggle">
                ${isOnline ? `
                  <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>
                  <span>${esc(tt('remote.btn.stopServer'))}</span>
                ` : `
                  <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>${esc(tt('remote.btn.startServer'))}</span>
                `}
              </button>
            </div>
          </div>

          <!-- Kolom Kanan: Panduan PWA & Keunggulan -->
          <div class="remote-card remote-guide-card">
            <div class="guide-header-wrap">
              <div class="guide-title-box">
                <h2 class="remote-sec-title">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                  ${esc(tt('remote.guide.title'))}
                </h2>
                <p class="guide-subtitle">${esc(tt('remote.guide.subtitle'))}</p>
              </div>
            </div>

            <div class="remote-steps">
              <div class="remote-step">
                <span class="step-num">1</span>
                <div class="step-content">
                  <b>${esc(tt('remote.step1.title'))}</b>
                  <p>${esc(tt('remote.step1.desc'))}</p>
                </div>
              </div>
              <div class="remote-step">
                <span class="step-num">2</span>
                <div class="step-content">
                  <b>${esc(tt('remote.step2.title'))}</b>
                  <p>${esc(tt('remote.step2.desc'))}</p>
                </div>
              </div>
              <div class="remote-step">
                <span class="step-num">3</span>
                <div class="step-content">
                  <b>${esc(tt('remote.step3.title'))}</b>
                  <p>${tt('remote.step3.desc')}</p>
                </div>
              </div>
              <div class="remote-step">
                <span class="step-num">4</span>
                <div class="step-content">
                  <b>${esc(tt('remote.step4.title'))}</b>
                  <p>${esc(tt('remote.step4.desc'))}</p>
                </div>
              </div>
            </div>

            <div class="remote-tips-card">
              <div class="tips-card-head">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span>${esc(tt('remote.tips.title'))}</span>
              </div>
              <div class="tips-grid">
                <div class="tip-col">
                  <b>${esc(tt('remote.tips.bgAudio'))}</b>
                  <p>${esc(tt('remote.tips.bgAudioDesc'))}</p>
                </div>
                <div class="tip-col">
                  <b>${esc(tt('remote.tips.offline'))}</b>
                  <p>${esc(tt('remote.tips.offlineDesc'))}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderContent() {
    if (RD.S && RD.S.view && RD.S.view.type === 'remote') {
      if (RD.render) RD.render(true);
    }
  }

  function bindEvents(root = document) {
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-remote-act]');
      if (!btn) return;
      const act = btn.dataset.remoteAct;

      if (act === 'copy') {
        const input = $('#remote-url-val');
        if (input) {
          try {
            await navigator.clipboard.writeText(input.value);
            toast(tt('remote.toast.copied'));
          } catch (_) {
            input.select();
            document.execCommand('copy');
            toast(tt('remote.toast.copied'));
          }
        }
      } else if (act === 'open') {
        const u = state.primaryUrl;
        if (u && api && api.openExternal) api.openExternal(u);
        else if (u) window.open(u, '_blank');
      } else if (act === 'refresh') {
        fetchStatus();
        toast(tt('remote.toast.refreshed'));
      } else if (act === 'toggle') {
        toggleServer();
      }
    });
  }

  RD.remote = {
    render: renderView,
    init() {
      fetchStatus();
      bindEvents();
    },
  };
})();
