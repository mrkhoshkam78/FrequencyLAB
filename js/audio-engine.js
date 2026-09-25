/**
 * Frequency Lab — Optimized Real-Time Audio Engine
 * Binaural / Monaural / Isochronic / Pure + Ambient (rain, thunder, forest, fire, night)
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.fadeGain = null;
    this.leftGain = this.rightGain = null;
    this.leftOsc = this.rightOsc = this.monoOsc = this.lfo = null;
    this.lfoGain = this.gateGain = null;
    this.noiseNode = this.noiseGain = this.noiseFilter = null;
    this.ambientNodes = [];
    this.merger = this.splitL = this.splitR = null;
    this.analyser = this.analyserL = this.analyserR = null;
    this.isPlaying = false;
    this.mode = 'binaural';
    this.params = {
      carrier: 200, beat: 10, left: 195, right: 205,
      waveform: 'sine', volume: 0.28, balance: 0,
      duration: 0, noise: 'none', noiseLevel: 0.06,
      fadeIn: 1.0, fadeOut: 1.2, ambient: null
    };
    this.durationTimer = null;
    this._onEnded = null;
    this._rampT = 0.04;
    this._ambTimers = [];
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.fadeGain = this.ctx.createGain();
    this.fadeGain.gain.value = 0;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.params.volume;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;
    this.analyserL = this.ctx.createAnalyser();
    this.analyserR = this.ctx.createAnalyser();
    this.analyserL.fftSize = 1024;
    this.analyserR.fftSize = 1024;
    this.fadeGain.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  async ensureRunning() {
    await this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  _ramp(param, value, t) {
    if (!param || !this.ctx) return;
    const n = this._now();
    const d = t != null ? t : this._rampT;
    try {
      param.cancelScheduledValues(n);
      param.setValueAtTime(param.value, n);
      param.linearRampToValueAtTime(value, n + d);
    } catch (_) { param.value = value; }
  }

  setVolume(v) {
    this.params.volume = Math.max(0, Math.min(0.8, v));
    if (this.masterGain) this._ramp(this.masterGain.gain, this.params.volume, 0.05);
  }

  setBalance(b) {
    this.params.balance = Math.max(-1, Math.min(1, b));
    const L = this.params.balance <= 0 ? 1 : 1 - this.params.balance;
    const R = this.params.balance >= 0 ? 1 : 1 + this.params.balance;
    if (this.leftGain) this._ramp(this.leftGain.gain, L * 0.5, 0.05);
    if (this.rightGain) this._ramp(this.rightGain.gain, R * 0.5, 0.05);
  }

  setCarrier(hz) {
    this.params.carrier = Math.max(20, Math.min(2000, hz));
    if (this.mode === 'binaural') this._applyBinaural();
    else if (this.monoOsc) this._ramp(this.monoOsc.frequency, this.params.carrier, 0.06);
  }

  setBeat(hz) {
    this.params.beat = Math.max(0.1, Math.min(80, hz));
    if (this.mode === 'binaural') this._applyBinaural();
    else if (this.lfo) this._ramp(this.lfo.frequency, this.params.beat, 0.06);
  }

  setLeft(hz) {
    this.params.left = Math.max(20, Math.min(2000, hz));
    if (this.mode === 'binaural') {
      this.params.beat = Math.abs(this.params.right - this.params.left);
      this.params.carrier = (this.params.left + this.params.right) / 2;
      if (this.leftOsc) this._ramp(this.leftOsc.frequency, this.params.left, 0.06);
    }
  }

  setRight(hz) {
    this.params.right = Math.max(20, Math.min(2000, hz));
    if (this.mode === 'binaural') {
      this.params.beat = Math.abs(this.params.right - this.params.left);
      this.params.carrier = (this.params.left + this.params.right) / 2;
      if (this.rightOsc) this._ramp(this.rightOsc.frequency, this.params.right, 0.06);
    }
  }

  _applyBinaural() {
    this.params.left = this.params.carrier - this.params.beat / 2;
    this.params.right = this.params.carrier + this.params.beat / 2;
    if (this.leftOsc) this._ramp(this.leftOsc.frequency, this.params.left, 0.06);
    if (this.rightOsc) this._ramp(this.rightOsc.frequency, this.params.right, 0.06);
  }

  setWaveform(type) {
    if (!['sine', 'square', 'triangle', 'sawtooth'].includes(type)) return;
    this.params.waveform = type;
    if (this.leftOsc) this.leftOsc.type = type;
    if (this.rightOsc) this.rightOsc.type = type;
    if (this.monoOsc) this.monoOsc.type = type;
  }

  setNoise(type) {
    this.params.noise = type;
    if (!this.isPlaying || this.mode === 'ambient') return;
    this._stopNoise();
    if (type && type !== 'none') this._startNoise(type, this.params.noiseLevel);
  }

  setFadeIn(s) { this.params.fadeIn = Math.max(0.05, s); }
  setFadeOut(s) { this.params.fadeOut = Math.max(0.05, s); }

  async play(opts) {
    await this.ensureRunning();
    Object.assign(this.params, opts || {});
    if (opts && (opts.carrier != null || opts.beat != null) && this.params.mode !== 'ambient') {
      this.params.left = this.params.carrier - this.params.beat / 2;
      this.params.right = this.params.carrier + this.params.beat / 2;
    }
    const nextMode = (opts && opts.mode) || this.mode;

    if (this.isPlaying && nextMode === this.mode && nextMode !== 'ambient') {
      this.setVolume(this.params.volume);
      this.setBalance(this.params.balance);
      this.setWaveform(this.params.waveform);
      if (this.mode === 'binaural') this._applyBinaural();
      else { this.setCarrier(this.params.carrier); this.setBeat(this.params.beat); }
      if (opts && opts.noise != null) this.setNoise(opts.noise);
      return;
    }

    await this._stopInternal(false);
    this.mode = nextMode;
    this.params.mode = this.mode;
    const t = this._now();

    this.splitL = this.ctx.createGain();
    this.splitR = this.ctx.createGain();
    this.splitL.connect(this.analyserL);
    this.splitR.connect(this.analyserR);

    if (this.mode === 'ambient') {
      this._startAmbient(this.params.ambient || 'rain');
    } else {
      this.merger = this.ctx.createChannelMerger(2);
      this.leftGain = this.ctx.createGain();
      this.rightGain = this.ctx.createGain();
      this.leftGain.gain.value = 0.5;
      this.rightGain.gain.value = 0.5;

      if (this.mode === 'binaural') {
        this.leftOsc = this.ctx.createOscillator();
        this.rightOsc = this.ctx.createOscillator();
        this.leftOsc.type = this.params.waveform;
        this.rightOsc.type = this.params.waveform;
        this.leftOsc.frequency.setValueAtTime(this.params.left, t);
        this.rightOsc.frequency.setValueAtTime(this.params.right, t);
        this.leftOsc.connect(this.leftGain);
        this.rightOsc.connect(this.rightGain);
        this.leftGain.connect(this.merger, 0, 0);
        this.rightGain.connect(this.merger, 0, 1);
        this.leftGain.connect(this.splitL);
        this.rightGain.connect(this.splitR);
        this.merger.connect(this.fadeGain);
        this.leftOsc.start(t);
        this.rightOsc.start(t);
      } else if (this.mode === 'monaural' || this.mode === 'isochronic') {
        this.monoOsc = this.ctx.createOscillator();
        this.monoOsc.type = this.params.waveform;
        this.monoOsc.frequency.setValueAtTime(this.params.carrier, t);
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = this.mode === 'isochronic' ? 'square' : 'sine';
        this.lfo.frequency.setValueAtTime(this.params.beat, t);
        this.lfoGain = this.ctx.createGain();
        this.lfoGain.gain.value = 0.5;
        const amp = this.ctx.createGain();
        amp.gain.value = 0.5;
        this.lfo.connect(this.lfoGain);
        this.lfoGain.connect(amp.gain);
        this.monoOsc.connect(amp);
        amp.connect(this.fadeGain);
        amp.connect(this.splitL);
        amp.connect(this.splitR);
        this.monoOsc.start(t);
        this.lfo.start(t);
      } else {
        this.monoOsc = this.ctx.createOscillator();
        this.monoOsc.type = this.params.waveform;
        this.monoOsc.frequency.setValueAtTime(this.params.carrier, t);
        this.monoOsc.connect(this.fadeGain);
        this.monoOsc.connect(this.splitL);
        this.monoOsc.connect(this.splitR);
        this.monoOsc.start(t);
      }

      this.setBalance(this.params.balance);
      if (this.params.noise && this.params.noise !== 'none') {
        this._startNoise(this.params.noise, this.params.noiseLevel);
      }
    }

    this.setVolume(this.params.volume);
    this.fadeGain.gain.cancelScheduledValues(t);
    this.fadeGain.gain.setValueAtTime(0, t);
    this.fadeGain.gain.linearRampToValueAtTime(1, t + this.params.fadeIn);
    this.isPlaying = true;

    if (this.params.duration > 0) {
      this.durationTimer = setTimeout(() => this.stop(),
        (this.params.duration) * 1000);
    }
  }

  async stop() {
    if (!this.isPlaying) return;
    const t = this._now();
    if (this.fadeGain) {
      this.fadeGain.gain.cancelScheduledValues(t);
      this.fadeGain.gain.setValueAtTime(this.fadeGain.gain.value, t);
      this.fadeGain.gain.linearRampToValueAtTime(0, t + this.params.fadeOut);
    }
    await new Promise(r => setTimeout(r, this.params.fadeOut * 1000 + 20));
    await this._stopInternal(true);
  }

  async _stopInternal(notify) {
    if (this.durationTimer) { clearTimeout(this.durationTimer); this.durationTimer = null; }
    this._ambTimers.forEach(clearTimeout);
    this._ambTimers = [];
    const kill = n => { if (n) try { n.stop(); n.disconnect(); } catch (_) {} };
    kill(this.leftOsc); kill(this.rightOsc); kill(this.monoOsc); kill(this.lfo);
    this._stopNoise();
    this.ambientNodes.forEach(n => { try { if (n.stop) n.stop(); n.disconnect(); } catch (_) {} });
    this.ambientNodes = [];
    [this.lfoGain, this.gateGain, this.leftGain, this.rightGain, this.merger, this.splitL, this.splitR]
      .forEach(n => { if (n) try { n.disconnect(); } catch (_) {} });
    this.leftOsc = this.rightOsc = this.monoOsc = this.lfo = null;
    this.lfoGain = this.gateGain = this.leftGain = this.rightGain = null;
    this.merger = this.splitL = this.splitR = null;
    this.isPlaying = false;
    if (notify && this._onEnded) this._onEnded();
  }

  _noiseBuffer(type) {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        d[i] = (last + 0.02 * w) / 1.02;
        last = d[i];
        d[i] *= 3.5;
      }
    }
    return buf;
  }

  _startNoise(type, level) {
    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = this._noiseBuffer(type);
    this.noiseNode.loop = true;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = level;
    this.noiseNode.connect(this.noiseGain);
    this.noiseGain.connect(this.fadeGain);
    this.noiseNode.start();
  }

  _stopNoise() {
    if (this.noiseNode) try { this.noiseNode.stop(); this.noiseNode.disconnect(); } catch (_) {}
    if (this.noiseGain) try { this.noiseGain.disconnect(); } catch (_) {}
    if (this.noiseFilter) try { this.noiseFilter.disconnect(); } catch (_) {}
    this.noiseNode = this.noiseGain = this.noiseFilter = null;
  }

  /** Procedural ambient: rain | thunder | forest | fire | night */
  _startAmbient(kind) {
    const t = this._now();
    const mix = this.ctx.createGain();
    mix.gain.value = 1;
    mix.connect(this.fadeGain);
    mix.connect(this.splitL);
    mix.connect(this.splitR);
    this.ambientNodes.push(mix);

    const addNoise = (type, gain, filterType, freq, Q) => {
      const src = this.ctx.createBufferSource();
      src.buffer = this._noiseBuffer(type);
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      const f = this.ctx.createBiquadFilter();
      f.type = filterType || 'lowpass';
      f.frequency.value = freq || 1000;
      if (Q) f.Q.value = Q;
      src.connect(f);
      f.connect(g);
      g.connect(mix);
      src.start(t);
      this.ambientNodes.push(src, g, f);
      return { src, g, f };
    };

    if (kind === 'rain') {
      addNoise('white', 0.22, 'bandpass', 1200, 0.6);
      addNoise('pink', 0.12, 'lowpass', 800);
      // occasional drop clicks
      const drop = () => {
        if (!this.isPlaying || this.mode !== 'ambient') return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.frequency.value = 800 + Math.random() * 1200;
        o.type = 'sine';
        const now = this._now();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.04, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        o.connect(g); g.connect(mix);
        o.start(now); o.stop(now + 0.1);
        this._ambTimers.push(setTimeout(drop, 80 + Math.random() * 200));
      };
      drop();
    } else if (kind === 'thunder') {
      addNoise('brown', 0.18, 'lowpass', 200);
      addNoise('pink', 0.08, 'lowpass', 400);
      const boom = () => {
        if (!this.isPlaying || this.mode !== 'ambient') return;
        const now = this._now();
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer('brown');
        const g = this.ctx.createGain();
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(80, now);
        f.frequency.exponentialRampToValueAtTime(30, now + 2.5);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.55, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + 3);
        src.connect(f); f.connect(g); g.connect(mix);
        src.start(now); src.stop(now + 3.2);
        this._ambTimers.push(setTimeout(boom, 4000 + Math.random() * 8000));
      };
      this._ambTimers.push(setTimeout(boom, 1500));
    } else if (kind === 'forest') {
      addNoise('pink', 0.06, 'lowpass', 600);
      addNoise('brown', 0.04, 'lowpass', 300);
      const bird = () => {
        if (!this.isPlaying || this.mode !== 'ambient') return;
        const now = this._now();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const base = 1500 + Math.random() * 2500;
        o.type = 'sine';
        o.frequency.setValueAtTime(base, now);
        o.frequency.linearRampToValueAtTime(base * (0.85 + Math.random() * 0.3), now + 0.12);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.06, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        o.connect(g); g.connect(mix);
        o.start(now); o.stop(now + 0.25);
        this._ambTimers.push(setTimeout(bird, 600 + Math.random() * 2500));
      };
      bird();
    } else if (kind === 'fire') {
      const n = addNoise('pink', 0.2, 'bandpass', 900, 1.2);
      // crackle modulation
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      lfo.frequency.value = 8 + Math.random() * 6;
      lg.gain.value = 0.08;
      lfo.connect(lg);
      lg.connect(n.g.gain);
      lfo.start(t);
      this.ambientNodes.push(lfo, lg);
      const crack = () => {
        if (!this.isPlaying || this.mode !== 'ambient') return;
        const now = this._now();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = 100 + Math.random() * 400;
        g.gain.setValueAtTime(0.08, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        o.connect(g); g.connect(mix);
        o.start(now); o.stop(now + 0.06);
        this._ambTimers.push(setTimeout(crack, 50 + Math.random() * 300));
      };
      crack();
    } else if (kind === 'night') {
      addNoise('brown', 0.1, 'lowpass', 250);
      addNoise('pink', 0.03, 'lowpass', 500);
      const cricket = () => {
        if (!this.isPlaying || this.mode !== 'ambient') return;
        const now = this._now();
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.value = 3500 + Math.random() * 1500;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.015, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        o.connect(g); g.connect(mix);
        o.start(now); o.stop(now + 0.05);
        this._ambTimers.push(setTimeout(cricket, 40 + Math.random() * 120));
      };
      // intermittent cricket bursts
      const burst = () => {
        if (!this.isPlaying || this.mode !== 'ambient') return;
        let n = 0;
        const tick = () => {
          if (n++ < 8) { cricket(); this._ambTimers.push(setTimeout(tick, 50)); }
          else this._ambTimers.push(setTimeout(burst, 2000 + Math.random() * 4000));
        };
        tick();
      };
      this._ambTimers.push(setTimeout(burst, 500));
    } else {
      addNoise('pink', 0.15, 'lowpass', 1000);
    }
  }

  getTimeDomainData() {
    if (!this.analyser) return null;
    const a = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(a);
    return a;
  }
  getFrequencyData() {
    if (!this.analyser) return null;
    const a = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(a);
    return a;
  }
  getLeftTimeData() {
    if (!this.analyserL) return null;
    const a = new Uint8Array(this.analyserL.frequencyBinCount);
    this.analyserL.getByteTimeDomainData(a);
    return a;
  }
  getRightTimeData() {
    if (!this.analyserR) return null;
    const a = new Uint8Array(this.analyserR.frequencyBinCount);
    this.analyserR.getByteTimeDomainData(a);
    return a;
  }
  getState() {
    return { isPlaying: this.isPlaying, mode: this.mode, ...this.params,
      beatActual: Math.abs(this.params.right - this.params.left) };
  }
}
window.AudioEngine = AudioEngine;
