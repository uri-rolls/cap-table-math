// Tiny WebAudio synth for feedback tones plus haptics. No assets, created lazily on first gesture.
let ctx = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq, { start = 0, dur = 0.12, type = 'sine', gain = 0.08, slide = 0 } = {}) {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sounds = {
  tap() { tone(880, { dur: 0.04, gain: 0.03, type: 'triangle' }); },
  correct(streak = 0) {
    tone(660, { dur: 0.1, type: 'triangle' });
    tone(990, { start: 0.08, dur: 0.14, type: 'triangle' });
    if (streak >= 3) tone(1320, { start: 0.16, dur: 0.16, type: 'triangle', gain: 0.06 });
  },
  wrong() { tone(220, { dur: 0.22, type: 'sawtooth', gain: 0.04, slide: -60 }); },
  timeout() { tone(196, { dur: 0.3, type: 'square', gain: 0.03 }); },
  tick() { tone(1400, { dur: 0.03, gain: 0.025, type: 'square' }); },
  finish(good) {
    const notes = good ? [523, 659, 784, 1047] : [523, 587, 659];
    notes.forEach((f, i) => tone(f, { start: i * 0.09, dur: 0.18, type: 'triangle', gain: 0.06 }));
  },
  best() {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, { start: i * 0.07, dur: 0.22, type: 'triangle', gain: 0.07 }));
  },
};

export function haptic(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch { /* unsupported */ }
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
