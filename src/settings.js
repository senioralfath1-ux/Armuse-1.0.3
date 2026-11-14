'use strict';
/* Jendela Pengaturan: Tema (Gelap, Terang, Glass), Bahasa, & Pintasan Keyboard Global Kustom. */
(function () {
  const RD = window.RD;
  const { $, $$, esc, toast } = RD;
  const api = window.api;

  const THEMES = [
    { id: 'dark', swatch: ['#151C26', '#232E3C', '#F2B33D'] },
    { id: 'light', swatch: ['#EAE7E0', '#FFFFFF', '#F2B33D'] },
    {
      id: 'glass',
      swatch: [
        'linear-gradient(135deg,rgba(255,255,255,0.95),rgba(255,255,255,0.35))',
        'linear-gradient(135deg,rgba(255,255,255,0.75),rgba(220,225,235,0.25))',
        '#FFFFFF',
      ],
    },
  ];
  const LANGS = ['id', 'en', 'ja'];

  const SHORTCUT_ITEMS = [
    { key: 'toggleIsland', label: 'Buka / Tutup Dynamic Island', desc: 'Langsung beralih ke Dynamic Island dari aplikasi mana pun' },
    { key: 'toggleMini', label: 'Buka / Tutup Mode Mini', desc: 'Beralih ke pemutar mini klasik dari aplikasi mana pun' },
    { key: 'playPause', label: 'Putar / Jeda Lagu', desc: 'Kontrol pemutaran musik di latar belakang' },
    { key: 'nextTrack', label: 'Lagu Berikutnya', desc: 'Lompat ke lagu selanjutnya di antrean' },
    { key: 'prevTrack', label: 'Lagu Sebelumnya', desc: 'Kembali ke lagu sebelumnya di antrean' },
    { key: 'toggleWindow', label: 'Tampilkan / Sembunyikan Armuse', desc: 'Munculkan atau sembunyikan jendela utama Armuse' },
  ];

  let shortcutsState = {
    enabled: true,
    toggleIsland: 'Alt+I',
    toggleMini: 'Alt+M',
    playPause: 'Alt+Space',
    nextTrack: 'Alt+Right',
    prevTrack: 'Alt+Left',
    toggleWindow: 'Alt+A',
  };
  let recordingKey = null;

  const tt = (key) => (RD.i18n ? RD.i18n.t(key) : key);

  function formatAccelDisplay(accel) {
    if (!accel) return tt('settings.shortcuts.inactive');
    return accel
      .replace(/CommandOrControl/g, 'Ctrl')
      .replace(/\+/g, ' + ');
  }

  function eventToAccelerator(e) {
    const mods = [];
    if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');

    const k = e.key;
    if (['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(k)) return null;

    let mainKey = '';
    if (k === ' ') mainKey = 'Space';
    else if (k === 'ArrowUp') mainKey = 'Up';
    else if (k === 'ArrowDown') mainKey = 'Down';
    else if (k === 'ArrowLeft') mainKey = 'Left';
    else if (k === 'ArrowRight') mainKey = 'Right';
    else if (k === 'Plus' || k === '+') mainKey = 'Plus';
    else if (/^F([1-9]|1\d|2[0-4])$/i.test(k)) mainKey = k.toUpperCase();
    else if (k.length === 1 && /[a-zA-Z0-9]/.test(k)) mainKey = k.toUpperCase();
    else if (['Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Tab', 'Enter'].includes(k)) mainKey = k;
    else return null;

    // Untuk tombol huruf/angka/spasi biasa, wajib ada minimal 1 modifier (Alt/Ctrl/Shift) agar tidak membajak ketikan normal
    if (!mods.length && !/^F\d+$/i.test(mainKey)) {
      return null;
    }

    return [...mods, mainKey].join('+');
  }

  function themeCardHtml(t, current) {
    return `<button type="button" class="theme-card${t.id === current ? ' active' : ''}" data-theme-pick="${t.id}" aria-pressed="${t.id === current}">
      <span class="theme-swatch"><i style="background:${t.swatch[0]}"></i><i style="background:${t.swatch[1]}"></i><i style="background:${t.swatch[2]}"></i></span>
      <b>${tt('theme.' + t.id + '.name')}</b>
      <small>${tt('theme.' + t.id + '.desc')}</small>
    </button>`;
  }

  function langCardHtml(l, current) {
    return `<button type="button" class="theme-card lang-card${l === current ? ' active' : ''}" data-lang-pick="${l}" aria-pressed="${l === current}">
      <b>${tt('lang.' + l)}</b>
    </button>`;
  }

  function shortcutsBlockHtml() {
    const on = shortcutsState.enabled !== false;
    return `
      <section class="settings-block">
        <div class="sc-head">
          <div>
            <h3>${tt('settings.shortcuts')}</h3>
            <p class="sc-sub">${tt('settings.shortcuts.desc')}</p>
          </div>
          <div class="sc-head-actions">
            <label class="switch">
              <input type="checkbox" id="sc-enabled" ${on ? 'checked' : ''}>
              <span class="knob"></span>
              <span class="switch-lbl">${on ? tt('settings.shortcuts.active') : tt('settings.shortcuts.inactive')}</span>
            </label>
            <button type="button" class="btn-quiet" id="sc-reset">${tt('settings.shortcuts.reset')}</button>
          </div>
        </div>
        <div class="sc-list${on ? '' : ' is-disabled'}">
          ${SHORTCUT_ITEMS.map((item) => {
            const val = shortcutsState[item.key] || '';
            const isRec = recordingKey === item.key;
            const label = tt('settings.shortcuts.' + item.key) || item.label;
            const desc = tt('settings.shortcuts.' + item.key + '.desc') || item.desc;
            return `<div class="sc-row">
              <div class="sc-info">
                <b>${esc(label)}</b>
                <small>${esc(desc)}</small>
              </div>
              <button type="button" class="sc-keybtn${isRec ? ' recording' : ''}" data-sc-key="${item.key}" title="${esc(tt('settings.shortcuts.recordHint'))}">
                ${isRec ? tt('settings.shortcuts.recording') : esc(formatAccelDisplay(val))}
              </button>
            </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  function render() {
    const curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const curLang = RD.i18n ? RD.i18n.getLang() : (document.documentElement.getAttribute('lang') || 'id');
    return `
      <div class="dlg-head"><h2 id="settings-h">${tt('settings.title')}</h2></div>
      <div class="dlg-body">
        <section class="settings-block">
          <h3>${tt('settings.appearance')}</h3>
          <div class="theme-grid">${THEMES.map((t) => themeCardHtml(t, curTheme)).join('')}</div>
        </section>
        ${shortcutsBlockHtml()}
        <section class="settings-block">
          <h3>${tt('settings.language')}</h3>
          <div class="theme-grid lang-grid">${LANGS.map((l) => langCardHtml(l, curLang)).join('')}</div>
        </section>
        ${RD.support && RD.support.settingsBlockHtml ? RD.support.settingsBlockHtml() : ''}
      </div>
      <div class="dlg-foot"><span class="spacer"></span><button class="btn-primary" data-r="close">${tt('settings.done')}</button></div>`;
  }

  function pickTheme(theme, dlg) {
    api.saveSettings({ theme });
    document.documentElement.setAttribute('data-theme', theme);
    if (RD.liquidGlass && RD.liquidGlass.syncThemeState) {
      RD.liquidGlass.syncThemeState();
    }
    $$('.theme-card[data-theme-pick]', dlg).forEach((c) => {
      const on = c.dataset.themePick === theme;
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', on);
    });
  }

  function pickLang(lang, dlg) {
    api.saveSettings({ lang });
    if (RD.i18n) RD.i18n.setLang(lang);
    if (RD.render) RD.render();
    dlg.innerHTML = render();
    wire(dlg);
  }

  async function saveShortcuts(patch, dlg) {
    shortcutsState = { ...shortcutsState, ...patch };
    if (RD.S && RD.S.settings) RD.S.settings.shortcuts = { ...shortcutsState };
    await api.saveSettings({ shortcuts: shortcutsState });
    if (RD.syncShortcutTooltips) RD.syncShortcutTooltips(shortcutsState);
    if (dlg && dlg.open) {
      dlg.innerHTML = render();
      wire(dlg);
    }
  }

  function wire(dlg) {
    $$('[data-theme-pick]', dlg).forEach((btn) =>
      btn.addEventListener('click', () => pickTheme(btn.dataset.themePick, dlg))
    );
    $$('[data-lang-pick]', dlg).forEach((btn) =>
      btn.addEventListener('click', () => pickLang(btn.dataset.langPick, dlg))
    );

    const scToggle = $('#sc-enabled', dlg);
    if (scToggle) {
      scToggle.addEventListener('change', () => {
        saveShortcuts({ enabled: scToggle.checked }, dlg);
      });
    }

    const scReset = $('#sc-reset', dlg);
    if (scReset) {
      scReset.addEventListener('click', async () => {
        recordingKey = null;
        if (api.resetShortcuts) {
          shortcutsState = await api.resetShortcuts();
          if (RD.S && RD.S.settings) RD.S.settings.shortcuts = { ...shortcutsState };
          if (RD.syncShortcutTooltips) RD.syncShortcutTooltips(shortcutsState);
          dlg.innerHTML = render();
          wire(dlg);
          if (toast) toast(tt('settings.shortcuts.resetToast'));
        }
      });
    }

    $$('[data-sc-key]', dlg).forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.scKey;
        recordingKey = recordingKey === key ? null : key;
        dlg.innerHTML = render();
        wire(dlg);
      });
    });

    dlg.onclick = (e) => {
      if (e.target.closest('[data-r="close"]')) {
        recordingKey = null;
        dlg.close();
      }
    };
  }

  // Tangkap rekaman kombinasi tombol saat sedang merekam di dialog Pengaturan
  window.addEventListener(
    'keydown',
    (e) => {
      if (!recordingKey) return;
      const dlg = $('#settings');
      if (!dlg || !dlg.open) {
        recordingKey = null;
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        recordingKey = null;
        dlg.innerHTML = render();
        wire(dlg);
        return;
      }

      if (e.key === 'Backspace') {
        const k = recordingKey;
        recordingKey = null;
        saveShortcuts({ [k]: '' }, dlg);
        if (toast) toast(tt('settings.shortcuts.disabledToast'));
        return;
      }

      const accel = eventToAccelerator(e);
      if (!accel) {
        if (!['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key) && toast) {
          toast(tt('settings.shortcuts.comboHintToast'));
        }
        return;
      }

      const targetKey = recordingKey;
      recordingKey = null;
      saveShortcuts({ [targetKey]: accel }, dlg);
      if (toast) toast(`${tt('settings.shortcuts.savedToast')}: ${formatAccelDisplay(accel)}`);
    },
    true
  );

  async function open() {
    const d = $('#settings');
    if (!d) return;
    recordingKey = null;
    if (api.getShortcuts) {
      try {
        shortcutsState = await api.getShortcuts();
      } catch (_) {}
    } else if (RD.S && RD.S.settings && RD.S.settings.shortcuts) {
      shortcutsState = { ...shortcutsState, ...RD.S.settings.shortcuts };
    }
    d.innerHTML = render();
    wire(d);
    d.showModal();
  }

  RD.settingsUI = { open };
})();
