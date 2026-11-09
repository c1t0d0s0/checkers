// Wooden "clack" synthesised with Web Audio (no audio files).

let ctx = null;
let noiseBuf = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = on; }
export function isSoundEnabled() { return enabled; }

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const len = Math.floor(ctx.sampleRate * 0.04);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Call from a user gesture so iOS/Safari allow audio.
export function unlockAudio() { ensureCtx(); }

function clack(t, { pitch = 1, gain = 1, body = 1 } = {}) {
  const out = ctx.createGain();
  out.gain.value = 0.9 * gain;
  out.connect(ctx.destination);

  // Sharp transient: band-passed noise.
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400 * pitch;
  bp.Q.value = 1.4;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(1.0, t + 0.002);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  n.connect(bp).connect(ng).connect(out);
  n.start(t);
  n.stop(t + 0.05);

  // Hollow wooden resonances that die out quickly.
  const partials = [[920, 0.55, 0.055], [1480, 0.32, 0.04], [2650, 0.14, 0.025], [260, 0.35 * body, 0.06]];
  for (const [f, a, dur] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * pitch * 1.03, t);
    o.frequency.exponentialRampToValueAtTime(f * pitch, t + 0.02);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(a, t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

// kind: 'place' | 'capture' | 'crown'
export function playSound(kind = 'place') {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const jitter = 1 + (Math.random() - 0.5) * 0.06;
  if (kind === 'capture') {
    clack(t, { pitch: 0.82 * jitter, gain: 1.1, body: 1.6 });
  } else if (kind === 'crown') {
    clack(t, { pitch: 1.0 * jitter, gain: 0.9 });
    clack(t + 0.09, { pitch: 1.12 * jitter, gain: 0.8 });
  } else {
    clack(t, { pitch: jitter });
  }
}
