// Finishing touches shared by scenes: hexagon wipes between chapters, light
// sheens across cards, spark bursts on success moments and slow camera drift.
import { h } from './dom.js';
import { clamp, E, tw, range } from './engine.js';

// ---------------------------------------------------------------------------
// Hexagon wipe, drawn on its own canvas above the scenes.
export class Wipe {
  constructor(canvas, W, H, cuts) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.W = W;
    this.H = H;
    canvas.width = W;
    canvas.height = H;
    this.cuts = cuts;
    const R = 74;
    this.R = R;
    const dx = R * Math.sqrt(3);
    const dy = R * 1.5;
    this.cells = [];
    for (let row = -1; row * dy < H + dy; row++) {
      for (let col = -1; col * dx < W + dx; col++) {
        const x = col * dx + (row & 1) * (dx / 2);
        const y = row * dy;
        this.cells.push({ x, y, d: (x / W) * 0.34 + (y / H) * 0.12 });
      }
    }
    this.dirty = true;
  }

  draw(t) {
    const { g, W, H, R } = this;
    const cut = this.cuts.find((c) => t > c - 0.6 && t < c + 0.75);
    if (!cut) {
      if (this.dirty) { g.clearRect(0, 0, W, H); this.dirty = false; }
      return;
    }
    this.dirty = true;
    g.clearRect(0, 0, W, H);
    for (const cell of this.cells) {
      const pin = E.outCubic(clamp((t - (cut - 0.42) - cell.d) / 0.24));
      const pout = E.inCubic(clamp((t - (cut + 0.06) - cell.d) / 0.24));
      const k = pin * (1 - pout);
      if (k <= 0.001) continue;
      const r = (R + 1.5) * k;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = cell.x + r * Math.cos(a);
        const py = cell.y + r * Math.sin(a);
        if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath();
      g.fillStyle = k > 0.97 ? '#1d2f3b' : '#22394a';
      g.fill();
      if (k < 0.97) {
        g.strokeStyle = `rgba(255, 80, 80, ${(0.85 * (1 - k)).toFixed(3)})`;
        g.lineWidth = 3;
        g.stroke();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// A diagonal sheen that sweeps across a card once.
export function addSheen(card) {
  const band = h('div', { class: 'abs', style: { top: '-20%', bottom: '-20%', left: '0', width: '45%', background: 'linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.16) 45%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.16) 55%, rgba(255,255,255,0) 100%)', pointerEvents: 'none' } });
  const clip = h('div', { class: 'abs', 'data-ignore-text': '1', style: { inset: '0', overflow: 'hidden', borderRadius: 'inherit', pointerEvents: 'none' } }, band);
  card.append(clip);
  return band;
}

export function animSheen(band, t, t0, dur = 0.9) {
  const p = range(t, t0, t0 + dur);
  band.style.opacity = p > 0 && p < 1 ? '1' : '0';
  band.style.transform = `translateX(${(-120 + E.inOutCubic(p) * 360).toFixed(1)}%) skewX(-12deg)`;
}

// ---------------------------------------------------------------------------
// Spark burst: short rays that shoot out and fade.
export function addBurst(parent, x, y, { n = 12, r0 = 46, r1 = 120, color = '#ff5050', width = 4 } = {}, before = null) {
  const el = h('div', { class: 'abs', 'data-ignore-text': '1', style: { left: `${x}px`, top: `${y}px`, width: '0', height: '0', pointerEvents: 'none' } });
  const rays = [];
  for (let i = 0; i < n; i++) {
    const ray = h('div', { class: 'abs', style: { left: '0', top: '0', width: `${width}px`, height: '30px', marginLeft: `${-width / 2}px`, borderRadius: `${width}px`, background: color, transformOrigin: '50% 0%' } });
    el.append(ray);
    rays.push({ ray, a: (360 / n) * i + (i % 2 ? 8 : 0), len: i % 2 ? 0.75 : 1 });
  }
  if (before) parent.insertBefore(el, before); else parent.append(el);
  return { el, rays, r0, r1 };
}

export function animBurst(B, t, t0, dur = 0.65) {
  const p = range(t, t0, t0 + dur);
  const on = p > 0 && p < 1;
  B.el.style.display = on ? 'block' : 'none';
  if (!on) return;
  const e = E.outCubic(p);
  for (const { ray, a, len } of B.rays) {
    const dist = B.r0 + (B.r1 - B.r0) * e * len;
    const L = 34 * (1 - p) * len + 4;
    ray.style.height = `${L.toFixed(1)}px`;
    ray.style.transform = `rotate(${a}deg) translateY(${dist.toFixed(1)}px)`;
    ray.style.opacity = String((1 - p).toFixed(3));
  }
}

// ---------------------------------------------------------------------------
// Slow push-in on an art box across a scene, on top of its base scale.
export function drift(art, t, start, end, base = 1.1, amount = 0.035) {
  const p = E.inOutSine(range(t, start, end));
  art.style.transform = `translateY(${(-14 * p).toFixed(2)}px) scale(${(base * (1 + amount * p)).toFixed(4)})`;
}
