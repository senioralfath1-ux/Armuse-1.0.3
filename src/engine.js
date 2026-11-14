'use strict';
/*
 * Mesin audio: <audio> -> preamp -> 10 filter biquad -> limiter -> master -> speaker
 *                                                          \-> analyser (spektrum)
 * Semua pemrosesan memakai Web Audio API, berjalan lokal di perangkat.
 */
(function () {
  const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  // Preset bawaan (dB per band, urut sesuai EQ_BANDS)
  const EQ_PRESETS = {
    'Flat':        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Bass tebal':  [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
    'Treble jernih': [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
    'Vokal':       [-2, -2, -1, 1, 3, 4, 3, 1, 0, -1],
    'Rock':        [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
    'Pop':         [-1, 1, 3, 4, 3, 0, -1, -1, 1, 2],
    'Jazz':        [3, 2, 1, 2, -2, -2, 0, 1, 2, 3],
    'Klasik':      [4, 3, 2, 2, -1, -1, 0, 2, 3, 4],
    'Elektronik':  [5, 4, 1, 0, -2, 2, 1, 1, 4, 5],
    'Akustik':     [4, 4, 3, 1, 1, 1, 3, 3, 3, 2],
    'Loudness':    [6, 4, 0, 0, -1, 0, -1, 0, 4, 2],
  };

  class AudioEngine {
    constructor(audioEl) {
      this.audio = audioEl;
      audioEl.crossOrigin = 'anonymous'; // wajib agar Web Audio boleh membaca media:// (CORS)
      const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      this.source = ctx.createMediaElementSource(audioEl);

      this.pre = ctx.createGain();
      this.filters = EQ_BANDS.map((f, i) => {
        const b = ctx.createBiquadFilter();
        b.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
        b.frequency.value = f;
        b.Q.value = 1.1;
        b.gain.value = 0;
        return b;
      });

      // Limiter di 0 dBFS: transparan di bawah batas, mencegah suara pecah saat band dinaikkan.
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -0.5;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.15;

      this.master = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.82;
      this.spectrum = new Uint8Array(this.analyser.frequencyBinCount);

      // Jalur A (file asli) lewat gainA agar bisa dibisukan saat perbandingan A/B (lihat attachCompare)
      this.gainA = ctx.createGain();
      this.source.connect(this.gainA);
      this.gainA.connect(this.pre);
      let node = this.pre;
      for (const f of this.filters) { node.connect(f); node = f; }
      node.connect(this.limiter);
      this.limiter.connect(this.master);
      this.limiter.connect(this.analyser);
      this.master.connect(ctx.destination);

      this.enabled = true;
      this.gains = EQ_BANDS.map(() => 0);
      this.preampDb = 0;
      this.volume = 0.8;
    }

    resume() { if (this.ctx.state === 'suspended') return this.ctx.resume(); }

    _ramp(param, value) { param.setTargetAtTime(value, this.ctx.currentTime, 0.02); }

    apply() {
      this.filters.forEach((f, i) => this._ramp(f.gain, this.enabled ? this.gains[i] : 0));
      this._ramp(this.pre.gain, this.enabled ? Math.pow(10, this.preampDb / 20) : 1);
    }

    setEnabled(on) { this.enabled = !!on; this.apply(); }
    setGains(arr) { this.gains = arr.slice(); this.apply(); }
    setBand(i, db) { this.gains[i] = db; this.apply(); }
    setPreamp(db) { this.preampDb = db; this.apply(); }

    // Kurva perceptual agar slider volume terasa wajar
    setVolume(v) { this.volume = v; this._ramp(this.master.gain, v * v); }

    /** Respons frekuensi gabungan (dB) pada n titik logaritmik 20 Hz - 20 kHz. */
    response(n = 200) {
      const freqs = new Float32Array(n);
      for (let i = 0; i < n; i++) freqs[i] = 20 * Math.pow(1000, i / (n - 1));
      const total = new Float32Array(n).fill(1);
      const mag = new Float32Array(n);
      const ph = new Float32Array(n);
      for (const f of this.filters) {
        f.getFrequencyResponse(freqs, mag, ph);
        for (let i = 0; i < n; i++) total[i] *= mag[i];
      }
      const pre = this.enabled ? this.preampDb : 0;
      return Array.from(total, (m) => 20 * Math.log10(m || 1e-6) + pre);
    }

    /** Sambungkan elemen <audio> kedua (versi terkompresi) ke rantai yang sama. */
    attachCompare(el) {
      el.crossOrigin = 'anonymous';
      this.sourceB = this.ctx.createMediaElementSource(el);
      this.gainB = this.ctx.createGain();
      this.gainB.gain.value = 0;
      this.sourceB.connect(this.gainB);
      this.gainB.connect(this.pre);
    }

    /** which: 'A' (asli) atau 'B' (pembanding); offsetDb: koreksi level untuk B. Perpindahan instan. */
    setCompare(which, offsetDb = 0) {
      const t = this.ctx.currentTime;
      this.gainA.gain.setTargetAtTime(which === 'A' ? 1 : 0, t, 0.006);
      if (this.gainB) this.gainB.gain.setTargetAtTime(which === 'B' ? Math.pow(10, offsetDb / 20) : 0, t, 0.006);
    }

    readSpectrum() {
      this.analyser.getByteFrequencyData(this.spectrum);
      return this.spectrum;
    }
  }

  window.AudioEngine = AudioEngine;
  window.EQ_BANDS = EQ_BANDS;
  window.EQ_PRESETS = EQ_PRESETS;
})();
