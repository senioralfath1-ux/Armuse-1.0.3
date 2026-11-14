'use strict';
/* Panel Lirik: tab "Auto" (dari LRCLIB + Kugou, dicache lokal) + tab bahasa mandiri
 * (Indonesia / English / 日本語) yang bisa ditempel/diketik sendiri oleh pengguna.
 * Lirik berformat LRC (bertanda waktu) akan disorot baris aktifnya saat lagu diputar,
 * dan setiap baris dapat diklik untuk melompat langsung ke timestamp tersebut (Click-to-Seek). */
(function () {
  const RD = window.RD;
  const { $, esc } = RD;
  const api = window.api;

  const tt = (key, params) => (window.RD && RD.i18n ? RD.i18n.t(key, params) : key);

  const LANGS = [
    { code: 'auto', labelKey: 'lyrics.tabAuto', label: 'Auto' },
    { code: 'id', labelKey: 'lyrics.tabId', label: 'Indonesia' },
    { code: 'en', labelKey: 'lyrics.tabEn', label: 'English' },
    { code: 'ja', labelKey: 'lyrics.tabJa', label: '日本語' },
  ];

  let track = null;
  let autoData = null; // hasil dari lyrics:get untuk tab Auto
  let manualByLang = {};
  let activeLang = 'auto';
  let lrcLines = null; // [{ t, text }] kalau lirik auto bertanda waktu
  let lastLineIdx = -1;

  function parseLrc(text) {
    const lines = [];
    text.split(/\r?\n/).forEach((raw) => {
      const m = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(raw.trim());
      if (!m) return;
      const t = (+m[1]) * 60 + parseFloat(m[2]);
      const txt = m[3].trim();
      if (txt) lines.push({ t, text: txt });
    });
    return lines.length ? lines.sort((a, b) => a.t - b.t) : null;
  }

  function langTabs() {
    const el = $('#lyr-langs');
    if (!el) return;
    el.innerHTML = LANGS.map((l) => {
      const has = l.code === 'auto' ? !!(autoData && autoData.found) : !!manualByLang[l.code];
      const lbl = tt(l.labelKey, l.label);
      return `<button class="lyr-lang${l.code === activeLang ? ' active' : ''}${has ? ' has' : ''}" data-lang="${l.code}">${esc(lbl)}</button>`;
    }).join('');
  }

  function linesHtml(text, synced) {
    if (synced) {
      return lrcLines.map((l, i) =>
        `<p data-i="${i}" class="lyr-line-click" title="${esc(tt('lyrics.jumpTo', 'Klik untuk lompat ke bagian ini'))}">${esc(l.text)}</p>`
      ).join('');
    }
    return (text || '').split(/\r?\n/).map((l) => `<p>${esc(l) || '&nbsp;'}</p>`).join('');
  }

  function renderBody() {
    const el = $('#lyr-body');
    if (!el) return;
    lastLineIdx = -1;
    lrcLines = null;

    if (activeLang === 'auto') {
      if (!autoData || !autoData.found) {
        const msg = autoData && autoData.error
          ? tt('lyrics.failed', 'Gagal mengambil lirik. Periksa koneksi internet.')
          : tt('lyrics.notFound', 'Belum ada lirik untuk lagu ini.');

        el.innerHTML = `
          <div class="lyr-empty">
            <p>${esc(msg)}</p>
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px">
              <button class="btn-primary" id="lyr-fetch">${esc(tt('lyrics.searchOnline', 'Cari lirik online'))}</button>
              <button class="btn-ghost" id="lyr-custom-search">${esc(tt('lyrics.searchCustom', 'Cari dengan judul lain'))}</button>
            </div>
            <div id="lyr-custom-box" style="display:none;margin-top:12px;width:100%;max-width:380px">
              <div style="display:flex;gap:6px">
                <input id="lyr-custom-in" type="text" placeholder="${esc(tt('lyrics.searchPrompt', 'Ketik judul lagu atau artis…'))}" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:13px;outline:none" />
                <button class="btn-primary" id="lyr-custom-go" style="padding:8px 16px">${esc(tt('lyrics.searchBtn', 'Cari'))}</button>
              </div>
            </div>
          </div>`;

        const b = $('#lyr-fetch');
        if (b) b.addEventListener('click', () => fetchOnline());

        const cs = $('#lyr-custom-search');
        if (cs) {
          cs.addEventListener('click', () => {
            const box = $('#lyr-custom-box');
            if (box) {
              const isHidden = box.style.display === 'none';
              box.style.display = isHidden ? 'block' : 'none';
              const input = $('#lyr-custom-in');
              if (input && isHidden) {
                const initial = track ? [track.artist, track.title].filter(Boolean).join(' ') : '';
                input.value = initial;
                input.focus();
                input.select();
              }
            }
          });
        }

        const go = $('#lyr-custom-go');
        if (go) {
          go.addEventListener('click', () => {
            const input = $('#lyr-custom-in');
            const q = input ? input.value.trim() : '';
            if (q) fetchOnline(q);
          });
        }

        const input = $('#lyr-custom-in');
        if (input) {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const q = input.value.trim();
              if (q) fetchOnline(q);
            }
          });
        }
        return;
      }

      if (autoData.instrumental) {
        el.innerHTML = `<div class="lyr-empty"><p>${esc(tt('lyrics.instrumental', 'Lagu ini ditandai instrumental (tanpa lirik).'))}</p></div>`;
        return;
      }

      if (autoData.synced) lrcLines = parseLrc(autoData.synced);
      el.innerHTML = `<div class="lyr-lines${lrcLines ? ' synced' : ''}">${linesHtml(autoData.plain, lrcLines)}</div>`;
    } else {
      const text = manualByLang[activeLang];
      if (!text) {
        const langObj = LANGS.find((l) => l.code === activeLang);
        const label = langObj ? tt(langObj.labelKey, langObj.label) : activeLang;
        el.innerHTML = `<div class="lyr-empty"><p>${esc(tt('lyrics.noManualYet', `Belum ada lirik ${label} untuk lagu ini.`))}</p><button class="btn-primary" data-editnow="1">${esc(tt('lyrics.addManual', 'Tambahkan lirik'))}</button></div>`;
        const b = el.querySelector('[data-editnow]');
        if (b) b.addEventListener('click', openEditor);
        if (RD.island && RD.island.onLyricsTick) RD.island.onLyricsTick(getCurrentLines());
        return;
      }
      el.innerHTML = `<div class="lyr-lines">${linesHtml(text, false)}</div>`;
    }

    if (RD.island && RD.island.onLyricsTick) RD.island.onLyricsTick(getCurrentLines());
    if (RD.mini && RD.mini.onLyricsTick) RD.mini.onLyricsTick(getCurrentLines());
  }

  async function fetchOnline(query = null) {
    if (!track) return;
    const el = $('#lyr-body');
    if (el) {
      el.innerHTML = `
        <div class="lyr-empty" style="align-items:center;padding:40px 0;text-align:center">
          <div class="spinner" style="margin-bottom:12px;width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></div>
          <p style="font-weight:550;color:var(--text)">${esc(tt('lyrics.searching', 'Mencari lirik…'))}</p>
        </div>`;
    }

    try {
      autoData = await api.getLyrics({ id: track.id, online: true, query });
    } catch (e) {
      autoData = { found: false, error: e.message || String(e) };
    }

    activeLang = 'auto';
    langTabs();
    renderBody();
  }

  async function onTrackChange(t) {
    track = t;
    autoData = null;
    manualByLang = {};
    activeLang = 'auto';
    if (!t) {
      langTabs();
      renderBody();
      return;
    }

    // 1. Cek lirik mandiri / cache lokal terlebih dahulu
    const r = await api.getLyrics({ id: t.id, online: false });
    if (r.manual) {
      manualByLang = r.byLang || {};
      activeLang = Object.keys(manualByLang)[0] || 'auto';
    } else if (r.found) {
      autoData = r;
    }

    langTabs();
    renderBody();
  }

  function openEditor() {
    const d = $('#lyr-editor');
    if (!d || !track) return;
    const lang = activeLang === 'auto' ? 'id' : activeLang;
    d.innerHTML = `
      <div class="dlg-head">
        <h2 id="lyred-h">${esc(tt('lyrics.editTitle', { title: track.title }))}</h2>
        <p>${esc(tt('lyrics.editDesc', 'Tempel atau ketik lirik Anda sendiri untuk lagu ini, per bahasa.'))}</p>
      </div>
      <div class="dlg-body">
        <div class="field">
          <label for="lyred-lang">${esc(tt('lyrics.langLabel', 'Bahasa'))}</label>
          <select id="lyred-lang">${LANGS.filter((l) => l.code !== 'auto').map((l) => `<option value="${l.code}"${l.code === lang ? ' selected' : ''}>${esc(tt(l.labelKey, l.label))}</option>`).join('')}</select>
        </div>
        <div class="field" style="margin-top:14px">
          <label for="lyred-text">${esc(tt('lyrics.textLabel', 'Teks lirik'))}</label>
          <textarea id="lyred-text" rows="14" spellcheck="false" placeholder="${esc(tt('lyrics.textPlaceholder', 'Satu baris per larik…'))}">${esc(manualByLang[lang] || '')}</textarea>
        </div>
      </div>
      <div class="dlg-foot">
        <span class="spacer"></span>
        <button class="btn-quiet" data-r="0">${esc(tt('common.cancel', 'Batal'))}</button>
        <button class="btn-primary" data-r="1">${esc(tt('lyrics.save', 'Simpan'))}</button>
      </div>`;

    const sel = $('#lyred-lang', d), ta = $('#lyred-text', d);
    sel.addEventListener('change', () => {
      ta.value = manualByLang[sel.value] || '';
    });

    d.onclick = (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      if (b.dataset.r === '1') {
        const l = sel.value, text = ta.value;
        if (text && text.trim()) manualByLang[l] = text;
        else delete manualByLang[l];
        api.saveManualLyrics({ id: track.id, lang: l, text });
        activeLang = l;
        langTabs();
        renderBody();
      }
      d.close();
    };
    d.showModal();
    ta.focus();
  }

  function bind() {
    const strip = $('#lyr-langs');
    if (strip) {
      strip.addEventListener('click', (e) => {
        const b = e.target.closest('.lyr-lang');
        if (!b) return;
        activeLang = b.dataset.lang;
        langTabs();
        renderBody();
      });
    }

    const searchBtn = $('#lyr-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => fetchOnline());
    }

    const editBtn = $('#lyr-edit');
    if (editBtn) {
      editBtn.addEventListener('click', openEditor);
    }

    // Click-to-seek timestamp jumping on lyrics lines
    const body = $('#lyr-body');
    if (body) {
      body.addEventListener('click', (e) => {
        const p = e.target.closest('p[data-i]');
        if (!p || !lrcLines || !lrcLines.length) return;
        const idx = +p.dataset.i;
        if (lrcLines[idx] && typeof lrcLines[idx].t === 'number') {
          const audio = $('#audio');
          if (audio) {
            audio.currentTime = lrcLines[idx].t;
            if (audio.paused) audio.play();
          }
        }
      });
    }

    const audio = $('#audio');
    if (audio) {
      audio.addEventListener('timeupdate', () => tick(audio.currentTime));
    }
  }

  function tick(t) {
    if (!lrcLines || !lrcLines.length) return;
    let idx = -1;
    for (let i = 0; i < lrcLines.length; i++) {
      if (lrcLines[i].t <= t) idx = i;
      else break;
    }
    if (idx === lastLineIdx) return;
    lastLineIdx = idx;
    const box = $('#lyr-body .lyr-lines');
    if (box) {
      box.querySelectorAll('p').forEach((p, i) => p.classList.toggle('cur', i === idx));
      const cur = box.querySelector('p.cur');
      if (cur) {
        const npov = $('#nowplaying');
        const isNpOpen = npov && npov.classList.contains('open');
        const isCompact = document.body.classList.contains('mini-mode') || document.body.classList.contains('island-mode');
        // Hanya scroll panel lirik jika Now Playing aktif dan tidak di mode mini/island
        // Gunakan container.scrollTo langsung agar tidak pernah menggulung viewport/window
        if (isNpOpen && !isCompact) {
          const container = $('#npt-lyrics') || cur.closest('.npt');
          if (container) {
            const curTop = cur.offsetTop;
            const containerH = container.clientHeight;
            const curH = cur.clientHeight;
            container.scrollTo({
              top: Math.max(0, curTop - containerH / 2 + curH / 2),
              behavior: 'smooth'
            });
          }
        }
      }
    }
    const currentLines = getCurrentLines();
    if (RD.island && RD.island.onLyricsTick) RD.island.onLyricsTick(currentLines);
    if (RD.mini && RD.mini.onLyricsTick) RD.mini.onLyricsTick(currentLines);
  }

  function getCurrentLines() {
    if (lrcLines && lrcLines.length) {
      const idx = lastLineIdx >= 0 ? lastLineIdx : 0;
      return {
        synced: true,
        prev: idx > 0 ? lrcLines[idx - 1].text : '',
        cur: lrcLines[idx] ? lrcLines[idx].text : '',
        next: idx + 1 < lrcLines.length ? lrcLines[idx + 1].text : '',
      };
    }
    const raw = activeLang === 'auto'
      ? (autoData && autoData.found && !autoData.instrumental ? autoData.plain : '')
      : (manualByLang[activeLang] || '');
    if (raw) {
      const arr = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      return {
        synced: false,
        prev: arr[0] || '',
        cur: arr[1] || arr[0] || '',
        next: arr[2] || '',
      };
    }
    return null;
  }

  function init() {
    bind();
  }

  RD.lyrics = { init, onTrackChange, getCurrentLines, fetchOnline };
})();
