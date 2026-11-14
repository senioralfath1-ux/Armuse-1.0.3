'use strict';
/* Perbandingan A/B: file asli vs versi terkompresi (AAC/MP3/Opus) dari lagu yang sedang diputar.
 * Dua elemen <audio> diputar serempak; pengalih A/B hanya mengatur volume masing-masing jalur di
 * mesin audio (engine.setCompare), sehingga perpindahannya instan dan tanpa jeda muat ulang. */
(function () {
  const RD = window.RD;
  const { $, esc, toast } = RD;
  const api = window.api;

  const audio = $('#audio');
  const audioB = new Audio();
  audioB.preload = 'auto';

  const st = {
    status: null,        // { available, source, version, cache:{files,bytes} }
    presets: [],
    preset: 'aac-256',
    busy: false,
    pct: 0,
    ready: false,
    mode: 'A',
    match: true,
    trackId: null,
    res: null,
    token: 0,
    box: null,
  };
  let wired = false;
  let bound = false;

  const mb = (b) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;
  const cur = () => (RD.quality ? RD.quality.current() : null);

  function ensureWired() {
    const eng = RD.engine;
    if (!eng || typeof eng.attachCompare !== 'function') return false;
    if (!wired) { eng.attachCompare(audioB); wired = true; }
    return true;
  }

  // ---------------------------------------------------------------- pengendali B
  function resetB() {
    st.ready = false;
    st.mode = 'A';
    st.res = null;
    audioB.pause();
    if (audioB.getAttribute('src')) { audioB.removeAttribute('src'); audioB.load(); }
    if (RD.engine && RD.engine.setCompare) RD.engine.setCompare('A', 0);
  }

  function fullReset(doRender = true) {
    st.token++;
    if (st.busy) api.abCancel().catch(() => {});
    st.busy = false;
    st.pct = 0;
    st.trackId = null;
    resetB();
    if (doRender) render();
  }

  /** Dipanggil saat lagu berganti: hasil pembanding milik lagu lama tidak boleh terbawa. */
  function syncTrack() {
    const t = cur();
    if ((st.ready || st.busy || st.trackId) && (!t || t.id !== st.trackId)) fullReset(false);
  }

  function loadB(url) {
    return new Promise((resolve, reject) => {
      const done = (fn, arg) => { audioB.removeEventListener('canplay', ok); audioB.removeEventListener('error', bad); fn(arg); };
      const ok = () => done(resolve);
      const bad = () => done(reject, new Error(audioB.error ? `kode galat ${audioB.error.code}` : 'gagal memuat'));
      audioB.addEventListener('canplay', ok);
      audioB.addEventListener('error', bad);
      audioB.src = url;
      audioB.load();
    });
  }

  function applyMode() {
    if (!st.ready || !RD.engine) return;
    RD.engine.setCompare(st.mode, st.match && st.res ? st.res.gainDb : 0);
    if (!st.box) return;
    st.box.querySelectorAll('[data-ab="A"],[data-ab="B"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ab === st.mode)));
  }

  function setMode(m) {
    if (!st.ready || (m !== 'A' && m !== 'B')) return;
    st.mode = m;
    applyMode();
  }

  async function prepare() {
    const t = cur();
    if (!t || st.busy) return;
    if (!ensureWired()) { toast('Mesin audio tidak tersedia, perbandingan tidak bisa dipakai.', 5000); return; }
    resetB();
    st.busy = true;
    st.pct = 0;
    st.trackId = t.id;
    const token = ++st.token;
    render();

    let r;
    try { r = await api.abPrepare({ id: t.id, preset: st.preset }); } catch (e) { r = { ok: false, error: e.message }; }
    if (token !== st.token) return;                        // dibatalkan / lagu sudah berganti

    if (!r.ok) {
      st.busy = false;
      st.trackId = null;
      if (!r.cancelled) toast(r.error || 'Gagal menyiapkan pembanding.', 6000);
      render();
      return;
    }
    try { await loadB(api.mediaUrl(r.path)); } catch (e) {
      if (token !== st.token) return;
      st.busy = false;
      st.trackId = null;
      toast(`Pembanding dibuat, tetapi tidak bisa diputar oleh mesin audio (${e.message}).`, 6000);
      render();
      return;
    }
    if (token !== st.token) return;

    st.busy = false;
    st.res = r;
    st.ready = true;
    st.mode = 'A';
    audioB.currentTime = audio.currentTime;
    if (!audio.paused) audioB.play().catch(() => {});
    applyMode();
    refreshStatus();
    render();
  }

  // ---------------------------------------------------------------- status & tampilan
  async function refreshStatus() {
    try {
      st.status = await api.abStatus();
      if (!st.presets.length && st.status.available) st.presets = await api.abPresets();
    } catch (e) { st.status = { available: false }; }
    render();
  }

  function render() {
    const box = st.box;
    if (!box || !box.isConnected) return;
    const t = cur();
    if (!t) return;
    if (!st.status) { box.innerHTML = '<p class="ab-note">Memeriksa ffmpeg…</p>'; return; }
    if (!st.status.available) {
      box.innerHTML = '<p class="ab-note">Fitur ini membutuhkan <b>ffmpeg</b> untuk membuat versi terkompresi, dan aplikasi belum menemukannya. '
        + 'Di folder proyek jalankan <code>npm install ffmpeg-static</code>, lalu buka ulang aplikasi.</p>';
      return;
    }

    const f = t.fmt || {};
    const d = RD.quality.describe(t);
    const preset = st.presets.find((p) => p.id === st.preset);
    const opts = st.presets.map((p) => `<option value="${esc(p.id)}"${p.id === st.preset ? ' selected' : ''}>${esc(p.label)}</option>`).join('');

    let h = '<p class="ab-note">Buat versi terkompresi dari lagu ini, lalu pindah A/B sambil lagu berputar. Pakai headphone dan dengarkan bagian yang ramai.</p>';
    h += `<div class="ab-row"><select id="ab-preset" aria-label="Format pembanding"${st.busy ? ' disabled' : ''}>${opts}</select>`;
    h += st.busy
      ? '<button type="button" class="btn-quiet" data-ab="cancel">Batal</button>'
      : `<button type="button" class="btn-quiet strong" data-ab="prepare">${st.ready ? 'Siapkan ulang' : 'Siapkan'}</button>`;
    h += '</div>';
    if (preset) h += `<div class="ab-sub">${esc(preset.note)}</div>`;
    if (f.codec && !f.lossless) h += '<div class="ab-warn">Sumber ini sudah terkompresi. Pembandingnya mengalami kompresi kedua, jadi selisihnya bukan ukuran kualitas asli.</div>';
    if ((f.channels || 2) > 2) h += '<div class="ab-warn">Sumber surround: pembanding dibuat stereo, jadi perbandingan hanya perkiraan kasar.</div>';

    if (st.busy) {
      h += `<div class="ab-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${st.pct}"><i id="ab-bar" style="width:${st.pct}%"></i></div>`;
      h += `<div class="ab-sub">Mengonversi… <span id="ab-pct">${st.pct}</span>%</div>`;
    }

    if (st.ready && st.res) {
      const r = st.res;
      const ratio = r.srcBytes ? Math.round((r.bytes / r.srcBytes) * 100) : 0;
      let lvl;
      if (r.levelMatched) lvl = `Selisih volume ${r.gainDb > 0 ? '+' : ''}${r.gainDb} dB ${st.match ? 'dikoreksi otomatis' : 'tidak dikoreksi'}.`;
      else if (r.surround) lvl = 'Volume tidak dicocokkan untuk sumber surround.';
      else lvl = 'Volume tidak bisa diukur; pindahan A/B mungkin terdengar beda keras.';
      h += `<div class="ab-seg" role="group" aria-label="Pilih sumber suara">
        <button type="button" data-ab="A" aria-pressed="${st.mode === 'A'}"><b>A</b><span>Asli</span><small>${esc(d ? d.label : (f.codec || ''))}</small></button>
        <button type="button" data-ab="B" aria-pressed="${st.mode === 'B'}"><b>B</b><span>${esc(preset ? preset.label : 'Pembanding')}</span><small>${mb(r.bytes)}${ratio ? ` · ${ratio}% dari asli` : ''}</small></button>
      </div>
      <label class="chk"><input type="checkbox" id="ab-match"${st.match ? ' checked' : ''}${r.levelMatched ? '' : ' disabled'}><span>Samakan volume otomatis</span></label>
      <div class="ab-sub">${esc(lvl)} Tombol <kbd>A</kbd> / <kbd>B</kbd> di papan ketik juga berfungsi.</div>
      <div class="ab-sub">Ini uji terbuka: Anda tahu mana A dan B, jadi kesan telinga bisa dipengaruhi ekspektasi. <button type="button" class="link" data-ab="off">Berhenti membandingkan</button></div>`;
    }

    const c = st.status.cache || { files: 0, bytes: 0 };
    h += `<div class="ab-foot"><span>Cache pembanding: ${c.files} file, ${mb(c.bytes)}</span>`
      + `<button type="button" class="link" data-ab="clear"${c.files ? '' : ' disabled'}>Bersihkan</button></div>`;
    box.innerHTML = h;
  }

  function bind() {
    if (bound) return;
    bound = true;
    const tab = $('#tab-quality');

    tab.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ab]');
      if (!b || b.disabled) return;
      switch (b.dataset.ab) {
        case 'prepare': prepare(); break;
        case 'cancel': fullReset(); break;
        case 'A': case 'B': setMode(b.dataset.ab); break;
        case 'off': fullReset(); break;
        case 'clear': {
          fullReset(false);
          const r = await api.abClear();
          toast(r.files ? `Cache dibersihkan (${mb(r.freed)}).` : 'Cache sudah kosong.');
          refreshStatus();
          break;
        }
        default:
      }
    });

    tab.addEventListener('change', (e) => {
      if (e.target.id === 'ab-preset') {
        st.preset = e.target.value;
        if (st.ready) fullReset(); else render();
      } else if (e.target.id === 'ab-match') {
        st.match = e.target.checked;
        applyMode();
        render();
      }
    });

    api.onAbProgress(({ id, pct }) => {
      if (!st.busy || id !== st.trackId) return;
      st.pct = pct;
      const bar = $('#ab-bar');
      if (bar) { bar.style.width = pct + '%'; const n = $('#ab-pct'); if (n) n.textContent = pct; }
    });
  }

  // ---------------------------------------------------------------- sinkron dengan pemutar utama
  audio.addEventListener('play', () => { if (st.ready) { audioB.currentTime = audio.currentTime; audioB.play().catch(() => {}); } });
  audio.addEventListener('pause', () => { if (st.ready) audioB.pause(); });
  audio.addEventListener('seeking', () => { if (st.ready) audioB.currentTime = audio.currentTime; });
  audio.addEventListener('loadstart', syncTrack);
  audio.addEventListener('emptied', syncTrack);

  setInterval(() => {                                    // koreksi bila dua jalur bergeser
    if (!st.ready || audio.paused) return;
    if (Math.abs(audioB.currentTime - audio.currentTime) > 0.12) audioB.currentTime = audio.currentTime;
    if (audioB.paused) audioB.play().catch(() => {});
  }, 500);

  document.addEventListener('keydown', (e) => {
    if (!st.ready || e.ctrlKey || e.metaKey || e.altKey) return;
    if (RD.S.tab !== 'quality' || !$('#drawer').classList.contains('open')) return;
    if (e.target.closest && e.target.closest('input, select, textarea, dialog')) return;
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'b') { setMode(k.toUpperCase()); e.preventDefault(); }
  });

  RD.compare = {
    mount(box) { st.box = box; bind(); syncTrack(); render(); refreshStatus(); },
    syncTrack,
    state: st,
  };
})();
