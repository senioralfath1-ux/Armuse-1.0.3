'use strict';
/*
 * Dynamic Island (Mode Mini ke-2 untuk Armuse):
 * Kapsul adaptif di bagian atas tengah layar laptop dengan 5 slide interaktif:
 *  0: Pemutar Utama (progress bar, step -10/+10d, volume, shuffle/repeat/favorit)
 *  1: Lirik Live & Terjemahan Sinkron (auto-scroll real-time)
 *  2: Antrean Berikutnya (Up Next — klik langsung untuk putar)
 *  3: Studio Equalizer & Spektrum Audio Live
 *  4: Utilitas Cepat (Sleep Timer, Pomodoro Fokus Kerja, Status Server iPhone)
 */
(function () {
  const RD = window.RD;
  const { $, $$, esc, ic, fmt, coverEl, toast } = RD;
  const api = window.api;
  const audio = $('#audio');

  const TOTAL_SLIDES = 5;
  let active = false;
  let expanded = false;
  let slideIdx = 0;
  let seeking = false;
  let vizRaf = 0;

  // State Pomodoro Fokus Kerja
  let pomoModeMin = 25; // siklus 25 -> 15 -> 45
  let pomoRemainSec = 25 * 60;
  let pomoRunning = false;
  let pomoTimer = null;

  function setRange(el, v, max) {
    if (!el) return;
    el.value = v;
    el.style.setProperty('--pct', (max ? (v / max) * 100 : 0) + '%');
  }

  function goToSlide(idx) {
    slideIdx = ((idx % TOTAL_SLIDES) + TOTAL_SLIDES) % TOTAL_SLIDES;
    const track = $('#di-track');
    if (track) {
      track.style.transform = `translate3d(-${slideIdx * 20}%, 0, 0)`;
    }
    $$('#di-dots .di-dot').forEach((d, i) => {
      const on = i === slideIdx;
      d.classList.toggle('active', on);
      d.setAttribute('aria-selected', on);
    });
    $$('#di-track .di-slide').forEach((s, i) => {
      s.classList.toggle('is-active', i === slideIdx);
    });
    if (slideIdx === 1 && RD.lyrics && RD.lyrics.getCurrentLines) {
      onLyricsTick(RD.lyrics.getCurrentLines());
    } else if (slideIdx === 2) {
      renderUpNext();
    } else if (slideIdx === 3) {
      renderEqChips();
    } else if (slideIdx === 4) {
      refreshRemoteStatus();
    }
  }

  function setExpanded(next) {
    expanded = !!next;
    const root = $('#dynamic-island');
    if (root) root.classList.toggle('expanded', expanded);
    const chev = $('#di-expand-toggle');
    if (chev) chev.setAttribute('aria-expanded', expanded);
    if (api.setIslandExpanded) api.setIslandExpanded(expanded);
    if (expanded) {
      renderAll();
    }
  }

  function toggleExpanded() {
    setExpanded(!expanded);
  }

  // ---------- Render utama ----------
  function renderPillAndMain() {
    if (!RD.S) return;
    const S = RD.S;
    const t = RD.current ? RD.current() : null;

    const cov = $('#di-cover');
    if (cov) {
      cov.innerHTML = coverEl(t ? t.cover : null, t ? t.title : 'Armuse');
      cov.classList.toggle('spinning', !!S.playing);
    }

    const title = $('#di-title');
    if (title) title.textContent = t ? t.title : 'Belum ada lagu';

    const artist = $('#di-artist');
    if (artist) artist.textContent = t ? t.displayArtist : 'Armuse Dynamic Island';

    const qPlay = $('#di-q-play');
    if (qPlay) {
      qPlay.innerHTML = ic(S.playing ? 'pause' : 'play', 'fill');
      qPlay.setAttribute('aria-label', S.playing ? 'Jeda' : 'Putar');
    }

    // Lencana kualitas audio asli di kapsul atas (#di-pill-badge) & Slide 0 (#di-s0-badge)
    const qInfo = t && RD.quality && RD.quality.describe ? RD.quality.describe(t) : null;
    const pillBadge = $('#di-pill-badge');
    if (pillBadge) {
      if (qInfo) {
        pillBadge.hidden = false;
        pillBadge.className = 'di-pill-badge tier-' + qInfo.tier;
        // 3 baris: Judul Lagu, Penyanyi, dan Badge di baris ke-3 (label lengkap, ukuran dikecilkan rapi)
        const label = qInfo.label || (qInfo.tier === 'hires' ? 'Hi-Res Lossless' : 'Lossless');
        const spec = qInfo.spec || '';
        const codec = qInfo.codec && (qInfo.tier === 'hires' || qInfo.tier === 'lossless' || qInfo.tier === 'atmos') ? qInfo.codec : '';
        pillBadge.innerHTML = `<span class="q-label">${esc(label)}</span>` +
          (spec ? `<small class="q-spec">${esc(spec)}</small>` : '') +
          (codec ? `<span class="q-codec">${esc(codec)}</span>` : '');
        pillBadge.title = `${qInfo.label} (${qInfo.detail})\nKlik untuk rincian sinyal & spektrum`;
      } else {
        pillBadge.hidden = true;
      }
    }

    const s0Badge = $('#di-s0-badge');
    if (s0Badge) {
      if (qInfo) {
        s0Badge.className = 'di-chip-badge tier-' + qInfo.tier;
        const label = qInfo.label || (qInfo.tier === 'hires' ? 'Hi-Res Lossless' : 'Lossless');
        const spec = qInfo.spec || '';
        const codec = qInfo.codec || '';
        s0Badge.innerHTML = `<span class="q-label">${esc(label)}</span>` +
          (spec ? `<small class="q-spec">${esc(spec)}</small>` : '') +
          (codec ? `<span class="q-codec">${esc(codec)}</span>` : '');
        s0Badge.title = `${qInfo.label} (${qInfo.detail})\nKlik untuk buka pengaturan suara & spektrum`;
      } else {
        s0Badge.className = 'di-chip-badge';
        s0Badge.textContent = 'Audio';
      }
    }

    const s0Album = $('#di-s0-album');
    if (s0Album) {
      s0Album.textContent = t ? (t.album ? `${t.album}${t.year ? ' · ' + t.year : ''}` : t.displayArtist) : 'Pilih lagu untuk mulai memutar';
    }

    const fav = $('#di-fav');
    if (fav) {
      const isFav = !!(t && t.fav);
      fav.setAttribute('aria-pressed', isFav);
      fav.innerHTML = ic('heart', isFav ? 'fill' : '');
    }

    const shuf = $('#di-shuffle');
    if (shuf) shuf.setAttribute('aria-pressed', !!S.shuffle);

    const rep = $('#di-repeat');
    if (rep) {
      rep.setAttribute('aria-pressed', S.repeat !== 'off');
      rep.innerHTML = ic(S.repeat === 'one' ? 'repeat1' : 'repeat');
    }

    const durEl = $('#di-t-dur');
    if (durEl) durEl.textContent = fmt(t ? t.duration : (audio && isFinite(audio.duration) ? audio.duration : 0));

    // Sinkronkan volume
    const v = S.muted ? 0 : (S.settings ? S.settings.volume : 0.8);
    setRange($('#di-vol'), v * 100, 100);
    const muteBtn = $('#di-mute');
    if (muteBtn) {
      muteBtn.innerHTML = ic(v === 0 ? 'mute' : v < 0.45 ? 'volumeLow' : 'volume');
    }
  }

  function onLyricsTick(lines) {
    const prevEl = $('#di-lyr-prev');
    const curEl = $('#di-lyr-cur');
    const nextEl = $('#di-lyr-next');
    if (!curEl) return;
    const t = RD.current ? RD.current() : null;
    if (!t) {
      if (prevEl) prevEl.textContent = '';
      curEl.textContent = 'Putar lagu untuk menampilkan lirik berjalan otomatis.';
      if (nextEl) nextEl.textContent = '';
      return;
    }
    if (!lines) {
      if (prevEl) prevEl.textContent = t.displayArtist || '';
      curEl.textContent = 'Belum ada lirik tersimpan — klik “Cari Online” di kanan atas.';
      if (nextEl) nextEl.textContent = t.album || '';
      return;
    }
    if (prevEl) prevEl.textContent = lines.prev || '';
    curEl.textContent = lines.cur || '♪ · · ·';
    if (nextEl) nextEl.textContent = lines.next || '';
    curEl.classList.remove('di-lyr-pop');
    void curEl.offsetWidth;
    curEl.classList.add('di-lyr-pop');
  }

  function renderUpNext() {
    const box = $('#di-upnext-list');
    const head = $('#di-q-head');
    if (!box || !RD.S) return;
    const S = RD.S;
    const upcomingIds = S.queue.slice(S.qi + 1, S.qi + 6);
    if (head) {
      const rem = Math.max(0, S.queue.length - (S.qi + 1));
      head.textContent = rem ? `Berikutnya (${rem} lagu)` : 'Antrean Berikutnya';
    }
    if (!upcomingIds.length) {
      box.innerHTML = '<div class="di-empty">Tidak ada lagu berikutnya di antrean.</div>';
      return;
    }
    box.innerHTML = upcomingIds.map((id, idx) => {
      const tr = S.byId.get(id);
      if (!tr) return '';
      const qIndex = S.qi + 1 + idx;
      return `<button type="button" class="di-up-row" data-di-qi="${qIndex}">
        <span class="di-up-cov">${coverEl(tr.cover, tr.title)}</span>
        <span class="di-up-meta">
          <b>${esc(tr.title)}</b>
          <small>${esc(tr.displayArtist)}</small>
        </span>
        <span class="di-up-dur">${fmt(tr.duration)}</span>
      </button>`;
    }).join('');
  }

  function renderEqChips() {
    const box = $('#di-eq-chips');
    const toggleBtn = $('#di-eq-toggle');
    if (!box || !RD.eq) return;
    const cur = RD.eq.getPreset ? RD.eq.getPreset() : 'Flat';
    const on = RD.eq.isEnabled ? RD.eq.isEnabled() : true;
    if (toggleBtn) {
      toggleBtn.textContent = on ? 'EQ: Aktif' : 'EQ: Nonaktif';
      toggleBtn.classList.toggle('on', on);
    }
    const presets = RD.eq.getPresets ? RD.eq.getPresets() : ['Flat', 'Bass tebal', 'Treble jernih', 'Vokal', 'Rock', 'Pop', 'Jazz', 'Elektronik'];
    box.innerHTML = presets.map((name) => (
      `<button type="button" class="di-eq-chip${name === cur ? ' active' : ''}" data-di-preset="${esc(name)}">${esc(name)}</button>`
    )).join('');
  }

  function onSleepTick(st) {
    const val = $('#di-sleep-val');
    if (val && st) {
      val.textContent = st.remainText;
      val.classList.toggle('active', !!st.active);
    }
  }

  async function refreshRemoteStatus() {
    const pill = $('#di-remote-pill');
    if (!pill || !api.remoteStatus) return;
    try {
      const st = await api.remoteStatus();
      if (st && st.running) {
        const ip = (st.ips && st.ips[0]) || 'localhost';
        pill.textContent = `HP Aktif · ${ip}:${st.port || 4000}`;
        pill.classList.add('on');
      } else {
        pill.textContent = 'Server HP Nonaktif';
        pill.classList.remove('on');
      }
    } catch (_) {}
  }

  function renderAll() {
    renderPillAndMain();
    if (RD.lyrics && RD.lyrics.getCurrentLines) onLyricsTick(RD.lyrics.getCurrentLines());
    renderUpNext();
    renderEqChips();
    if (RD.sleepTimer && RD.sleepTimer.getStatus) onSleepTick(RD.sleepTimer.getStatus());
  }

  // ---------- Loop Animasi Progress & Spektrum Audio ----------
  function loopVisualizer() {
    vizRaf = 0;
    if (!active) return;

    // Update seek bar
    if (!seeking && audio) {
      const d = audio.duration;
      if (d && isFinite(d)) {
        setRange($('#di-seek'), (audio.currentTime / d) * 1000, 1000);
        const curEl = $('#di-t-cur');
        if (curEl) curEl.textContent = fmt(audio.currentTime);
      }
    }

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#F2B33D';
    const playing = RD.S && RD.S.playing;
    let spec = null;
    if (playing && RD.engine && RD.engine.readSpectrum) {
      try { spec = RD.engine.readSpectrum(); } catch (_) { spec = null; }
    }

    // 1) Gambar mini waveform di kapsul atas (#di-wave)
    const waveCvs = $('#di-wave');
    if (waveCvs) {
      const dpr = window.devicePixelRatio || 1;
      const w = (waveCvs.width = 68 * dpr);
      const h = (waveCvs.height = 26 * dpr);
      const g = waveCvs.getContext('2d');
      g.clearRect(0, 0, w, h);
      const bars = 11;
      const gap = 2.6 * dpr;
      const bw = (w - gap * (bars - 1)) / bars;
      g.fillStyle = accent;
      const now = performance.now() / 160;
      for (let i = 0; i < bars; i++) {
        let ratio = 0.18;
        if (playing) {
          if (spec && spec.length) {
            const idx = Math.min(spec.length - 1, Math.floor(Math.pow((i + 1) / bars, 1.7) * (spec.length * 0.42)));
            ratio = Math.max(0.18, (spec[idx] / 255) * 0.95);
          } else {
            ratio = 0.25 + 0.6 * Math.abs(Math.sin(now + i * 0.65));
          }
        }
        const bh = Math.max(3.2 * dpr, ratio * h);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        g.globalAlpha = playing ? (0.6 + ratio * 0.4) : 0.35;
        g.beginPath();
        g.roundRect(x, y, bw, bh, bw / 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }

    // 2) Gambar spektrum lebar di Slide 3 jika sedang dibuka
    if (expanded && slideIdx === 3) {
      const eqCvs = $('#di-eq-viz');
      if (eqCvs) {
        const dpr = window.devicePixelRatio || 1;
        const cw = eqCvs.clientWidth || 440;
        const ch = eqCvs.clientHeight || 52;
        const w = (eqCvs.width = cw * dpr);
        const h = (eqCvs.height = ch * dpr);
        const g = eqCvs.getContext('2d');
        g.clearRect(0, 0, w, h);
        const cols = 38;
        const gap = 3 * dpr;
        const bw = Math.max(2, (w - gap * (cols - 1)) / cols);
        g.fillStyle = accent;
        const now = performance.now() / 180;
        for (let c = 0; c < cols; c++) {
          let v = 0.12;
          if (playing) {
            if (spec && spec.length) {
              const idx = Math.min(spec.length - 1, Math.floor(Math.pow((c + 1) / cols, 1.8) * (spec.length * 0.5)));
              v = Math.max(0.1, (spec[idx] / 255));
            } else {
              v = 0.2 + 0.65 * Math.abs(Math.sin(now + c * 0.35));
            }
          }
          const bh = Math.max(3 * dpr, v * h);
          g.globalAlpha = 0.38 + v * 0.62;
          g.beginPath();
          g.roundRect(c * (bw + gap), h - bh, bw, bh, 2 * dpr);
          g.fill();
        }
        g.globalAlpha = 1;
      }
    }

    vizRaf = requestAnimationFrame(loopVisualizer);
  }

  function startLoop() {
    if (!vizRaf) vizRaf = requestAnimationFrame(loopVisualizer);
  }

  function stopLoop() {
    if (vizRaf) { cancelAnimationFrame(vizRaf); vizRaf = 0; }
  }

  // ---------- Pomodoro Fokus Timer ----------
  function renderPomo() {
    const val = $('#di-pomo-val');
    const tog = $('#di-pomo-toggle');
    const modeBtn = $('#di-pomo-mode');
    if (val) {
      const m = Math.floor(pomoRemainSec / 60);
      const s = pomoRemainSec % 60;
      val.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      val.classList.toggle('active', pomoRunning);
    }
    if (tog) {
      tog.textContent = pomoRunning ? 'Jeda' : 'Mulai';
      tog.classList.toggle('active', pomoRunning);
    }
    if (modeBtn) modeBtn.textContent = `${pomoModeMin}m`;
  }

  function togglePomo() {
    pomoRunning = !pomoRunning;
    if (pomoRunning) {
      if (pomoTimer) clearInterval(pomoTimer);
      pomoTimer = setInterval(() => {
        if (pomoRemainSec > 0) {
          pomoRemainSec--;
          renderPomo();
        } else {
          pomoRunning = false;
          clearInterval(pomoTimer);
          pomoTimer = null;
          pomoRemainSec = pomoModeMin * 60;
          renderPomo();
          if (toast) toast('Sesi fokus selesai! Saatnya istirahat sejenak.', 3600);
        }
      }, 1000);
    } else if (pomoTimer) {
      clearInterval(pomoTimer);
      pomoTimer = null;
    }
    renderPomo();
  }

  function cyclePomoMode() {
    pomoModeMin = pomoModeMin === 25 ? 15 : (pomoModeMin === 15 ? 45 : 25);
    pomoRunning = false;
    if (pomoTimer) { clearInterval(pomoTimer); pomoTimer = null; }
    pomoRemainSec = pomoModeMin * 60;
    renderPomo();
  }

  function resetPomo() {
    pomoRunning = false;
    if (pomoTimer) { clearInterval(pomoTimer); pomoTimer = null; }
    pomoRemainSec = pomoModeMin * 60;
    renderPomo();
  }

  // ---------- Mode Masuk & Keluar ----------
  function enter() {
    active = true;
    expanded = false;
    const root = $('#dynamic-island');
    if (root) {
      root.classList.remove('expanded');
      root.setAttribute('aria-hidden', 'false');
    }
    document.body.classList.remove('mini-mode');
    document.body.classList.add('island-mode');
    renderAll();
    startLoop();
    if (api.enterIsland) api.enterIsland();
  }

  function exitToFull() {
    active = false;
    expanded = false;
    stopLoop();
    const root = $('#dynamic-island');
    if (root) {
      root.classList.remove('expanded');
      root.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('island-mode');
    if (api.exitIsland) api.exitIsland();
  }

  function switchToMini() {
    active = false;
    expanded = false;
    stopLoop();
    const root = $('#dynamic-island');
    if (root) {
      root.classList.remove('expanded');
      root.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('island-mode');
    document.body.classList.add('mini-mode');
    if (api.enterMini) api.enterMini();
  }

  function syncModeFromMain(mode) {
    const isIsl = mode === 'island';
    active = isIsl;
    document.body.classList.toggle('island-mode', isIsl);
    const root = $('#dynamic-island');
    if (root) {
      root.setAttribute('aria-hidden', isIsl ? 'false' : 'true');
      if (!isIsl) root.classList.remove('expanded');
    }
    if (isIsl) {
      expanded = false;
      renderAll();
      startLoop();
    } else {
      stopLoop();
    }
  }

  // ---------- Event Binding ----------
  function bind() {
    const btnIsland = $('#btn-island');
    if (btnIsland) btnIsland.addEventListener('click', enter);
    const mbToIsland = $('#mb-to-island');
    if (mbToIsland) mbToIsland.addEventListener('click', enter);

    const pillToggle = $('#di-pill-toggle');
    if (pillToggle) pillToggle.addEventListener('click', toggleExpanded);
    const expandBtn = $('#di-expand-toggle');
    if (expandBtn) expandBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleExpanded(); });
    const waveCvs = $('#di-wave');
    if (waveCvs) waveCvs.addEventListener('click', (e) => { e.stopPropagation(); setExpanded(true); goToSlide(3); });

    const toMini = $('#di-to-mini');
    if (toMini) toMini.addEventListener('click', (e) => { e.stopPropagation(); switchToMini(); });
    const toFull = $('#di-to-full');
    if (toFull) toFull.addEventListener('click', (e) => { e.stopPropagation(); exitToFull(); });

    // Klik lencana kualitas di Dynamic Island untuk beralih ke Slide Audio & Spektrum
    $('#di-pill-badge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      setExpanded(true);
      goToSlide(3);
    });
    $('#di-s0-badge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      goToSlide(3);
    });

    // Kontrol cepat di kapsul
    $('#di-q-prev')?.addEventListener('click', (e) => { e.stopPropagation(); if (RD.prev) RD.prev(); });
    $('#di-q-play')?.addEventListener('click', (e) => { e.stopPropagation(); if (RD.togglePlay) RD.togglePlay(); });
    $('#di-q-next')?.addEventListener('click', (e) => { e.stopPropagation(); if (RD.next) RD.next(false); });

    // Navigasi slide
    $('#di-prev-slide')?.addEventListener('click', () => goToSlide(slideIdx - 1));
    $('#di-next-slide')?.addEventListener('click', () => goToSlide(slideIdx + 1));
    $('#di-dots')?.addEventListener('click', (e) => {
      const dot = e.target.closest('[data-go-slide]');
      if (dot) goToSlide(+dot.dataset.goSlide);
    });

    // Gestur scroll horizontal / wheel lembut untuk pindah slide di dalam deck
    const viewport = $('#di-viewport');
    let wheelLock = 0;
    if (viewport) {
      viewport.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 18) {
          const now = Date.now();
          if (now - wheelLock > 280) {
            wheelLock = now;
            goToSlide(slideIdx + (e.deltaX > 0 ? 1 : -1));
          }
        }
      }, { passive: true });
    }

    // Slide 0: seek, volume, modes
    const seek = $('#di-seek');
    if (seek) {
      seek.addEventListener('pointerdown', () => { seeking = true; });
      seek.addEventListener('input', () => {
        if (audio && isFinite(audio.duration)) {
          audio.currentTime = (seek.value / 1000) * audio.duration;
          const curEl = $('#di-t-cur');
          if (curEl) curEl.textContent = fmt(audio.currentTime);
        }
        seek.style.setProperty('--pct', (seek.value / 10) + '%');
      });
      const endSeek = () => { seeking = false; };
      seek.addEventListener('pointerup', endSeek);
      seek.addEventListener('change', endSeek);
    }

    const vol = $('#di-vol');
    if (vol) {
      vol.addEventListener('input', () => {
        if (!RD.S) return;
        RD.S.muted = false;
        RD.S.settings.volume = vol.value / 100;
        if (RD.applyVol) RD.applyVol();
        if (RD.saveSoon) RD.saveSoon();
        renderPillAndMain();
      });
    }
    $('#di-mute')?.addEventListener('click', () => {
      if (!RD.S) return;
      RD.S.muted = !RD.S.muted;
      if (RD.applyVol) RD.applyVol();
      renderPillAndMain();
    });

    $('#di-fav')?.addEventListener('click', () => { const b = $('#np-fav'); if (b) b.click(); });
    $('#di-shuffle')?.addEventListener('click', () => { const b = $('#btn-shuffle'); if (b) b.click(); renderPillAndMain(); renderUpNext(); });
    $('#di-repeat')?.addEventListener('click', () => { const b = $('#btn-repeat'); if (b) b.click(); renderPillAndMain(); });

    // Aksi di dalam deck
    $('#di-deck')?.addEventListener('click', (e) => {
      const actBtn = e.target.closest('[data-di-act]');
      if (actBtn && audio) {
        const act = actBtn.dataset.diAct;
        if (act === 'seek-back') audio.currentTime = Math.max(0, audio.currentTime - 10);
        else if (act === 'seek-fwd') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
        else if (act === 'shuffle-queue') { const b = $('#btn-shuffle'); if (b) b.click(); renderPillAndMain(); renderUpNext(); }
        return;
      }

      const qRow = e.target.closest('[data-di-qi]');
      if (qRow && RD.S) {
        const qi = +qRow.dataset.diQi;
        if (Number.isFinite(qi) && qi >= 0 && qi < RD.S.queue.length) {
          RD.S.qi = qi;
          const item = $(`#tab-queue .q-item[data-qi="${qi}"]`);
          if (item) item.click();
          else if (RD.playAtQueueIndex) RD.playAtQueueIndex(qi);
        }
        return;
      }

      const eqChip = e.target.closest('[data-di-preset]');
      if (eqChip && RD.eq && RD.eq.applyPreset) {
        RD.eq.applyPreset(eqChip.dataset.diPreset);
        renderEqChips();
        return;
      }

      const sleepBtn = e.target.closest('[data-di-sleep]');
      if (sleepBtn && RD.sleepTimer) {
        const v = sleepBtn.dataset.diSleep;
        if (v === 'off') RD.sleepTimer.clear();
        else if (v === 'end') RD.sleepTimer.setAtTrackEnd();
        else RD.sleepTimer.setMinutes(+v);
        return;
      }
    });

    $('#di-lyr-search')?.addEventListener('click', async () => {
      if (RD.lyrics && RD.lyrics.fetchOnline) {
        const curEl = $('#di-lyr-cur');
        if (curEl) curEl.textContent = 'Mencari lirik tersinkronisasi…';
        await RD.lyrics.fetchOnline();
      }
    });

    $('#di-eq-toggle')?.addEventListener('click', () => {
      if (RD.eq && RD.eq.setEnabled) {
        RD.eq.setEnabled(!RD.eq.isEnabled());
        renderEqChips();
      }
    });

    $('#di-pomo-toggle')?.addEventListener('click', togglePomo);
    $('#di-pomo-mode')?.addEventListener('click', cyclePomoMode);
    $('#di-pomo-reset')?.addEventListener('click', resetPomo);

    if (api.onIslandDock) {
      api.onIslandDock((docked) => {
        const root = $('#dynamic-island');
        if (root) root.classList.toggle('floating', !docked);
      });
    }
  }

  function init() {
    bind();
    renderPomo();
    goToSlide(0);
  }

  RD.island = {
    init,
    enter,
    exitToFull,
    switchToMini,
    syncModeFromMain,
    update: renderAll,
    onLyricsTick,
    onSleepTick,
    isActive: () => active,
  };
})();
