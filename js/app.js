/**
 * Frequency Lab — Main Application v2
 * Live audio params, i18n, professional presets, recommendations
 */
(function () {
  'use strict';

  let DATA = null;
  const engine = new AudioEngine();
  const visualizer = new WaveVisualizer('wave-canvas');
  visualizer.setEngine(engine);

  const evidenceOrder = { strong: 0, moderate: 1, limited: 2, preliminary: 3, insufficient: 4, traditional: 5 };

  const PRESETS = [
    { id: 'focus', name: { en: 'Focus', fa: 'تمرکز' }, icon: 'focus', mode: 'binaural', carrier: 200, beat: 14, waveform: 'sine', volume: 0.28, noise: 'none' },
    { id: 'deep-focus', name: { en: 'Deep Focus', fa: 'تمرکز عمیق' }, icon: 'focus', mode: 'binaural', carrier: 220, beat: 18, waveform: 'sine', volume: 0.26, noise: 'none' },
    { id: 'relax', name: { en: 'Relax', fa: 'آرامش' }, icon: 'relax', mode: 'binaural', carrier: 200, beat: 8, waveform: 'sine', volume: 0.25, noise: 'pink' },
    { id: 'meditation', name: { en: 'Meditation', fa: 'مدیتیشن' }, icon: 'relax', mode: 'binaural', carrier: 180, beat: 6, waveform: 'sine', volume: 0.24, noise: 'pink' },
    { id: 'sleep', name: { en: 'Sleep', fa: 'خواب' }, icon: 'moon', mode: 'binaural', carrier: 150, beat: 2, waveform: 'sine', volume: 0.18, noise: 'brown' },
    { id: 'study', name: { en: 'Study', fa: 'مطالعه' }, icon: 'focus', mode: 'binaural', carrier: 210, beat: 12, waveform: 'sine', volume: 0.27, noise: 'none' },
    { id: 'memory', name: { en: 'Memory', fa: 'حافظه' }, icon: 'brain', mode: 'binaural', carrier: 200, beat: 6, waveform: 'sine', volume: 0.26, noise: 'none' },
    { id: 'calm', name: { en: 'Calm', fa: 'آرامش عمیق' }, icon: 'relax', mode: 'binaural', carrier: 190, beat: 4, waveform: 'sine', volume: 0.22, noise: 'pink' },
    { id: 'gamma40', name: { en: 'Gamma 40 Hz', fa: 'گاما ۴۰ هرتز' }, icon: 'wave', mode: 'isochronic', carrier: 200, beat: 40, waveform: 'sine', volume: 0.22, noise: 'none' },
    { id: '528', name: { en: '528 Hz', fa: '۵۲۸ هرتز' }, icon: 'spark', mode: 'pure', carrier: 528, beat: 0, waveform: 'sine', volume: 0.25, noise: 'none', mystical: true },
    { id: '432', name: { en: '432 Hz', fa: '۴۳۲ هرتز' }, icon: 'spark', mode: 'pure', carrier: 432, beat: 0, waveform: 'sine', volume: 0.25, noise: 'none', mystical: true }
  ];

  // ── Data ──
  async function loadData() {
    try {
      const res = await fetch('data/frequencies.json');
      DATA = await res.json();
      document.getElementById('stat-total').textContent = DATA.frequencies.length;
      renderEvidenceLegend();
      renderPresets();
      renderFreqGrid();
      I18N.apply();
    } catch (e) {
      console.error(e);
      showToast('Dataset load failed / بارگذاری داده ناموفق');
    }
  }

  // ── Navigation ──
  function showView(name) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var el = document.getElementById('view-' + name);
    if (el) el.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    document.getElementById('mobile-nav').classList.remove('open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  document.querySelectorAll('[data-view]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      if (el.dataset.view) showView(el.dataset.view);
    });
  });

  document.getElementById('menu-toggle').addEventListener('click', function () {
    document.getElementById('mobile-nav').classList.toggle('open');
  });

  document.querySelectorAll('.category-card').forEach(function (card) {
    card.addEventListener('click', function () {
      document.getElementById('filter-category').value = card.dataset.category;
      showView('explore');
      renderFreqGrid();
    });
  });

  // ── Language ──
  document.getElementById('lang-toggle').addEventListener('click', function () {
    var next = I18N.lang === 'fa' ? 'en' : 'fa';
    I18N.setLang(next);
    document.getElementById('lang-label').textContent = next === 'fa' ? 'EN' : 'FA';
    renderPresets();
    renderFreqGrid();
    if (document.getElementById('view-detail').classList.contains('active')) {
      // re-render detail if open would need stored id — skip for simplicity
    }
  });
  // Init lang
  I18N.setLang(I18N.lang);
  document.getElementById('lang-label').textContent = I18N.lang === 'fa' ? 'EN' : 'FA';

  // ── Explore ──
  function getFiltered() {
    if (!DATA) return [];
    var q = (document.getElementById('search-input').value || '').toLowerCase().trim();
    var cat = document.getElementById('filter-category').value;
    var ev = document.getElementById('filter-evidence').value;
    var sort = document.getElementById('sort-by').value;
    var list = DATA.frequencies.filter(function (f) {
      if (cat !== 'all' && f.category !== cat) return false;
      if (ev !== 'all' && f.evidenceLevel !== ev) return false;
      if (!q) return true;
      var hay = [f.name, f.id, String(f.hz || ''), f.brainwaveBand || '', f.frequencyType || '',
        f.intendedEffect || '', f.claimedEffect || '', (f.tags || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
    list.sort(function (a, b) {
      if (sort === 'hz-asc') return (a.hz || 9999) - (b.hz || 9999);
      if (sort === 'hz-desc') return (b.hz || 0) - (a.hz || 0);
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'evidence') return (evidenceOrder[a.evidenceLevel] || 9) - (evidenceOrder[b.evidenceLevel] || 9);
      return 0;
    });
    return list;
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderFreqGrid() {
    var grid = document.getElementById('freq-grid');
    if (!grid || !DATA) return;
    var list = getFiltered();
    if (!list.length) {
      grid.innerHTML = '<p style="color:var(--text-muted);grid-column:1/-1;text-align:center;padding:2rem;">' + I18N.get('no_results') + '</p>';
      return;
    }
    grid.innerHTML = list.map(function (f) {
      var accent = f.category === 'mystical' ? 'var(--accent-purple)' : 'var(--accent-cyan)';
      var ev = DATA.evidenceLevels[f.evidenceLevel] || {};
      var hzLabel = f.hz != null ? f.hz + ' Hz' : (f.frequencyType || '—');
      return '<article class="freq-card" data-id="' + f.id + '" style="--card-accent:' + accent + '">' +
        '<div class="hz">' + hzLabel + '</div>' +
        '<div class="name">' + escapeHtml(f.name) + '</div>' +
        '<div class="meta">' + escapeHtml(f.frequencyType || '') + ' · ' + (f.category === 'scientific' ? 'Scientific' : 'Mystical') + '</div>' +
        '<span class="evidence-badge" style="background:' + ev.color + '22;color:' + ev.color + ';border:1px solid ' + ev.color + '55">' + (ev.label || f.evidenceLevel) + '</span>' +
        '<div class="tags">' + (f.tags || []).slice(0, 4).map(function (t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join('') + '</div>' +
        '</article>';
    }).join('');
    grid.querySelectorAll('.freq-card').forEach(function (card) {
      card.addEventListener('click', function () { openDetail(card.dataset.id); });
    });
  }

  ['search-input', 'filter-category', 'filter-evidence', 'sort-by'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', renderFreqGrid);
      el.addEventListener('change', renderFreqGrid);
    }
  });

  // ── Detail ──
  function openDetail(id) {
    var f = DATA.frequencies.find(function (x) { return x.id === id; });
    if (!f) return;
    var ev = DATA.evidenceLevels[f.evidenceLevel] || {};
    var accent = f.category === 'mystical' ? 'var(--accent-purple)' : 'var(--accent-cyan)';
    var content = document.getElementById('detail-content');
    content.innerHTML =
      '<div class="detail-info">' +
        '<div class="detail-hz" style="color:' + accent + '">' + (f.hz != null ? f.hz + ' Hz' : '—') + '</div>' +
        '<h1>' + escapeHtml(f.name) + '</h1>' +
        '<span class="evidence-badge" style="background:' + ev.color + '22;color:' + ev.color + ';border:1px solid ' + ev.color + '55">' + (ev.label || '') + '</span>' +
        '<p style="margin-top:0.75rem;color:var(--text-muted);font-size:0.9rem">' + escapeHtml(ev.description || '') + '</p>' +
        '<div class="detail-section"><h3>' + I18N.get('type_band') + '</h3><p>' + escapeHtml(f.frequencyType || '—') +
          (f.brainwaveBand ? ' · ' + escapeHtml(f.brainwaveBand) : '') + '</p></div>' +
        (f.intendedEffect ? '<div class="detail-section"><h3>' + I18N.get('investigated') + '</h3><div class="science-box">' + escapeHtml(f.intendedEffect) + '</div></div>' : '') +
        (f.claimedEffect ? '<div class="detail-section"><h3>' + I18N.get('spiritual_claim') + '</h3><div class="claim-box">⚠️ ' + escapeHtml(f.claimedEffect) +
          '<br><small style="opacity:0.8">' + I18N.get('claim_note') + '</small></div></div>' : '') +
        '<div class="detail-section"><h3>' + I18N.get('human_ev') + '</h3><p>' + escapeHtml(f.humanEvidence || '—') + '</p></div>' +
        '<div class="detail-section"><h3>' + I18N.get('study_info') + '</h3><p><strong>Type:</strong> ' + escapeHtml(f.studyType || '—') +
          '<br><strong>Sample:</strong> ' + escapeHtml(String(f.sampleSize || '—')) +
          '<br><strong>Results:</strong> ' + escapeHtml(f.results || '—') + '</p></div>' +
        '<div class="detail-section"><h3>' + I18N.get('safety_label') + '</h3><p>' + escapeHtml(f.safetyNotes || '') + '</p></div>' +
        '<div class="detail-section"><h3>' + I18N.get('source_label') + '</h3><p>' + escapeHtml(f.source || '—') +
          (f.doi ? '<br>DOI: ' + escapeHtml(f.doi) : '') +
          (f.publicationYear ? '<br>Year: ' + f.publicationYear : '') + '</p></div>' +
      '</div>' +
      '<div class="detail-player">' +
        '<div class="viz-box"><canvas id="detail-wave"></canvas></div>' +
        '<h3 style="margin-bottom:1rem;font-family:var(--font-display);font-size:1rem;">' + I18N.get('quick_play') + '</h3>' +
        '<p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1rem;">' + I18N.get('quick_play_hint') + '</p>' +
        '<div class="gen-actions" style="margin-bottom:1rem;">' +
          '<button class="btn btn-primary" id="detail-play"><svg width="18" height="18"><use href="#icon-play"/></svg> ' + I18N.get('play') + '</button>' +
          '<button class="btn btn-ghost" id="detail-stop" disabled><svg width="18" height="18"><use href="#icon-stop"/></svg> ' + I18N.get('stop') + '</button>' +
        '</div>' +
        '<div class="safety-note">' + I18N.get('safety') + '</div>' +
      '</div>';

    showView('detail');

    var detailVis = new WaveVisualizer('detail-wave');
    detailVis.setEngine(engine);
    detailVis._drawIdle();

    document.getElementById('detail-play').addEventListener('click', async function () {
      var opts = buildOptsFromFreq(f);
      opts.volume = 0.22;
      opts.fadeIn = 1.0;
      await engine.play(opts);
      document.getElementById('detail-play').disabled = true;
      document.getElementById('detail-stop').disabled = false;
      detailVis.start();
      showToast(I18N.get('playing'));
    });
    document.getElementById('detail-stop').addEventListener('click', async function () {
      await engine.stop();
      document.getElementById('detail-play').disabled = false;
      document.getElementById('detail-stop').disabled = true;
      detailVis.stop();
    });
  }

  function buildOptsFromFreq(f) {
    var mode = 'pure';
    if (f.audioMethod && f.audioMethod.length) {
      var m = f.audioMethod[0].toLowerCase();
      if (m.indexOf('binaural') !== -1) mode = 'binaural';
      else if (m.indexOf('monaural') !== -1) mode = 'monaural';
      else if (m.indexOf('isochronic') !== -1) mode = 'isochronic';
    }
    if (f.hz && f.hz < 50 && mode === 'pure') mode = 'binaural';
    var carrier = f.carrierFrequency || (f.hz && f.hz >= 50 ? f.hz : 200);
    var beat = f.beatFrequency || (f.hz && f.hz < 50 ? f.hz : 10);
    return {
      mode: mode,
      carrier: carrier,
      beat: beat,
      left: carrier - beat / 2,
      right: carrier + beat / 2,
      waveform: 'sine',
      volume: 0.28,
      duration: 0,
      noise: 'none',
      fadeIn: 1.2,
      fadeOut: 1.5,
      balance: 0
    };
  }

  document.getElementById('back-to-explore').addEventListener('click', function () { showView('explore'); });

  // ── Generator controls — LIVE updates ──
  var carrierEl = document.getElementById('carrier-freq');
  var beatEl = document.getElementById('beat-freq');
  var leftEl = document.getElementById('left-freq');
  var rightEl = document.getElementById('right-freq');
  var volEl = document.getElementById('volume');
  var balEl = document.getElementById('balance');
  var durEl = document.getElementById('duration');
  var fadeInEl = document.getElementById('fade-in');
  var fadeOutEl = document.getElementById('fade-out');
  var waveEl = document.getElementById('waveform');
  var noiseEl = document.getElementById('noise-type');
  var currentMode = 'binaural';
  var _updatingFromCarrier = false;

  function syncLabels() {
    document.getElementById('carrier-val').textContent = carrierEl.value;
    document.getElementById('beat-val').textContent = beatEl.value;
    document.getElementById('left-val').textContent = leftEl.value;
    document.getElementById('right-val').textContent = rightEl.value;
    document.getElementById('vol-val').textContent = volEl.value + '%';
    document.getElementById('bal-val').textContent = (balEl.value / 100).toFixed(2);
    var d = +durEl.value;
    document.getElementById('dur-val').textContent = d === 0 ? I18N.get('infinite') : d + 's';
    document.getElementById('fadein-val').textContent = fadeInEl.value;
    document.getElementById('fadeout-val').textContent = fadeOutEl.value;
  }

  function syncBinauralFromCarrierBeat() {
    _updatingFromCarrier = true;
    var c = +carrierEl.value;
    var b = +beatEl.value;
    leftEl.value = Math.round(c - b / 2);
    rightEl.value = Math.round(c + b / 2);
    _updatingFromCarrier = false;
    syncLabels();
  }

  // Live parameter binding
  carrierEl.addEventListener('input', function () {
    if (currentMode === 'binaural') syncBinauralFromCarrierBeat();
    else syncLabels();
    if (engine.isPlaying) engine.setCarrier(+carrierEl.value);
  });
  beatEl.addEventListener('input', function () {
    if (currentMode === 'binaural') syncBinauralFromCarrierBeat();
    else syncLabels();
    if (engine.isPlaying) engine.setBeat(+beatEl.value);
  });
  leftEl.addEventListener('input', function () {
    if (_updatingFromCarrier) return;
    syncLabels();
    if (engine.isPlaying && currentMode === 'binaural') {
      engine.setLeft(+leftEl.value);
      // reflect computed beat/carrier back
      beatEl.value = Math.abs(+rightEl.value - +leftEl.value);
      carrierEl.value = Math.round((+leftEl.value + +rightEl.value) / 2);
      syncLabels();
    }
  });
  rightEl.addEventListener('input', function () {
    if (_updatingFromCarrier) return;
    syncLabels();
    if (engine.isPlaying && currentMode === 'binaural') {
      engine.setRight(+rightEl.value);
      beatEl.value = Math.abs(+rightEl.value - +leftEl.value);
      carrierEl.value = Math.round((+leftEl.value + +rightEl.value) / 2);
      syncLabels();
    }
  });
  volEl.addEventListener('input', function () {
    syncLabels();
    engine.setVolume(+volEl.value / 100);
  });
  balEl.addEventListener('input', function () {
    syncLabels();
    if (engine.isPlaying) engine.setBalance(+balEl.value / 100);
  });
  waveEl.addEventListener('change', function () {
    if (engine.isPlaying) engine.setWaveform(waveEl.value);
  });
  noiseEl.addEventListener('change', function () {
    if (engine.isPlaying) engine.setNoise(noiseEl.value);
  });
  fadeInEl.addEventListener('input', function () {
    syncLabels();
    engine.setFadeIn(+fadeInEl.value);
  });
  fadeOutEl.addEventListener('input', function () {
    syncLabels();
    engine.setFadeOut(+fadeOutEl.value);
  });
  durEl.addEventListener('input', syncLabels);

  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.mode-btn').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      var beatGroup = document.getElementById('beat-group');
      var lrRow = document.getElementById('lr-row');
      if (currentMode === 'pure') {
        beatGroup.style.opacity = '0.4';
        beatGroup.style.pointerEvents = 'none';
        lrRow.style.opacity = '0.4';
        lrRow.style.pointerEvents = 'none';
      } else if (currentMode === 'binaural') {
        beatGroup.style.opacity = '1';
        beatGroup.style.pointerEvents = 'auto';
        lrRow.style.opacity = '1';
        lrRow.style.pointerEvents = 'auto';
        syncBinauralFromCarrierBeat();
      } else {
        beatGroup.style.opacity = '1';
        beatGroup.style.pointerEvents = 'auto';
        lrRow.style.opacity = '0.4';
        lrRow.style.pointerEvents = 'none';
      }
      // Mode change while playing requires rebuild
      if (engine.isPlaying) {
        playCurrent();
      }
    });
  });

  async function playCurrent() {
    var opts = {
      mode: currentMode,
      carrier: +carrierEl.value,
      beat: +beatEl.value,
      left: +leftEl.value,
      right: +rightEl.value,
      waveform: waveEl.value,
      volume: Math.min(+volEl.value / 100, 0.7),
      duration: +durEl.value,
      noise: noiseEl.value,
      balance: +balEl.value / 100,
      fadeIn: +fadeInEl.value,
      fadeOut: +fadeOutEl.value
    };
    await engine.play(opts);
    document.getElementById('play-btn').disabled = true;
    document.getElementById('stop-btn').disabled = false;
    visualizer.start();
    showToast(currentMode === 'binaural' ? I18N.get('headphones') : I18N.get('playing'));
  }

  document.getElementById('play-btn').addEventListener('click', playCurrent);

  document.getElementById('stop-btn').addEventListener('click', async function () {
    await engine.stop();
    document.getElementById('play-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    visualizer.stop();
  });

  engine._onEnded = function () {
    document.getElementById('play-btn').disabled = false;
    document.getElementById('stop-btn').disabled = true;
    visualizer.stop();
  };

  // ── Presets (real engine params) ──
  function renderPresets() {
    var box = document.getElementById('preset-btns');
    if (!box) return;
    var lang = I18N.lang;
    box.innerHTML = PRESETS.map(function (p, i) {
      return '<button class="preset-btn" data-i="' + i + '">' + (p.name[lang] || p.name.en) + '</button>';
    }).join('');
    box.querySelectorAll('.preset-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var p = PRESETS[+btn.dataset.i];
        applyPreset(p);
        showToast(I18N.get('preset_loaded') + ': ' + (p.name[lang] || p.name.en));
        if (p.mystical) {
          setTimeout(function () { showToast(I18N.get('rec_mystical')); }, 1500);
        }
      });
    });
  }

  function applyPreset(p) {
    currentMode = p.mode;
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === p.mode);
    });
    carrierEl.value = p.carrier;
    beatEl.value = p.beat || 10;
    if (p.mode === 'binaural') {
      leftEl.value = Math.round(p.carrier - (p.beat || 10) / 2);
      rightEl.value = Math.round(p.carrier + (p.beat || 10) / 2);
    }
    waveEl.value = p.waveform || 'sine';
    volEl.value = Math.round((p.volume || 0.28) * 100);
    noiseEl.value = p.noise || 'none';
    // trigger mode UI state
    var event = new Event('click');
    // manually set opacity
    var beatGroup = document.getElementById('beat-group');
    var lrRow = document.getElementById('lr-row');
    if (p.mode === 'pure') {
      beatGroup.style.opacity = '0.4'; beatGroup.style.pointerEvents = 'none';
      lrRow.style.opacity = '0.4'; lrRow.style.pointerEvents = 'none';
    } else if (p.mode === 'binaural') {
      beatGroup.style.opacity = '1'; beatGroup.style.pointerEvents = 'auto';
      lrRow.style.opacity = '1'; lrRow.style.pointerEvents = 'auto';
    } else {
      beatGroup.style.opacity = '1'; beatGroup.style.pointerEvents = 'auto';
      lrRow.style.opacity = '0.4'; lrRow.style.pointerEvents = 'none';
    }
    syncLabels();
    // If playing, apply live
    if (engine.isPlaying) {
      playCurrent();
    }
  }

  // Recommendations click → apply related preset
  document.querySelectorAll('.rec-item').forEach(function (el) {
    el.addEventListener('click', function () {
      var rec = el.dataset.rec;
      var map = { focus: 'focus', relax: 'relax', sleep: 'sleep' };
      var p = PRESETS.find(function (x) { return x.id === map[rec]; });
      if (p) {
        applyPreset(p);
        showView('generator');
        showToast(I18N.get('preset_loaded') + ': ' + (p.name[I18N.lang] || p.name.en));
      }
    });
  });

  function renderEvidenceLegend() {
    var box = document.getElementById('evidence-legend');
    if (!box || !DATA) return;
    box.innerHTML = Object.keys(DATA.evidenceLevels).map(function (k) {
      var v = DATA.evidenceLevels[k];
      return '<span class="evidence-badge" style="background:' + v.color + '22;color:' + v.color + ';border:1px solid ' + v.color + '55">' + v.label + '</span>';
    }).join('');
  }

  function showToast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2800);
  }

  // Init
  visualizer._drawIdle();
  syncLabels();
  loadData();
})();
