/**
 * Background waves + real-time multi-channel visualizer
 * fed exclusively from AudioEngine analysers.
 */
(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let time = 0;
  const waves = [
    { amp: 28, len: 0.008, speed: 0.012, color: 'rgba(0,212,255,0.12)' },
    { amp: 40, len: 0.005, speed: 0.008, color: 'rgba(199,125,255,0.10)' },
    { amp: 22, len: 0.012, speed: 0.018, color: 'rgba(255,107,203,0.08)' }
  ];

  function resize() {
    canvas.width = window.innerWidth * (window.devicePixelRatio || 1);
    canvas.height = window.innerHeight * (window.devicePixelRatio || 1);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  function draw() {
    const cw = window.innerWidth, ch = window.innerHeight;
    ctx.clearRect(0, 0, cw, ch);
    time += 1;
    waves.forEach((wave, i) => {
      ctx.beginPath();
      ctx.moveTo(0, ch * 0.55);
      for (let x = 0; x <= cw; x += 5) {
        const y = ch * 0.55 +
          Math.sin(x * wave.len + time * wave.speed + i) * wave.amp +
          Math.sin(x * wave.len * 0.5 + time * wave.speed * 0.7) * (wave.amp * 0.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cw, ch);
      ctx.lineTo(0, ch);
      ctx.closePath();
      ctx.fillStyle = wave.color;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();

  const container = document.getElementById('particles');
  if (container) {
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (12 + Math.random() * 20) + 's';
      p.style.animationDelay = (Math.random() * 15) + 's';
      p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
      p.style.background = i % 3 === 0 ? '#00d4ff' : i % 3 === 1 ? '#c77dff' : '#ff6bcb';
      container.appendChild(p);
    }
  }
})();

/**
 * Real-time visualizer: waveform, spectrum, L/R channels, beat pulse
 */
window.WaveVisualizer = class WaveVisualizer {
  constructor(canvasId, opts) {
    opts = opts || {};
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.running = false;
    this.engine = null;
    this.showLR = opts.showLR !== false;
    this.showSpectrum = opts.showSpectrum !== false;
    this.showBeat = opts.showBeat !== false;
    this._beatPhase = 0;
  }

  setEngine(engine) { this.engine = engine; }

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    this._drawIdle();
  }

  _size() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 800;
    const h = c.clientHeight || 200;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  _drawIdle() {
    if (!this.canvas) return;
    const size = this._size();
    const w = size.w, h = size.h;
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5,5,16,0.9)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,212,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,212,255,0.12)';
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h / 2 + Math.sin(x * 0.02) * 8;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _loop() {
    if (!this.running) return;
    this._draw();
    requestAnimationFrame(function() { this._loop(); }.bind(this));
  }

  _draw() {
    if (!this.canvas) return;
    const size = this._size();
    const w = size.w, h = size.h;
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(5,5,16,0.88)';
    ctx.fillRect(0, 0, w, h);

    if (!this.engine || !this.engine.isPlaying) {
      this._drawIdle();
      return;
    }

    const state = this.engine.getState();
    const data = this.engine.getTimeDomainData();
    const freq = this.engine.getFrequencyData();
    const leftData = this.engine.getLeftTimeData();
    const rightData = this.engine.getRightTimeData();

    if (this.showSpectrum && freq) {
      const bars = 64;
      const barW = w / bars;
      for (let i = 0; i < bars; i++) {
        const v = freq[Math.floor(i * freq.length / bars)] / 255;
        const barH = v * h * 0.32;
        const hue = 180 + i * 1.5;
        ctx.fillStyle = 'hsla(' + hue + ', 90%, 55%, ' + (0.15 + v * 0.45) + ')';
        ctx.fillRect(i * barW, h - barH, barW - 1, barH);
      }
    }

    if (data) {
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#00d4ff';
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      const slice = w / data.length;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128.0;
        const y = (v * h) / 2;
        if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * slice, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    if (this.showLR && leftData && rightData) {
      const midY = h * 0.22;
      const amp = h * 0.08;
      ctx.strokeStyle = 'rgba(0,212,255,0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < leftData.length; i += 2) {
        const x = (i / leftData.length) * w;
        const y = midY + ((leftData[i] / 128) - 1) * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(199,125,255,0.7)';
      ctx.beginPath();
      for (let i = 0; i < rightData.length; i += 2) {
        const x = (i / rightData.length) * w;
        const y = midY + 20 + ((rightData[i] / 128) - 1) * amp;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = 'rgba(0,212,255,0.8)';
      ctx.fillText('L', 6, midY - amp - 4);
      ctx.fillStyle = 'rgba(199,125,255,0.8)';
      ctx.fillText('R', 6, midY + 20 - amp - 4);
    }

    if (this.showBeat && state.mode === 'binaural' && state.beat > 0) {
      this._beatPhase += state.beat * 0.016 * Math.PI * 2;
      const pulse = (Math.sin(this._beatPhase) + 1) / 2;
      const cx = w - 28;
      const cy = 28;
      const r = 8 + pulse * 10;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,212,255,' + (0.15 + pulse * 0.4) + ')';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,212,255,' + (0.5 + pulse * 0.5) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = '9px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(state.beat.toFixed(1) + ' Hz', cx, cy + 28);
      ctx.textAlign = 'left';
    }

    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    var info;
    if (state.mode === 'binaural') {
      info = state.mode + '  ·  L ' + state.left.toFixed(1) + ' · R ' + state.right.toFixed(1) + ' · Beat ' + state.beatActual.toFixed(1) + '  ·  ' + state.waveform;
    } else {
      info = state.mode + '  ·  Carrier ' + state.carrier.toFixed(1) + ' · Beat ' + state.beat.toFixed(1) + '  ·  ' + state.waveform;
    }
    ctx.fillText(info, 10, h - 8);
  }
};
