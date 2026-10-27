// The living backdrop: brand slate gradient, a drifting hexagon field taken
// from the isotype, soft red light and ripples that answer key moments.
import { clamp, lerp, kf, rng, E, range } from './engine.js';

// Mood over the film, keyed to scene start times from the script: where the
// red light sits, how bright the hexagon field is, and when ripples run.
function moodFrom(script, portrait) {
  const S = Object.fromEntries(script.scenes.map((x) => [x.id, x]));
  const at = (id, dt = 0) => S[id].start + dt;
  const D = script.duration;
  const art = portrait ? [0.5, 0.71] : [0.75, 0.52];
  const logo = [0.5, 0.42];
  const ripples = [
    [at('reveal', 1.25), logo], [at('verified', 3.45), art], [at('rules', 3.1), art], [at('final', 2.4), art],
    [at('science', 6.0), art], [at('acacia', 3.45), art], [at('end', 0), [0.5, portrait ? 0.34 : 0.4]],
  ];
  const glowX = portrait
    ? [[0, 0.5], [D, 0.5]]
    : [[0, 0.78], [at('reveal'), 0.74], [at('reveal', 1), 0.5], [at('what'), 0.5], [at('what', 1.5), 0.72], [at('how'), 0.7], [at('how', 1), 0.5], [at('verified'), 0.72], [at('acacia'), 0.7], [at('result'), 0.5], [D, 0.5]];
  const glowY = portrait
    ? [[0, 0.62], [at('reveal'), 0.6], [at('reveal', 1), 0.42], [at('what'), 0.42], [at('what', 1.5), 0.7], [at('how'), 0.6], [at('how', 1), 0.55], [at('verified'), 0.7], [at('result'), 0.5], [at('end'), 0.36], [D, 0.36]]
    : [[0, 0.5], [at('reveal'), 0.5], [at('reveal', 1), 0.42], [at('what'), 0.42], [at('what', 1.5), 0.5], [at('end'), 0.42], [D, 0.42]];
  const glowA = [[0, 0.1], [at('reveal', -0.4), 0.12], [at('reveal', 1.25), 0.34], [at('what'), 0.2], [at('what', 1.5), 0.16],
    [at('science'), 0.14], [at('acacia'), 0.16], [at('result'), 0.2], [at('end', -1), 0.18], [at('end'), 0.32], [at('end', 2), 0.24], [D, 0.2]];
  const grid = [[0, 0.035], [at('reveal', -0.5), 0.04], [at('reveal', 1.25), 0.085], [at('what'), 0.06], [at('what', 1.5), 0.05],
    [at('result'), 0.055], [at('end'), 0.07], [D, 0.06]];
  const light = [[0, 0.5], [at('reveal'), 0.6], [at('reveal', 1.25), 0.9], [at('what'), 0.75], [at('end'), 0.85], [D, 0.8]];
  const keys = (arr) => arr.map(([t, v]) => [t, v, E.inOutSine]);
  return { ripples, glowX: keys(glowX), glowY: keys(glowY), glowA: keys(glowA), grid: keys(grid), light: keys(light) };
}

export class Background {
  constructor(canvas, W, H, portrait, script) {
    this.M = moodFrom(script, portrait);
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.W = W;
    this.H = H;
    this.portrait = portrait;
    canvas.width = W;
    canvas.height = H;
    this.R = portrait ? 52 : 50;
    const r = rng(7);
    this.dust = Array.from({ length: 70 }, () => ({
      x: r() * W, y: r() * H, s: 4 + r() * 10, ph: r() * 6.28, f: 0.4 + r() * 0.9, size: 0.8 + r() * 1.8,
    }));
    this.grain = this.makeGrain();
  }

