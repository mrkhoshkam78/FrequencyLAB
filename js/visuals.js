/**
 * Background canvas waves + particles
 */
(function () {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, time = 0;
  const waves = [
    { amp: 28, len: 0.008, speed: 0.012, color: 'rgba(0,212,255,0.12)' },
    { amp: 40, len: 0.005, speed: 0.008, color: 'rgba(199,125,255,0.10)' },
    { amp: 22, len: 0.012, speed: 0.018, color: 'rgba(255,107,203,0.08)' }
  ];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function draw() {
    ctx.clearRect(0, 0, w, h);
    time += 1;
    waves.forEach((wave, i) => {
      ctx.beginPath();
      ctx.moveTo(0, h * 0.55);
      for (let x = 0; x <= w; x += 4) {
        const y = h * 0.55 +
          Math.sin(x * wave.len + time * wave.speed + i) * wave.amp +
          Math.sin(x * wave.len * 0.5 + time * wave.speed * 0.7) * (wave.amp * 0.4);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = wave.color;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();

  // Particles
  const container = document.getElementById('particles');
  if (container) {
    for (let i = 0; i < 30; i++) {
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
 * Waveform visualizer for generator
 */
window.WaveVisualizer = class WaveVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.running = false;
    this.engine = null;
  }

  setEngine(engine) {
    this.engine = engine;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    this._drawIdle();
  }

  _drawIdle() {
    const c = this.canvas;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    ctx.scale(dpr, dpr);
    const w = c.clientWidth;
    const h = c.clientHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,212,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }

  _loop() {
    if (!this.running) return;
    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const c = this.canvas;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = 'rgba(5,5,16,0.85)';
    ctx.fillRect(0, 0, w, h);

    if (!this.engine || !this.engine.isPlaying) {
      ctx.strokeStyle = 'rgba(0,212,255,0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      return;
    }

    const data = this.engine.getAnalyserData();
    if (!data) return;

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00d4ff';
    ctx.shadowColor = '#00d4ff';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    const slice = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * slice, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Secondary frequency glow
    const freq = this.engine.getFrequencyData();
    if (freq) {
      ctx.fillStyle = 'rgba(199,125,255,0.15)';
      const barW = w / 64;
      for (let i = 0; i < 64; i++) {
        const barH = (freq[i] / 255) * h * 0.35;
        ctx.fillRect(i * barW, h - barH, barW - 1, barH);
      }
    }
  }
};
