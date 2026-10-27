// DOM and SVG helpers plus the kinetic-type system used by every scene.
import { tw, E, clamp } from './engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  setAttrs(el, attrs);
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(k));
  return el;
}

export function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.append(k instanceof Node ? k : document.createTextNode(k));
  return el;
}

function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
}

// Set transform, opacity and blur in one call. Values are rounded so that
// identical times always produce identical styles.
export function fx(el, { x = 0, y = 0, s = 1, sx, sy, r = 0, o = 1, blur = 0, unit = 'px', z } = {}) {
  const sxx = sx ?? s;
  const syy = sy ?? s;
  el.style.transform =
    `translate3d(${round(x)}${unit}, ${round(y)}${unit}, 0)` +
    (r ? ` rotate(${round(r)}deg)` : '') +
    (sxx !== 1 || syy !== 1 ? ` scale(${round(sxx, 4)}, ${round(syy, 4)})` : '');
  el.style.opacity = round(clamp(o), 4);
  el.style.filter = blur > 0.05 ? `blur(${round(blur)}px)` : 'none';
  if (z != null) el.style.zIndex = z;
}

export const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// Kinetic type

// Build lines of words. `accent` lists phrases (whole words) to colour red.
export function words(lines, accent = [], cls = '') {
  const root = h('div', { class: `txt ${cls}` });
  const all = [];
  const lineEls = [];
  for (const line of lines) {
    const ln = h('span', { class: 'ln' });
    const tokens = line.split(' ');
    const flags = tokens.map(() => false);
    for (const phrase of accent) {
      const p = phrase.split(' ');
      for (let i = 0; i + p.length <= tokens.length; i++) {
        if (p.every((w, j) => tokens[i + j] === w)) for (let j = 0; j < p.length; j++) flags[i + j] = true;
      }
    }
    tokens.forEach((tok, i) => {
      const w = h('span', { class: 'w' + (flags[i] ? ' accent' : '') }, tok);
      ln.append(w);
      if (i < tokens.length - 1) ln.append(' ');
      all.push(w);
    });
    root.append(ln);
    lineEls.push(ln);
  }
  return { el: root, words: all, lines: lineEls };
}

// Reveal words with a masked rise, then send them up and away at `outAt`.
export function animWords(ws, t, inAt, outAt = Infinity, o = {}) {
  const {
    stagger = 0.055, dur = 0.85, rise = 0.9, blur = 10, ease = E.outExpo,
    outStagger = 0.02, outDur = 0.42, outRise = -0.5, outEase = E.inCubic,
  } = o;
  ws.forEach((w, i) => {
    const pin = tw(t, inAt + i * stagger, dur, ease);
    const pout = tw(t, outAt + i * outStagger, outDur, outEase);
    const y = (1 - pin) * rise + pout * outRise;
    fx(w, { y, unit: 'em', o: Math.min(pin * 1.4, 1) * (1 - pout), blur: (1 - pin) * blur + pout * blur * 0.6 });
  });
}

// Fade-and-slide for a whole block.
export function animBlock(el, t, inAt, outAt = Infinity, o = {}) {
  const { dur = 0.8, dy = 40, dx = 0, outDur = 0.4, outDy = -24, outDx = 0, ease = E.outExpo, blur = 8, s0 = 1 } = o;
  const pin = tw(t, inAt, dur, ease);
  const pout = tw(t, outAt, outDur, E.inCubic);
  fx(el, {
    x: (1 - pin) * dx + pout * outDx,
    y: (1 - pin) * dy + pout * outDy,
    s: s0 + (1 - s0) * pin,
    o: pin * (1 - pout),
    blur: (1 - pin) * blur + pout * blur * 0.5,
  });
  return pin * (1 - pout);
}

// A visible-when helper so off-screen scenes cost nothing to render.
export function show(el, on) {
  const v = on ? 'block' : 'none';
  if (el.style.display !== v) el.style.display = v;
}

// Collect every piece of text that is visible at this moment (used by the verifier).
export function visibleText(root) {
  const out = [];
  const stage = root.getBoundingClientRect();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const txt = n.textContent.replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    const el = n.parentElement;
    if (!el || el.closest('[data-ignore-text]')) continue;
    let op = 1;
    let node = el;
    let hidden = false;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.visibility === 'hidden' || cs.display === 'none') { hidden = true; break; }
      op *= parseFloat(cs.opacity);
      node = node.parentElement;
    }
    if (hidden || op < 0.02) continue;
    const r = el.getBoundingClientRect();
    if (r.right < stage.left || r.left > stage.right || r.bottom < stage.top || r.top > stage.bottom) continue;
    out.push(txt);
  }
  return out;
}