  makeGrain() {
    const n = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const g = cv.getContext('2d');
    const img = g.createImageData(n, n);
    const r = rng(11);
    for (let i = 0; i < n * n; i++) {
      const v = Math.floor(r() * 255);
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return this.g.createPattern(cv, 'repeat');
  }

  draw(t) {
    const { g, W, H, R } = this;
    const P = this.portrait ? 2 : 1;
    const M = this.M;
    const glowX = kf(t, M.glowX) * W;
    const glowY = kf(t, M.glowY) * H;
    const glowA = kf(t, M.glowA);
    const gridA = kf(t, M.grid);
    const light = kf(t, M.light);

    // Base: brand slate (#283A46) into deep navy (#142530).
    const base = g.createLinearGradient(0, 0, W * 0.6, H * 1.1);
    base.addColorStop(0, '#24394a');
    base.addColorStop(0.45, '#192c39');
    base.addColorStop(1, '#0d1922');
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = base;
    g.fillRect(0, 0, W, H);

    // Soft top light.
    const lx = W * (this.portrait ? 0.3 : 0.24);
    const ly = H * (this.portrait ? 0.12 : 0.1);
    const top = g.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.8);
    top.addColorStop(0, `rgba(66, 96, 114, ${0.42 * light})`);
    top.addColorStop(1, 'rgba(66, 96, 114, 0)');
    g.fillStyle = top;
    g.fillRect(0, 0, W, H);

    // Red brand light (#FF5050).
    const gr = Math.max(W, H) * 0.55;
    const glow = g.createRadialGradient(glowX, glowY, 0, glowX, glowY, gr);
    glow.addColorStop(0, `rgba(255, 80, 80, ${glowA})`);
    glow.addColorStop(0.45, `rgba(250, 66, 60, ${glowA * 0.35})`);
    glow.addColorStop(1, 'rgba(250, 66, 60, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    // Hexagon field (pointy-top), drifting slowly.
    const dx = R * Math.sqrt(3);
    const dy = R * 1.5;
    const ox = (t * 7) % dx;
    const oy = (t * 3.5) % (dy * 2);
    const fx = glowX, fy = glowY;
    const maxD = Math.hypot(W, H) * 0.62;
    g.lineWidth = 1.3;
    const ripples = M.ripples.map(([rt, pos]) => ({ age: t - rt, x: pos[0] * W, y: pos[1] * H }))
      .filter((r) => r.age > -0.01 && r.age < 2.6);
    for (let row = -2; row * dy < H + dy * 2; row++) {
      const y = row * dy + oy - dy;
      const shift = (row & 1) * (dx / 2);
      for (let col = -2; col * dx < W + dx * 2; col++) {
        const x = col * dx + shift + ox - dx;
        const d = Math.hypot(x - fx, y - fy);
        let a = gridA * (0.35 + 0.65 * clamp(1 - d / maxD));
        let red = 0;
        for (const rp of ripples) {
          const rr = rp.age * 900;
          const dd = Math.abs(Math.hypot(x - rp.x, y - rp.y) - rr);
          const k = clamp(1 - dd / 110) * clamp(1 - rp.age / 2.6);
          a += k * 0.16;
          red = Math.max(red, k);
        }
        if (a < 0.006) continue;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = (Math.PI / 3) * k + Math.PI / 6;
          const px = x + (R - 3) * Math.cos(ang);
          const py = y + (R - 3) * Math.sin(ang);
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.closePath();
        if (red > 0.02) {
          g.fillStyle = `rgba(255, 80, 80, ${red * 0.07})`;
          g.fill();
          g.strokeStyle = `rgba(255, 120, 120, ${a})`;
        } else {
          g.strokeStyle = `rgba(236, 235, 236, ${a})`;
        }
        g.stroke();
      }
    }

    // Floating dust.
    for (const p of this.dust) {
      const y = (((p.y - t * p.s) % H) + H) % H;
      const x = p.x + Math.sin(t * 0.3 + p.ph) * 12;
      const a = 0.05 + 0.1 * (0.5 + 0.5 * Math.sin(t * p.f + p.ph));
      g.fillStyle = `rgba(236, 235, 236, ${a})`;
      g.beginPath();
      g.arc(x, y, p.size * P * 0.8, 0, Math.PI * 2);
      g.fill();
    }

    // Vignette.
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(6, 12, 17, 0)');
    vg.addColorStop(1, 'rgba(6, 12, 17, 0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    // Fine static grain keeps the dark gradients free of banding after compression.
    g.globalAlpha = 0.03;
    g.globalCompositeOperation = 'overlay';
    g.fillStyle = this.grain;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

