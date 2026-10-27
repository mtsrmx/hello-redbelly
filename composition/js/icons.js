// Original line icons drawn for this film on a 64 x 64 grid.
// Every path carries pathLength="1" so it can "draw on" with a dash offset.
import { s } from './dom.js';

const P = {
  doc: ['M18 8 H38 L48 18 V56 H18 Z', 'M38 8 V18 H48', 'M24 30 H42', 'M24 38 H42', 'M24 46 H34'],
  idcard: ['M8 16 H56 V50 H8 Z', 'M22 25 a5 5 0 1 0 0.01 0', 'M13 43 C13 36 31 36 31 43', 'M37 26 H50', 'M37 33 H50', 'M37 40 H46'],
  people: [
    'M32 18 a6.5 6.5 0 1 0 0.01 0', 'M20 47 C20 33 44 33 44 47',
    'M13 23 a5 5 0 1 0 0.01 0', 'M4 44 C4 35 18 33 22 37',
    'M51 23 a5 5 0 1 0 0.01 0', 'M60 44 C60 35 46 33 42 37',
  ],
  hourglass: ['M18 8 H46', 'M18 56 H46', 'M22 8 C22 22 32 25 32 32 C32 39 22 42 22 56', 'M42 8 C42 22 32 25 32 32 C32 39 42 42 42 56'],
  bond: ['M8 12 H56 V46 H8 Z', 'M16 22 H40', 'M16 30 H32', 'M44 30 a7 7 0 1 0 0.01 0', 'M39 42 L36 55 L41.5 52 L45 56 L48.5 42'],
  loan: ['M6 22 H42 V44 H6 Z', 'M24 28 a5 5 0 1 0 0.01 0', 'M48 46 C58 40 58 24 49 17', 'M49 17 L50 26', 'M49 17 L40 19'],
  fund: ['M30 14 A20 20 0 1 0 50 34 H30 Z', 'M36 8 A20 20 0 0 1 56 28 H36 Z'],
  building: ['M12 56 H54', 'M16 56 V12 H38 V56', 'M38 26 H50 V56', 'M22 20 H24', 'M30 20 H32', 'M22 29 H24', 'M30 29 H32', 'M22 38 H24', 'M30 38 H32', 'M24 56 V47 H30 V56', 'M43 35 H45', 'M43 44 H45'],
  leaf: ['M12 52 C12 26 30 12 54 10 C54 34 40 52 12 52 Z', 'M12 52 L42 22', 'M28 36 L28 26', 'M28 36 L38 36'],
  passport: ['M14 6 H50 V58 H14 Z', 'M32 19 a10 10 0 1 0 0.01 0', 'M32 19 C27 23 27 35 32 39 C37 35 37 23 32 19', 'M22 29 H42', 'M24 48 H40'],
  user: ['M32 12 a11 11 0 1 0 0.01 0', 'M12 58 C12 36 52 36 52 58'],
  lock: ['M16 28 H48 V56 H16 Z', 'M22 28 V20 C22 7 42 7 42 20 V28', 'M32 37 V45'],
  check: ['M17 33 L28 44 L48 22'],
  cross: ['M21 21 L43 43', 'M43 21 L21 43'],
  clock: ['M32 10 a22 22 0 1 0 0.01 0', 'M32 18 V32 L42 38'],
  globe: ['M32 10 a22 22 0 1 0 0.01 0', 'M32 10 C21 18 21 46 32 54 C43 46 43 18 32 10', 'M10 32 H54', 'M14 21 H50', 'M14 43 H50'],
  undo: ['M24 22 H40 C48 22 54 28 54 35 C54 42 48 48 40 48 H22', 'M30 13 L21 22 L30 31'],
  pin: ['M32 56 C24 47 14 36 14 26 C14 15 22 8 32 8 C42 8 50 15 50 26 C50 36 40 47 32 56 Z', 'M32 20 a6 6 0 1 0 0.01 0'],
  stack: ['M14 22 H44 V54 H14 Z', 'M20 16 H50 V48', 'M26 10 H56 V42', 'M20 32 H38', 'M20 40 H34'],
  plane: ['M6 30 L58 8 L46 56 L31 40 Z', 'M31 40 L58 8', 'M31 40 L29 54 L38 44'],
  swap: ['M10 22 H52', 'M44 14 L52 22 L44 30', 'M54 42 H12', 'M20 34 L12 42 L20 50'],
  shield: ['M32 6 L52 14 V30 C52 44 43 53 32 58 C21 53 12 44 12 30 V14 Z'],
  scanface: ['M10 20 V12 H18', 'M46 12 H54 V20', 'M54 44 V52 H46', 'M18 52 H10 V44'],
  bank: ['M8 24 L32 10 L56 24 Z', 'M12 52 H52', 'M8 58 H56', 'M16 30 V46', 'M26 30 V46', 'M38 30 V46', 'M48 30 V46'],
  spark: ['M32 8 V20', 'M32 44 V56', 'M8 32 H20', 'M44 32 H56'],
};

export const ICONS = Object.keys(P);

export function icon(name, { size = 64, color = 'currentColor', width = 3, cls = '' } = {}) {
  const paths = P[name];
  if (!paths) throw new Error(`Unknown icon ${name}`);
  const el = s('svg', {
    viewBox: '0 0 64 64', width: size, height: size, class: `icon icon-${name} ${cls}`,
    fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  for (const d of paths) el.append(s('path', { d, pathLength: 1 }));
  return el;
}

// Draw an icon on (0 -> 1). Paths draw one after another for a hand-made feel.
export function drawIcon(el, p, overlap = 0.55) {
  const paths = el.querySelectorAll('path');
  const n = paths.length;
  const span = 1 / (n - (n - 1) * overlap || 1);
  paths.forEach((path, i) => {
    const a = i * span * (1 - overlap);
    const q = Math.min(1, Math.max(0, (p - a) / span));
    path.style.strokeDasharray = '1 1';
    path.style.strokeDashoffset = String(Math.round((1 - q) * 1000) / 1000);
  });
}

// The outer hexagon of the Redbelly isotype, in the official artwork's own
// coordinates (viewBox 0 0 500 550), traced clockwise from the top vertex.
export const ISO_HEX = [
  [250, 26.6], [462.3, 145.6], [468.3, 156.1], [468.3, 393.9], [462.3, 404.5],
  [256.1, 523.4], [243.9, 523.4], [37.8, 404.5], [31.7, 393.9], [31.7, 156.1], [37.8, 145.6],
];

// Flat-top hexagon path centred on (cx, cy) with radius r (pointy-top when rot = 30).
export function hexPath(cx, cy, r, rot = 30) {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k + rot) * Math.PI) / 180;
    d += (k ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(2) + ' ' + (cy + r * Math.sin(a)).toFixed(2) + ' ';
  }
  return d + 'Z';
}

export function hexPoints(cx, cy, r, rot = 30) {
  const pts = [];
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k + rot) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
