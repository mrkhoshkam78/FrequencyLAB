# Frequency Lab v2 — Interactive Frequency & Sound Research Platform

Local-first · Bilingual (FA/EN) · Real-time Binaural Engine · Web Audio API

## What’s new in v2

- **Full Persian (RTL)** with natural copy + English toggle (no layout break)
- **True binaural engine**: independent Left/Right oscillators; Beat = |R − L|
- **Live parameter updates** while playing (no stop/restart): Carrier, Beat, L/R, Volume, Waveform, Balance, Noise
- **Fade In / Fade Out** with linear ramps (no clicks)
- **Real visualizer** driven by AudioAnalyser (waveform, spectrum, L/R channels, beat pulse)
- **SVG icons** (no emoji for primary UI)
- **Professional presets**: Focus, Deep Focus, Relax, Meditation, Sleep, Study, Memory, Calm, Gamma 40 Hz, 528 Hz, 432 Hz
- **Smart recommendations** (suggestions, not medical claims)
- Volume hard-capped, clipping prevention, stereo balance

## Run

```bash
npx serve .
# or
python -m http.server 8080
```

Open in a modern browser. Use **headphones** for binaural modes.

## Structure

```
frequency-lab/
├── index.html
├── css/styles.css
├── js/
│   ├── audio-engine.js   # Real-time Web Audio
│   ├── visuals.js        # Canvas + analyser viz
│   ├── i18n.js           # FA / EN
│   └── app.js            # UI + presets + search
├── data/frequencies.json
└── README.md
```

## Evidence integrity

Scientific vs mystical claims are separated. Evidence levels: Strong / Moderate / Limited / Preliminary / Insufficient / Traditional. No frequency is presented as proven medical treatment.

## License

Educational / research exploration.
