/**
 * Procedural Web Audio UI sound synthesizer
 * Lightweight zero-dependency ES module inspired by Cuelume's tactile click/bubble recipes.
 */

let ctx = null;
let enabled = true;
let lastHoverAt = 0;
let lastFocusAt = 0;
let focusNoiseBuf = null;

try {
  const saved = localStorage.getItem('arrazy-sound');
  if (saved === 'off') enabled = false;
} catch (_) {}

function getCtx() {
  if (!enabled) return null;
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/* Unlock Web Audio silently on first user gesture so subsequent icon hovers play immediately */
function unlockAudio() {
  if (!enabled) return;
  getCtx();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true, passive: true });
  window.addEventListener('keydown', unlockAudio, { once: true, capture: true, passive: true });
}

export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(next) {
  enabled = Boolean(next);
  try {
    localStorage.setItem('arrazy-sound', enabled ? 'on' : 'off');
  } catch (_) {}
  if (enabled) playClick();
}

/** Soft tactile micro-tick when hovering interactive icons */
export function playHover(pitch = 1) {
  if (!enabled) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowMs - lastHoverAt < 36) return;

  const audio = getCtx();
  if (!audio || audio.state !== 'running') return;
  lastHoverAt = nowMs;

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(560 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(780 * pitch, now + 0.026);

  gain.gain.setValueAtTime(0.032, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.034);

  osc.connect(gain);
  gain.connect(audio.destination);

  osc.start(now);
  osc.stop(now + 0.038);
}

/** Crisp tactile click for sticker taps & filter pills */
export function playClick() {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(190, now + 0.036);

  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

  osc.connect(gain);
  gain.connect(audio.destination);

  osc.start(now);
  osc.stop(now + 0.045);
}

/** Playful bubble pop for cycling hero words & checklist toggles */
export function playPop(pitch = 1) {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(340 * pitch, now);
  osc.frequency.exponentialRampToValueAtTime(660 * pitch, now + 0.065);

  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);

  osc.connect(gain);
  gain.connect(audio.destination);

  osc.start(now);
  osc.stop(now + 0.08);
}

/** Mechanical card-flip sound for Work <-> Cycling switch */
export function playSwitch(toCycling = false) {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime;
  const freqs = toCycling ? [360, 560] : [520, 340];

  freqs.forEach((freq, idx) => {
    const start = now + idx * 0.042;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.08, start + 0.055);

    gain.gain.setValueAtTime(0.075, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.065);

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start(start);
    osc.stop(start + 0.07);
  });
}

/** Warm two-note confirmation chime for email copy / checklist completion */
export function playSuccess() {
  const audio = getCtx();
  if (!audio) return;

  const now = audio.currentTime;
  [523.25, 659.25].forEach((freq, i) => {
    const start = now + i * 0.075;
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.07, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);

    osc.connect(gain);
    gain.connect(audio.destination);

    osc.start(start);
    osc.stop(start + 0.17);
  });
}

function getFocusNoiseBuffer(audio) {
  if (focusNoiseBuf && focusNoiseBuf.sampleRate === audio.sampleRate) {
    return focusNoiseBuf;
  }
  const len = Math.max(1, Math.floor(audio.sampleRate * 0.014));
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const data = buf.getChannelData(0);
  // Instant-attack razor-crisp mechanical detent transient (zero soft ramp)
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const env = Math.exp(-t * 9.5);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  focusNoiseBuf = buf;
  return buf;
}

/** Crisp, clicky camera aperture/lens dial detent on scroll rotation */
export function playFocusStep(direction = 1, speed = 0.5) {
  if (!enabled) return;
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (nowMs - lastFocusAt < 32) return;

  const audio = getCtx();
  if (!audio || audio.state !== 'running') return;
  lastFocusAt = nowMs;

  const now = audio.currentTime;
  const vel = Math.min(1, Math.max(0.2, speed));
  const up = direction >= 0;

  // 1. Razor-crisp high-mid metallic click transient (clicked aperture ring / camera wheel)
  const noise = audio.createBufferSource();
  noise.buffer = getFocusNoiseBuffer(audio);

  const crispFilter = audio.createBiquadFilter();
  crispFilter.type = 'bandpass';
  crispFilter.frequency.setValueAtTime((up ? 3900 : 3400) + vel * 650, now);
  crispFilter.Q.setValueAtTime(2.6, now);

  const noiseGain = audio.createGain();
  noiseGain.gain.setValueAtTime(0.14 + vel * 0.06, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.011);

  noise.connect(crispFilter);
  crispFilter.connect(noiseGain);
  noiseGain.connect(audio.destination);
  noise.start(now);
  noise.stop(now + 0.013);

  // 2. Tight, dry mechanical snap body (9ms pitch drop for tactile weight without mud)
  const snapOsc = audio.createOscillator();
  const snapGain = audio.createGain();
  const startHz = (up ? 1050 : 880) + vel * 160;

  snapOsc.type = 'triangle';
  snapOsc.frequency.setValueAtTime(startHz, now);
  snapOsc.frequency.exponentialRampToValueAtTime(240, now + 0.009);

  snapGain.gain.setValueAtTime(0.055 + vel * 0.025, now);
  snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.011);

  snapOsc.connect(snapGain);
  snapGain.connect(audio.destination);
  snapOsc.start(now);
  snapOsc.stop(now + 0.013);
}

/** Subtle dry final detent click when lens dial settles */
export function playFocusLock() {
  if (!enabled) return;
  const audio = getCtx();
  if (!audio || audio.state !== 'running') return;

  const now = audio.currentTime;
  const noise = audio.createBufferSource();
  noise.buffer = getFocusNoiseBuffer(audio);

  const filter = audio.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2800, now);
  filter.Q.setValueAtTime(3.2, now);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.06, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.009);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  noise.start(now);
  noise.stop(now + 0.011);
}
