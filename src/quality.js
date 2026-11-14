'use strict';
/* Lencana kualitas audio di pemutar desktop, Dynamic Island, Mode Mini, & Layar Now Playing
 * (Hi-Res Lossless / Lossless / 24-bit/96kHz / FLAC / AAC / MP3) seperti pada iPhone Companion. */
(function () {
  const RD = window.RD;
  const { $, esc } = RD;

  const HIRES_ABOVE_HZ = 48000;

  const khz = (hz) => (hz ? `${+(hz / 1000).toFixed(1)} kHz` : '');
  const khzCompact = (hz) => {
    if (!hz) return '';
    const val = +(hz / 1000).toFixed(1);
    return `${val}kHz`;
  };
  const chName = (n) => ({ 1: 'Mono', 2: 'Stereo', 6: '5.1', 8: '7.1' }[n] || (n ? `${n} kanal` : ''));
  const mb = (b) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`;
  const join = (a, sep = ' · ') => a.filter(Boolean).join(sep);

  const current = () => RD.S.byId.get(RD.S.queue[RD.S.qi]) || null;

  function inferExtCodec(filePath) {
    if (!filePath || typeof filePath !== 'string') return { ext: '', codec: '' };
    const dot = filePath.lastIndexOf('.');
    const ext = dot >= 0 ? filePath.slice(dot).toLowerCase() : '';
    const map = {
      '.flac': 'FLAC',
      '.wav': 'WAV',
      '.alac': 'ALAC',
      '.m4a': 'AAC',
      '.aac': 'AAC',
      '.mp3': 'MP3',
      '.opus': 'Opus',
      '.ogg': 'Vorbis',
      '.oga': 'Vorbis',
    };
    return { ext, codec: map[ext] || ext.replace('.', '').toUpperCase() };
  }

  /** @returns {{tier:string,label:string,shortLabel:string,spec:string,compactSpec:string,codec:string,detail:string,pillText:string}|null} */
  function describe(t) {
    if (!t) return null;
    const f = t.fmt || {};
    const inf = inferExtCodec(t.path);
    const codec = (f.codec || t.codec || inf.codec || 'AUDIO').toUpperCase();
    const isLossless =
      f.lossless === true ||
      inf.ext === '.flac' ||
      inf.ext === '.wav' ||
      inf.ext === '.alac' ||
      /^(FLAC|ALAC|WAV|PCM)$/i.test(codec);

    const sampleRate = f.sampleRate || (isLossless ? 44100 : 44100);
    const bitDepth = f.bitDepth || (isLossless ? (sampleRate > HIRES_ABOVE_HZ ? 24 : 16) : 0);
    const isHiRes = isLossless && (sampleRate > HIRES_ABOVE_HZ || bitDepth > 16);
    const bitrate = f.bitrate || t.bitrate || 0;

    if (f.atmos) {
      const spec = join([chName(f.channels), khz(sampleRate)], ' / ');
      return {
        tier: 'atmos',
        label: 'Dolby Atmos',
        shortLabel: 'DOLBY ATMOS',
        spec,
        compactSpec: `Atmos · ${codec}`,
        codec,
        detail: join([spec, codec], ' · '),
        pillText: join(['ATMOS', spec, codec], ' · '),
      };
    }

    if (isHiRes) {
      const spec = `${bitDepth || 24}-bit / ${khz(sampleRate || 96000)}`;
      const compactSpec = `${bitDepth || 24}b/${khzCompact(sampleRate || 96000)} ${codec}`;
      return {
        tier: 'hires',
        label: 'Hi-Res Lossless',
        shortLabel: 'HI-RES LOSSLESS',
        spec,
        compactSpec,
        codec,
        detail: `${spec} · ${codec}`,
        pillText: `HI-RES · ${spec} · ${codec}`,
      };
    }

    if (isLossless) {
      const spec = `${bitDepth || 16}-bit / ${khz(sampleRate || 44100)}`;
      const compactSpec = `${bitDepth || 16}b/${khzCompact(sampleRate || 44100)} ${codec}`;
      return {
        tier: 'lossless',
        label: 'Lossless',
        shortLabel: 'LOSSLESS',
        spec,
        compactSpec,
        codec,
        detail: `${spec} · ${codec}`,
        pillText: `LOSSLESS · ${spec} · ${codec}`,
      };
    }

    if (codec === 'E-AC-3' || codec === 'AC-3') {
      const spec = join([chName(f.channels), khz(sampleRate)], ' / ');
      return {
        tier: 'surround',
        label: codec === 'E-AC-3' ? 'Dolby Digital+' : 'Dolby Digital',
        shortLabel: 'SURROUND',
        spec,
        compactSpec: `5.1 · ${codec}`,
        codec,
        detail: join([spec, codec], ' · '),
        pillText: join([spec, codec], ' · '),
      };
    }

    const kbps = bitrate ? `${f.vbr ? '~' : ''}${bitrate} kbps` : '';
    const spec = join([kbps, khz(sampleRate)], ' · ');
    const compactSpec = `${bitrate ? bitrate + 'k ' : ''}${codec}`.trim();
    return {
      tier: 'lossy',
      label: bitrate >= 256 ? `${codec} HQ` : codec,
      shortLabel: codec,
      spec,
      compactSpec,
      codec,
      detail: spec || codec,
      pillText: join([codec, kbps || khz(sampleRate)], ' · '),
    };
  }

  const ICON =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">' +
    '<rect x="1" y="6" width="2.2" height="4" rx="1.1"/><rect x="4.6" y="3" width="2.2" height="10" rx="1.1"/>' +
    '<rect x="8.2" y="1" width="2.2" height="14" rx="1.1"/><rect x="11.8" y="5" width="2.2" height="6" rx="1.1"/></svg>';

  const badgeInner = (d) =>
    `${ICON}<span class="q-label">${esc(d.label)}</span>` +
    (d.spec ? `<small class="q-spec">${esc(d.spec)}</small>` : '') +
    (d.codec && (d.tier === 'hires' || d.tier === 'lossless' || d.tier === 'atmos')
      ? `<span class="q-codec">${esc(d.codec)}</span>`
      : '');

  // ---------------------------------------------------------------- lencana di pemutar, mini, & Now Playing
  function update(t) {
    if (RD.compare) RD.compare.syncTrack();
    const d = t && describe(t);

    for (const sel of ['#np-quality', '#mb-quality', '#npov-quality']) {
      const el = $(sel);
      if (!el) continue;
      if (!d) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      el.className = 'q-badge tier-' + d.tier;
      el.innerHTML = badgeInner(d);
      el.title = `${d.label} (${d.detail})\nKlik untuk rincian sinyal & perbandingan kualitas A/B`;
    }

    if ($('#drawer')?.classList.contains('open') && RD.S.tab === 'quality') renderTab();
  }

  // ---------------------------------------------------------------- tab "Kualitas"
  function row(k, v) {
    return v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '';
  }

  function pathHtml(t) {
    const f = t.fmt || {};
    const d = describe(t);
    const eq = (RD.S.settings && RD.S.settings.eq) || {};
    const eqOn = eq.enabled !== false && ((eq.gains || []).some((g) => g) || eq.preamp);
    const ctxRate = RD.engine && RD.engine.ctx ? RD.engine.ctx.sampleRate : 0;
    const resample = f.sampleRate && ctxRate && f.sampleRate !== ctxRate;

    const steps = [
      [
        'Sumber',
        join([
          d ? d.codec : f.codec,
          join([f.bitDepth ? `${f.bitDepth}-bit` : (d && d.tier === 'lossless' ? '16-bit' : ''), khz(f.sampleRate || 44100)], ' / '),
          chName(f.channels || 2),
        ]),
        '',
      ],
      ['Equalizer', eqOn ? 'Aktif, mengubah sinyal' : 'Datar / nonaktif', eqOn ? 'warn' : ''],
      ['Pembatas', 'Selalu aktif (ambang −0,5 dB)', ''],
      ['Keluaran', ctxRate ? `Web Audio · ${khz(ctxRate)} · float 32-bit` : 'Web Audio', resample ? 'warn' : ''],
    ];
    const notes = [];
    if (resample) notes.push(`Laju sampel diubah (resampling) dari ${khz(f.sampleRate)} ke ${khz(ctxRate)} sebelum ke perangkat.`);
    if (eqOn) notes.push('Equalizer aktif, jadi sinyal yang keluar berbeda dari isi file.');
    notes.push('Aplikasi ini memutar lewat Web Audio. Lencana di atas menampilkan resolusi dan codec asli file audio Anda.');
    if (d && d.tier === 'atmos') notes.push('File ini bertanda Dolby Atmos, dirender ke stereo/surround standar.');
    return (
      `<ol class="path">${steps.map(([k, v, c]) => `<li class="${c}"><b>${k}</b><span>${esc(v)}</span></li>`).join('')}</ol>` +
      `<p class="path-note">${notes.map(esc).join(' ')}</p>`
    );
  }

  function renderTab() {
    const el = $('#tab-quality');
    if (!el) return;
    const t = current();
    if (!t) {
      el.innerHTML = '<div class="q-empty">Putar sebuah lagu untuk melihat rincian format dan membandingkan kualitasnya.</div>';
      return;
    }
    const f = t.fmt || {};
    const d = describe(t);
    const isLossless = d && (d.tier === 'hires' || d.tier === 'lossless');
    const tf = isLossless ? 'Ya (Lossless)' : 'Tidak (Lossy)';
    el.innerHTML = `<div class="qt">
      <div class="qt-head">
        ${d ? `<span class="q-badge tier-${d.tier}">${badgeInner(d)}</span>` : ''}
        <div class="qt-title">${esc(t.title)}</div>
      </div>
      <h3>Format &amp; Resolusi Asli</h3>
      <dl class="qt-dl">
        ${row('Kualitas', d ? d.label : '')}
        ${row('Codec', d ? d.codec : f.codec)}
        ${row('Lossless', tf)}
        ${row('Laju sampel', khz(f.sampleRate || 44100))}
        ${row('Kedalaman bit', f.bitDepth ? `${f.bitDepth}-bit` : (isLossless ? '16-bit' : 'tidak berlaku'))}
        ${row('Kanal', chName(f.channels || 2))}
        ${row('Bitrate', (f.bitrate || t.bitrate) ? `${f.vbr ? '~' : ''}${f.bitrate || t.bitrate} kbps${f.vbr ? ' (VBR)' : ''}` : '')}
        ${row('Ukuran file', t.size ? mb(t.size) : '')}
      </dl>
      <h3>Jalur sinyal</h3>
      ${pathHtml(t)}
      <h3>Bandingkan kualitas (A/B)</h3>
      <div id="ab-box"></div>
    </div>`;
    if (RD.compare) RD.compare.mount($('#ab-box'));
  }

  function showTab() {
    renderTab();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#np-quality, #mb-quality, #npov-quality') && RD.openDrawer) {
      const ov = $('#nowplaying');
      if (ov && ov.classList.contains('open') && RD.nowPlaying) RD.nowPlaying.close();
      RD.openDrawer('quality');
    }
  });

  RD.quality = { describe, badgeInner, update, showTab, renderTab, current };
})();
