// Deterministic animation maths. Every visual is a pure function of time t
// (seconds), so the film renders identically frame by frame and plays live.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;
export const range = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (p) => p * p * (3 - 2 * p);

const pow = Math.pow;
export const E = {
  linear: (p) => p,
  inQuad: (p) => p * p,
  outQuad: (p) => 1 - (1 - p) * (1 - p),
  inOutQuad: (p) => (p < 0.5 ? 2 * p * p : 1 - pow(-2 * p + 2, 2) / 2),
  inCubic: (p) => p * p * p,
  outCubic: (p) => 1 - pow(1 - p, 3),
  inOutCubic: (p) => (p < 0.5 ? 4 * p * p * p : 1 - pow(-2 * p + 2, 3) / 2),
  outQuart: (p) => 1 - pow(1 - p, 4),
  inOutQuart: (p) => (p < 0.5 ? 8 * pow(p, 4) : 1 - pow(-2 * p + 2, 4) / 2),
  outQuint: (p) => 1 - pow(1 - p, 5),
  inOutQuint: (p) => (p < 0.5 ? 16 * pow(p, 5) : 1 - pow(-2 * p + 2, 5) / 2),
  inExpo: (p) => (p === 0 ? 0 : pow(2, 10 * p - 10)),
  outExpo: (p) => (p === 1 ? 1 : 1 - pow(2, -10 * p)),
  inOutExpo: (p) =>
    p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? pow(2, 20 * p - 10) / 2 : (2 - pow(2, -20 * p + 10)) / 2,
  outBack: (p) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * pow(p - 1, 3) + c1 * pow(p - 1, 2);
  },
  outBackSoft: (p) => {
    const c1 = 1.1, c3 = c1 + 1;
    return 1 + c3 * pow(p - 1, 3) + c1 * pow(p - 1, 2);
  },
  inBack: (p) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * p * p * p - c1 * p * p;
  },
  outSine: (p) => Math.sin((p * Math.PI) / 2),
  inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
};

// Progress of a tween that starts at `a` and lasts `d` seconds.
export const tw = (t, a, d, e = E.outExpo) => e(range(t, a, a + d));

// Damped spring from 0 to 1, `s` seconds after it starts. Overshoots once or twice.
export function spring(s, freq = 2.4, damping = 0.42) {
  if (s <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const z = damping;
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
}

// In-hold-out envelope: 0 before `a`, eases to 1 over `din`, holds, eases back to 0 from `b`.
export function inOut(t, a, din, b, dout, ein = E.outCubic, eout = E.inCubic) {
  if (t < a || t > b + dout) return 0;
  if (t < a + din) return ein(range(t, a, a + din));
  if (t < b) return 1;
  return 1 - eout(range(t, b, b + dout));
}

// Piecewise keyframes: [[time, value, easeIntoThisKey?], ...] sorted by time.
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) return lerp(v0, v1, (e || E.inOutCubic)(range(t, t0, t1)));
  }
  return keys[keys.length - 1][1];
}

// Deterministic pseudo-random numbers (mulberry32), so "random" layouts never change.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 1D value noise for gentle drift.
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    const s = Math.sin((n + seed * 101.3) * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };
  return lerp(h(i), h(i + 1), smooth(f)) * 2 - 1;
}

// Cubic bezier point.
export function bez(p0, p1, p2, p3, u) {
  const v = 1 - u;
  return [
    v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
  ];
}

export const TAU = Math.PI * 2;
