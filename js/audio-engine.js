/**
 * Frequency Lab — Real-Time Web Audio Engine v2
 * True binaural (independent L/R oscillators), live parameter updates,
 * fade in/out, stereo balance, noise, no clicks/glitches.
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.fadeGain = null;
    this.leftGain = null;
    this.rightGain = null;
    this.leftOsc = null;
    this.rightOsc = null;
    this.monoOsc = null;
    this.lfo = null;
    this.lfoGain = null;
    this.gateGain = null;
    this.noiseNode = null;
    this.noiseGain = null;
    this.merger = null;
    this.analyser = null;
    this.analyserL = null;
    this.analyserR = null;
    this.splitL = null;
    this.splitR = null;

    this.isPlaying = false;
    this.mode = 'binaural';
    this.params = {
      carrier: 200,
      beat: 10,
      left: 195,
      right: 205,
      waveform: 'sine',
      volume: 0.28,
      balance: 0,       // -1 left … +1 right
      duration: 0,      // 0 = infinite
      noise: 'none',
      noiseLevel: 0.06,
      fadeIn: 1.2,
      fadeOut: 1.5
    };
    this.durationTimer = null;
    this._onEnded = null;
    this._rampTime = 0.04; // smooth param changes
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    // Master chain: fadeGain → masterGain → analyser → destination
    this.fadeGain = this.ctx.createGain();
    this.fadeGain.gain.value = 0;
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.params.volume;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.75;

    // Per-channel analysers for L/R visualization
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

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  _ramp(param, value, time) {
    if (!param) return;
    const t = this._now();
    const dur = time != null ? time : this._rampTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(value, t + dur);
  }

  // ── Live setters (safe while playing) ──────────────────────────

  setVolume(v) {
    this.params.volume = Math.max(0, Math.min(0.85, v)); // hard cap to prevent clipping
    if (this.masterGain) this._ramp(this.masterGain.gain, this.params.volume, 0.05);
  }

  setBalance(b) {
    // -1 = full left, 0 = center, +1 = full right
    this.params.balance = Math.max(-1, Math.min(1, b));
    const left = this.params.balance <= 0 ? 1 : 1 - this.params.balance;
    const right = this.params.balance >= 0 ? 1 : 1 + this.params.balance;
    if (this.leftGain) this._ramp(this.leftGain.gain, left * 0.5, 0.05);
    if (this.rightGain) this._ramp(this.rightGain.gain, right * 0.5, 0.05);
  }

  setCarrier(hz) {
    this.params.carrier = Math.max(20, Math.min(2000, hz));
    if (this.mode === 'binaural') {
      this._applyBinauralFreqs();
    } else if (this.monoOsc) {
      this._ramp(this.monoOsc.frequency, this.params.carrier, 0.06);
    }
  }

  setBeat(hz) {
    this.params.beat = Math.max(0.1, Math.min(80, hz));
    if (this.mode === 'binaural') {
      this._applyBinauralFreqs();
    } else if (this.lfo) {
      this._ramp(this.lfo.frequency, this.params.beat, 0.06);
    }
  }

  setLeft(hz) {
    this.params.left = Math.max(20, Math.min(2000, hz));
    // Recompute beat from L/R when user sets left manually
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

  _applyBinauralFreqs() {
    // Canonical relation: Left = Carrier - Beat/2, Right = Carrier + Beat/2
    this.params.left = this.params.carrier - this.params.beat / 2;
    this.params.right = this.params.carrier + this.params.beat / 2;
    if (this.leftOsc) this._ramp(this.leftOsc.frequency, this.params.left, 0.06);
    if (this.rightOsc) this._ramp(this.rightOsc.frequency, this.params.right, 0.06);
  }

  setWaveform(type) {
    const allowed = ['sine', 'square', 'triangle', 'sawtooth'];
    if (!allowed.includes(type)) return;
    this.params.waveform = type;
    if (this.leftOsc) this.leftOsc.type = type;
    if (this.rightOsc) this.rightOsc.type = type;
    if (this.monoOsc) this.monoOsc.type = type;
  }

  setNoise(type) {
    this.params.noise = type;
    if (!this.isPlaying) return;
    // Restart noise path smoothly
    this._stopNoise();
    if (type && type !== 'none') this._startNoise(type, this.params.noiseLevel);
  }

  setFadeIn(sec) { this.params.fadeIn = Math.max(0.05, sec); }
  setFadeOut(sec) { this.params.fadeOut = Math.max(0.05, sec); }

  // ── Build / Play ───────────────────────────────────────────────

  async play(opts = {}) {
    await this.ensureRunning();

    // Merge options
    Object.assign(this.params, opts);
    if (opts.carrier != null || opts.beat != null) {
      this.params.left = this.params.carrier - this.params.beat / 2;
      this.params.right = this.params.carrier + this.params.beat / 2;
    }

    // If already playing same mode, just update params live
    if (this.isPlaying && this.mode === (opts.mode || this.mode)) {
      this.setVolume(this.params.volume);
      this.setBalance(this.params.balance);
      this.setWaveform(this.params.waveform);
      if (this.mode === 'binaural') this._applyBinauralFreqs();
      else {
        this.setCarrier(this.params.carrier);
        this.setBeat(this.params.beat);
      }
      if (opts.noise != null) this.setNoise(opts.noise);
      return;
    }

    // Full rebuild
    await this._stopInternal(false);
    this.mode = opts.mode || this.mode || 'binaural';
    this.params.mode = this.mode;

    const t = this._now();
    this.merger = this.ctx.createChannelMerger(2);
    this.leftGain = this.ctx.createGain();
    this.rightGain = this.ctx.createGain();
    this.leftGain.gain.value = 0.5;
    this.rightGain.gain.value = 0.5;

    // Wire analysers for L/R
    this.splitL = this.ctx.createGain();
    this.splitR = this.ctx.createGain();
    this.splitL.connect(this.analyserL);
    this.splitR.connect(this.analyserR);

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
    } else if (this.mode === 'monaural') {
      this.monoOsc = this.ctx.createOscillator();
      this.monoOsc.type = this.params.waveform;
      this.monoOsc.frequency.setValueAtTime(this.params.carrier, t);

      this.lfo = this.ctx.createOscillator();
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
    } else if (this.mode === 'isochronic') {
      this.monoOsc = this.ctx.createOscillator();
      this.monoOsc.type = this.params.waveform;
      this.monoOsc.frequency.setValueAtTime(this.params.carrier, t);

      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'square';
      this.lfo.frequency.setValueAtTime(this.params.beat, t);
      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.value = 0.5;

      this.gateGain = this.ctx.createGain();
      this.gateGain.gain.value = 0.5;
      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(this.gateGain.gain);
      this.monoOsc.connect(this.gateGain);
      this.gateGain.connect(this.fadeGain);
      this.gateGain.connect(this.splitL);
      this.gateGain.connect(this.splitR);

      this.monoOsc.start(t);
      this.lfo.start(t);
    } else {
      // pure
      this.monoOsc = this.ctx.createOscillator();
      this.monoOsc.type = this.params.waveform;
      this.monoOsc.frequency.setValueAtTime(this.params.carrier, t);
      this.monoOsc.connect(this.fadeGain);
      this.monoOsc.connect(this.splitL);
      this.monoOsc.connect(this.splitR);
      this.monoOsc.start(t);
    }

    this.setBalance(this.params.balance);
    this.setVolume(this.params.volume);

    if (this.params.noise && this.params.noise !== 'none') {
      this._startNoise(this.params.noise, this.params.noiseLevel);
    }

    // Fade in
    this.fadeGain.gain.cancelScheduledValues(t);
    this.fadeGain.gain.setValueAtTime(0, t);
    this.fadeGain.gain.linearRampToValueAtTime(1, t + this.params.fadeIn);

    this.isPlaying = true;

    if (this.params.duration > 0) {
      const totalMs = (this.params.duration + this.params.fadeOut) * 1000;
      this.durationTimer = setTimeout(() => this.stop(), totalMs - this.params.fadeOut * 1000);
    }
  }

  async stop() {
    if (!this.isPlaying) return;
    const t = this._now();
    // Fade out then stop
    if (this.fadeGain) {
      this.fadeGain.gain.cancelScheduledValues(t);
      this.fadeGain.gain.setValueAtTime(this.fadeGain.gain.value, t);
      this.fadeGain.gain.linearRampToValueAtTime(0, t + this.params.fadeOut);
    }
    await new Promise(r => setTimeout(r, this.params.fadeOut * 1000 + 30));
    await this._stopInternal(true);
  }

  async _stopInternal(notify) {
    if (this.durationTimer) {
      clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }
    const kill = (n) => {
      if (!n) return;
      try { n.stop(); n.disconnect(); } catch (_) {}
    };
    kill(this.leftOsc);
    kill(this.rightOsc);
    kill(this.monoOsc);
    kill(this.lfo);
    this._stopNoise();
    [this.lfoGain, this.gateGain, this.leftGain, this.rightGain,
     this.merger, this.splitL, this.splitR].forEach(n => {
      if (n) try { n.disconnect(); } catch (_) {}
    });
    this.leftOsc = this.rightOsc = this.monoOsc = this.lfo = null;
    this.lfoGain = this.gateGain = this.leftGain = this.rightGain = null;
    this.merger = this.splitL = this.splitR = null;
    this.isPlaying = false;
    if (notify && this._onEnded) this._onEnded();
  }

  _stopNoise() {
    if (this.noiseNode) {
      try { this.noiseNode.stop(); this.noiseNode.disconnect(); } catch (_) {}
    }
    if (this.noiseGain) try { this.noiseGain.disconnect(); } catch (_) {}
    this.noiseNode = this.noiseGain = null;
  }

  _startNoise(type, level) {
    const bufferSize = 2 * this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (last + 0.02 * white) / 1.02;
        last = data[i];
        data[i] *= 3.5;
      }
    }

    this.noiseNode = this.ctx.createBufferSource();
    this.noiseNode.buffer = buffer;
    this.noiseNode.loop = true;
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = level;
    this.noiseNode.connect(this.noiseGain);
    this.noiseGain.connect(this.fadeGain);
    this.noiseNode.start();
  }

  // ── Analysis data for visualizer ───────────────────────────────

  getTimeDomainData() {
    if (!this.analyser) return null;
    const arr = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(arr);
    return arr;
  }

  getFrequencyData() {
    if (!this.analyser) return null;
    const arr = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(arr);
    return arr;
  }

  getLeftTimeData() {
    if (!this.analyserL) return null;
    const arr = new Uint8Array(this.analyserL.frequencyBinCount);
    this.analyserL.getByteTimeDomainData(arr);
    return arr;
  }

  getRightTimeData() {
    if (!this.analyserR) return null;
    const arr = new Uint8Array(this.analyserR.frequencyBinCount);
    this.analyserR.getByteTimeDomainData(arr);
    return arr;
  }

  getState() {
    return {
      isPlaying: this.isPlaying,
      mode: this.mode,
      ...this.params,
      left: this.params.left,
      right: this.params.right,
      beatActual: Math.abs(this.params.right - this.params.left)
    };
  }
}

window.AudioEngine = AudioEngine;
