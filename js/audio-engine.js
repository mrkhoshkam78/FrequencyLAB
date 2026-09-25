/**
 * Frequency Lab — Web Audio Engine
 * Real-time generation: Binaural, Monaural, Isochronic, Pure Tone + Noise
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.leftOsc = null;
    this.rightOsc = null;
    this.monoOsc = null;
    this.lfo = null;
    this.lfoGain = null;
    this.noiseNode = null;
    this.noiseGain = null;
    this.isPlaying = false;
    this.mode = 'binaural';
    this.durationTimer = null;
    this.analyser = null;
    this._onEnded = null;
  }

  async init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  async ensureRunning() {
    await this.init();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setVolume(v) {
    // v: 0–1
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), this.ctx.currentTime, 0.02);
    }
  }

  stop() {
    if (this.durationTimer) {
      clearTimeout(this.durationTimer);
      this.durationTimer = null;
    }
    const stopNode = (n) => {
      if (!n) return;
      try {
        n.stop();
        n.disconnect();
      } catch (_) {}
    };
    stopNode(this.leftOsc);
    stopNode(this.rightOsc);
    stopNode(this.monoOsc);
    stopNode(this.lfo);
    if (this.lfoGain) try { this.lfoGain.disconnect(); } catch (_) {}
    if (this.noiseNode) {
      try { this.noiseNode.stop(); this.noiseNode.disconnect(); } catch (_) {}
    }
    if (this.noiseGain) try { this.noiseGain.disconnect(); } catch (_) {}

    this.leftOsc = this.rightOsc = this.monoOsc = this.lfo = this.lfoGain = null;
    this.noiseNode = this.noiseGain = null;
    this.isPlaying = false;
    if (this._onEnded) this._onEnded();
  }

  /**
   * @param {object} opts
   * @param {'binaural'|'monaural'|'isochronic'|'pure'} opts.mode
   * @param {number} opts.carrier
   * @param {number} opts.beat
   * @param {number} opts.left
   * @param {number} opts.right
   * @param {string} opts.waveform  sine|square|triangle|sawtooth
   * @param {number} opts.volume    0–1
   * @param {number} opts.duration  seconds, 0 = infinite
   * @param {'none'|'white'|'pink'|'brown'} opts.noise
   */
  async play(opts) {
    await this.ensureRunning();
    this.stop();

    const {
      mode = 'binaural',
      carrier = 200,
      beat = 10,
      left = 195,
      right = 205,
      waveform = 'sine',
      volume = 0.3,
      duration = 0,
      noise = 'none'
    } = opts;

    this.mode = mode;
    this.setVolume(volume);

    const now = this.ctx.currentTime;
    const merger = this.ctx.createChannelMerger(2);

    if (mode === 'binaural') {
      // Two pure tones, different ears
      this.leftOsc = this.ctx.createOscillator();
      this.rightOsc = this.ctx.createOscillator();
      this.leftOsc.type = waveform;
      this.rightOsc.type = waveform;
      this.leftOsc.frequency.setValueAtTime(left, now);
      this.rightOsc.frequency.setValueAtTime(right, now);

      const leftGain = this.ctx.createGain();
      const rightGain = this.ctx.createGain();
      leftGain.gain.value = 0.5;
      rightGain.gain.value = 0.5;

      this.leftOsc.connect(leftGain);
      this.rightOsc.connect(rightGain);
      leftGain.connect(merger, 0, 0);
      rightGain.connect(merger, 0, 1);
      merger.connect(this.masterGain);

      this.leftOsc.start(now);
      this.rightOsc.start(now);
    } else if (mode === 'monaural') {
      // Amplitude modulated carrier (physical beat)
      this.monoOsc = this.ctx.createOscillator();
      this.monoOsc.type = waveform;
      this.monoOsc.frequency.setValueAtTime(carrier, now);

      this.lfo = this.ctx.createOscillator();
      this.lfo.frequency.setValueAtTime(beat, now);
      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.value = 0.5; // modulation depth

      const amp = this.ctx.createGain();
      amp.gain.value = 0.5;

      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(amp.gain);
      this.monoOsc.connect(amp);
      amp.connect(this.masterGain);

      this.monoOsc.start(now);
      this.lfo.start(now);
    } else if (mode === 'isochronic') {
      // Pulsed tone using LFO as gate
      this.monoOsc = this.ctx.createOscillator();
      this.monoOsc.type = waveform;
      this.monoOsc.frequency.setValueAtTime(carrier, now);

      this.lfo = this.ctx.createOscillator();
      this.lfo.type = 'square';
      this.lfo.frequency.setValueAtTime(beat, now);

      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.value = 0.5;

      const gate = this.ctx.createGain();
      gate.gain.value = 0.5;

      this.lfo.connect(this.lfoGain);
      this.lfoGain.connect(gate.gain);
      this.monoOsc.connect(gate);
      gate.connect(this.masterGain);

      this.monoOsc.start(now);
      this.lfo.start(now);
    } else {
      // Pure tone
      this.monoOsc = this.ctx.createOscillator();
      this.monoOsc.type = waveform;
      this.monoOsc.frequency.setValueAtTime(carrier, now);
      this.monoOsc.connect(this.masterGain);
      this.monoOsc.start(now);
    }

    // Optional noise
    if (noise && noise !== 'none') {
      this._startNoise(noise, 0.08);
    }

    this.isPlaying = true;

    if (duration > 0) {
      this.durationTimer = setTimeout(() => {
        this.stop();
      }, duration * 1000);
    }
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
      // Brown
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
    this.noiseGain.connect(this.masterGain);
    this.noiseNode.start();
  }

  getAnalyserData() {
    if (!this.analyser) return null;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteTimeDomainData(dataArray);
    return dataArray;
  }

  getFrequencyData() {
    if (!this.analyser) return null;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
}

window.AudioEngine = AudioEngine;
