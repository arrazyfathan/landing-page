/**
 * Procedural Web Audio UI sound synthesizer
 * Lightweight zero-dependency ES module inspired by Cuelume's tactile click/bubble recipes.
 */

let ctx = null;
let enabled = true;

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
