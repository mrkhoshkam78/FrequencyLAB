/**
 * Frequency Lab — Main Application
 */
(function () {
  'use strict';

  let DATA = null;
  const engine = new AudioEngine();
  const visualizer = new WaveVisualizer('wave-canvas');
  visualizer.setEngine(engine);

  const evidenceOrder = {
    strong: 0, moderate: 1, limited: 2, preliminary: 3, insufficient: 4, traditional: 5
  };

  // ---------- Data ----------
  async function loadData() {
    try {
      const res = await fetch('data/frequencies.json');
      DATA = await res.json();
      document.getElementById('stat-total').textContent = DATA.frequencies.length;
      renderEvidenceLegend();
      renderPresets();
      renderFreqGrid();
    } catch (e) {
      console.error('Failed to load dataset', e);
      showToast('Could not load frequency database.');
    }
  }

  // ---------- Navigation ----------
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    document.getElementById('mobile-nav').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const v = el.dataset.view;
      if (v) showView(v);
    });
  });

  document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('mobile-nav').classList.toggle('open');
  });

  // Category cards → explore with filter
  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      const cat = card.dataset.category;
      document.getElementById('filter-category').value = cat;
      showView('explore');
      renderFreqGrid();
    });
  });

  // ---------- Explore / Search ----------
  function getFiltered() {
    if (!DATA) return [];
    const q = (document.getElementById('search-input').value || '').toLowerCase().trim();
    const cat = document.getElementById('filter-category').value;
    const ev = document.getElementById('filter-evidence').value;
    const sort = document.getElementById('sort-by').value;

    let list = DATA.frequencies.filter(f => {
      if (cat !== 'all' && f.category !== cat) return false;
      if (ev !== 'all' && f.evidenceLevel !== ev) return false;
      if (!q) return true;
      const hay = [
        f.name, f.id, String(f.hz || ''), f.brainwaveBand || '',
        f.frequencyType || '', f.intendedEffect || '', f.claimedEffect || '',
        (f.tags || []).join(' '), f.audioMethod ? f.audioMethod.join(' ') : ''
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });

    list.sort((a, b) => {
      if (sort === 'hz-asc') return (a.hz || 9999) - (b.hz || 9999);
      if (sort === 'hz-desc') return (b.hz || 0) - (a.hz || 0);
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'evidence') return (evidenceOrder[a.evidenceLevel] || 9) - (evidenceOrder[b.evidenceLevel] || 9);
      return 0;
    });
    return list;
  }

  function renderFreqGrid() {
    const grid = document.getElementById('freq-grid');
    if (!grid || !DATA) return;
    const list = getFiltered();
    if (!list.length) {
      grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">No frequencies match your filters.</p>';
      return;
    }
    grid.innerHTML = list.map(f => {
      const accent = f.category === 'mystical' ? 'var(--accent-purple)' : 'var(--accent-cyan)';
      const ev = DATA.evidenceLevels[f.evidenceLevel] || {};
      const hzLabel = f.hz != null ? f.hz + ' Hz' : (f.frequencyType || '—');
      return `
        <article class="freq-card" data-id="${f.id}" style="--card-accent:${accent}">
          <div class="hz">${hzLabel}</div>
          <div class="name">${escapeHtml(f.name)}</div>
          <div class="meta">${escapeHtml(f.frequencyType || '')} · ${f.category === 'scientific' ? 'Scientific' : 'Mystical'}</div>
          <span class="evidence-badge" style="background:${ev.color}22;color:${ev.color};border:1px solid ${ev.color}55">${ev.label || f.evidenceLevel}</span>
          <div class="tags">${(f.tags || []).slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
        </article>`;
    }).join('');

    grid.querySelectorAll('.freq-card').forEach(card => {
      card.addEventListener('click', () => openDetail(card.dataset.id));
    });
  }

  ['search-input', 'filter-category', 'filter-evidence', 'sort-by'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderFreqGrid);
    if (el) el.addEventListener('change', renderFreqGrid);
  });

  // ---------- Detail ----------
  function openDetail(id) {
    const f = DATA.frequencies.find(x => x.id === id);
    if (!f) return;
    const ev = DATA.evidenceLevels[f.evidenceLevel] || {};
    const accent = f.category === 'mystical' ? 'var(--accent-purple)' : 'var(--accent-cyan)';

    const content = document.getElementById('detail-content');
    content.innerHTML = `
      <div class="detail-info">
        <div class="detail-hz" style="color:${accent}">${f.hz != null ? f.hz + ' Hz' : '—'}</div>
        <h1>${escapeHtml(f.name)}</h1>
        <span class="evidence-badge" style="background:${ev.color}22;color:${ev.color};border:1px solid ${ev.color}55">${ev.label}</span>
        <p style="margin-top:0.75rem;color:var(--text-muted);font-size:0.9rem">${escapeHtml(ev.description || '')}</p>

        <div class="detail-section">
          <h3>Type & Band</h3>
          <p>${escapeHtml(f.frequencyType || '—')}${f.brainwaveBand ? ' · Brainwave: ' + escapeHtml(f.brainwaveBand) : ''}</p>
        </div>

        ${f.intendedEffect ? `
        <div class="detail-section">
          <h3>Investigated / Intended Effect</h3>
          <div class="science-box">${escapeHtml(f.intendedEffect)}</div>
        </div>` : ''}

        ${f.claimedEffect ? `
        <div class="detail-section">
          <h3>Spiritual / Traditional Claim</h3>
          <div class="claim-box">⚠️ ${escapeHtml(f.claimedEffect)} <br><small style="opacity:0.8">This is a cultural/spiritual claim, not scientific evidence.</small></div>
        </div>` : ''}

        <div class="detail-section">
          <h3>Human Evidence Summary</h3>
          <p>${escapeHtml(f.humanEvidence || '—')}</p>
        </div>

        <div class="detail-section">
          <h3>Study Info</h3>
          <p><strong>Type:</strong> ${escapeHtml(f.studyType || '—')}<br>
          <strong>Sample:</strong> ${escapeHtml(String(f.sampleSize || '—'))}<br>
          <strong>Results:</strong> ${escapeHtml(f.results || '—')}</p>
        </div>

        <div class="detail-section">
          <h3>Safety</h3>
          <p>${escapeHtml(f.safetyNotes || 'Use moderate volume. Not medical treatment.')}</p>
        </div>

        <div class="detail-section">
          <h3>Source</h3>
          <p>${escapeHtml(f.source || '—')}${f.doi ? '<br>DOI: ' + escapeHtml(f.doi) : ''}${f.publicationYear ? '<br>Year: ' + f.publicationYear : ''}</p>
        </div>
      </div>

      <div class="detail-player">
        <div class="viz-box"><canvas id="detail-wave"></canvas></div>
        <h3 style="margin-bottom:1rem;font-family:var(--font-display);font-size:1rem;">Quick Play</h3>
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem;">Generate this frequency in real time (headphones recommended for binaural).</p>
        <div class="gen-actions" style="margin-bottom:1rem;">
          <button class="btn btn-primary" id="detail-play">▶ Play</button>
          <button class="btn btn-ghost" id="detail-stop" disabled>■ Stop</button>
        </div>
        <div class="safety-note">⚠️ Start at low volume. This is not a medical device or treatment.</div>
      </div>
    `;

    showView('detail');

    // Detail play logic
    const playBtn = document.getElementById('detail-play');
    const stopBtn = document.getElementById('detail-stop');
    const detailCanvas = document.getElementById('detail-wave');
    let detailVis = null;

    if (detailCanvas) {
      detailVis = new WaveVisualizer('detail-wave');
      detailVis.setEngine(engine);
      detailVis._drawIdle();
    }

    playBtn.addEventListener('click', async () => {
      const opts = buildOptsFromFreq(f);
      opts.volume = 0.25;
      await engine.play(opts);
      playBtn.disabled = true;
      stopBtn.disabled = false;
      if (detailVis) detailVis.start();
      showToast('Playing — volume starts low for safety');
    });
    stopBtn.addEventListener('click', () => {
      engine.stop();
      playBtn.disabled = false;
      stopBtn.disabled = true;
      if (detailVis) detailVis.stop();
    });
    engine._onEnded = () => {
      playBtn.disabled = false;
      stopBtn.disabled = true;
      if (detailVis) detailVis.stop();
    };
  }

  function buildOptsFromFreq(f) {
    const mode = (f.audioMethod && f.audioMethod[0])
      ? f.audioMethod[0].toLowerCase().includes('binaural') ? 'binaural'
        : f.audioMethod[0].toLowerCase().includes('monaural') ? 'monaural'
        : f.audioMethod[0].toLowerCase().includes('isochronic') ? 'isochronic'
        : 'pure'
      : (f.hz && f.hz < 50 ? 'binaural' : 'pure');

    const carrier = f.carrierFrequency || (f.hz && f.hz >= 50 ? f.hz : 200);
    const beat = f.beatFrequency || (f.hz && f.hz < 50 ? f.hz : 10);
    const left = carrier - beat / 2;
    const right = carrier + beat / 2;

    return {
      mode: mode === 'pure' && f.hz && f.hz < 50 ? 'binaural' : mode,
      carrier,
      beat,
      left: Math.max(50, left),
      right: Math.max(50, right),
      waveform: 'sine',
      volume: 0.3,
      duration: 0,
      noise: 'none'
    };
  }

  document.getElementById('back-to-explore').addEventListener('click', () => showView('explore'));

  // ---------- Generator UI ----------
  const carrierEl = document.getElementById('carrier-freq');
  const beatEl = document.getElementById('beat-freq');
  const leftEl = document.getElementById('left-freq');
  const rightEl = document.getElementById('right-freq');
  const volEl = document.getElementById('volume');
  const durEl = document.getElementById('duration');
  const waveEl = document.getElementById('waveform');
  const noiseEl = document.getElementById('noise-type');
  let currentMode = 'binaural';

  function syncLabels() {
    document.getElementById('carrier-val').textContent = carrierEl.value;
    document.getElementById('beat-val').textContent = beatEl.value;
    document.getElementById('left-val').textContent = leftEl.value;
    document.getElementById('right-val').textContent = rightEl.value;
    document.getElementById('vol-val').textContent = volEl.value + '%';
    const d = +durEl.value;
    document.getElementById('dur-val').textContent = d === 0 ? '∞' : d + 's';
  }

  function syncBinauralFromCarrierBeat() {
    const c = +carrierEl.value;
    const b = +beatEl.value;
    leftEl.value = Math.round(c - b / 2);
    rightEl.value = Math.round(c + b / 2);
    syncLabels();
  }

  carrierEl.addEventListener('input', () => {
    if (currentMode === 'binaural') syncBinauralFromCarrierBeat();
    else syncLabels();
  });
  beatEl.addEventListener('input', () => {
    if (currentMode === 'binaural') syncBinauralFromCarrierBeat();
    else syncLabels();
  });
  leftEl.addEventListener('input', syncLabels);
  rightEl.addEventListener('input', syncLabels);
  volEl.addEventListener('input', () => {
    syncLabels();
    engine.setVolume(+volEl.value / 100);
  });
  durEl.addEventListener('input', syncLabels);

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      const beatGroup = document.getElementById('beat-group');
      if (currentMode === 'pure') {
        beatGroup.style.opacity = '0.4';
        beatGroup.style.pointerEvents = 'none';
      } else {
        beatGroup.style.opacity = '1';
        beatGroup.style.pointerEvents = 'auto';
      }
      if (currentMode === 'binaural') syncBinauralFromCarrierBeat();
    });
  });

  document.getElementById('play-btn').addEventListener('click', async () => {
    const opts = {
      mode: currentMode,
      carrier: +carrierEl.value,
      beat: +beatEl.value,
      left: +leftEl.value,
      right: +rightEl.value,
      waveform: waveEl.value,
      volume: +volEl.value / 100,
      duration: +durEl.value,
      noise: noiseEl.value
    };
    // Safety: cap volume if user tries high
    if (opts.volume > 0.7) {
      showToast('Volume limited for safety. Prefer lower levels.');
      opts.volume = 0.7;
      volEl.value = 70;
      syncLabels();
    }
    await engine.play(opts);
    document.getElementById('play-btn').disabled = true;
    document.getElementById('stop-btn').disabled = false;
    visualizer.start();
    showToast('Playing — use headphones for binaural');
  });

  document.getElementById('stop-btn').addEventListener('click', () => {
    engine.stop();
    document.getElementById('play-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    visualizer.stop();
  });

  engine._onEnded = () => {
    document.getElementById('play-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    visualizer.stop();
  };

  function renderPresets() {
    const box = document.getElementById('preset-btns');
    if (!box || !DATA) return;
    const presets = [
      { name: 'Alpha 10 Hz', mode: 'binaural', carrier: 200, beat: 10 },
      { name: 'Theta 6 Hz', mode: 'binaural', carrier: 200, beat: 6 },
      { name: 'Delta 2 Hz', mode: 'binaural', carrier: 200, beat: 2 },
      { name: '40 Hz Gamma', mode: 'isochronic', carrier: 200, beat: 40 },
      { name: '528 Hz', mode: 'pure', carrier: 528, beat: 0 },
      { name: '432 Hz', mode: 'pure', carrier: 432, beat: 0 }
    ];
    box.innerHTML = presets.map((p, i) =>
      `<button class="preset-btn" data-i="${i}">${p.name}</button>`
    ).join('');
    box.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = presets[+btn.dataset.i];
        currentMode = p.mode;
        document.querySelectorAll('.mode-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.mode === p.mode);
        });
        carrierEl.value = p.carrier;
        beatEl.value = p.beat || 10;
        if (p.mode === 'binaural') {
          leftEl.value = Math.round(p.carrier - p.beat / 2);
          rightEl.value = Math.round(p.carrier + p.beat / 2);
        }
        syncLabels();
        showToast('Preset loaded: ' + p.name);
      });
    });
  }

  function renderEvidenceLegend() {
    const box = document.getElementById('evidence-legend');
    if (!box || !DATA) return;
    box.innerHTML = Object.entries(DATA.evidenceLevels).map(([k, v]) =>
      `<span class="evidence-badge" style="background:${v.color}22;color:${v.color};border:1px solid ${v.color}55">${v.label}</span>`
    ).join('');
  }

  // ---------- Utils ----------
  function escapeHtml(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  // Init
  visualizer._drawIdle();
  syncLabels();
  loadData();
})();
