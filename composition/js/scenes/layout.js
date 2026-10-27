// Shared layout: a copy column and an 800 x 800 art box, arranged for 16:9 or 9:16.
import { h } from '../dom.js';

export function copyBox(ctx, { width = 860, align = 'left', top } = {}) {
  const { W, H, portrait } = ctx;
  const el = h('div', { class: 'abs copy' });
  if (portrait) {
    Object.assign(el.style, {
      left: '88px', width: `${W - 176}px`, top: `${top ?? 250}px`, height: '640px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: align,
    });
  } else {
    Object.assign(el.style, {
      left: '128px', width: `${width}px`, top: '0px', height: `${H}px`,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: align,
    });
  }
  return el;
}

// The art box is an 800 x 800 coordinate space. Scenes position things inside it
// in those units, and the box itself is placed and scaled per orientation.
export function artBox(ctx, { cx, cy, scale } = {}) {
  const { portrait } = ctx;
  const el = h('div', { class: 'abs art' });
  const x = cx ?? (portrait ? 540 : 1440);
  const y = cy ?? (portrait ? 1370 : 556);
  const k = scale ?? 1.1;
  Object.assign(el.style, {
    left: `${x - 400}px`, top: `${y - 400}px`, width: '800px', height: '800px',
    transform: `scale(${k})`, transformOrigin: '50% 50%',
  });
  return el;
}

export function place(el, x, y, w, hgt) {
  Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
  if (w != null) el.style.width = `${w}px`;
  if (hgt != null) el.style.height = `${hgt}px`;
  return el;
}

// Centre an element of known size on (x, y).
export function centre(el, x, y, w, hgt) {
  return place(el, x - w / 2, y - hgt / 2, w, hgt);
}
