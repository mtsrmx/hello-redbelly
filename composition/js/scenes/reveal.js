// 0:10 to 0:25. The tangled path pulls straight and folds into the Redbelly
// isotype; then what Redbelly is, what goes on it, and what changes.
import { h, s, fx, words, animWords, animBlock } from '../dom.js';
import { E, tw, spring, kf, clamp, lerp, range, rng } from '../engine.js';
import { icon, drawIcon, hexPath, hexPoints } from '../icons.js';
import { copyBox, artBox, place } from './layout.js';
import { drift, addSheen, animSheen } from '../polish.js';

// Horizontal lockup geometry (official file viewBox 1080 x 300). The midline of
// the isotype's hexagon outline, used for the line-to-logo morph.
const LOCKUP = { w: 1080, h: 300, iso: { cx: 126.34, cy: 150, top: 17.3, bottom: 282.7, left: 10.9, right: 241.8, yu: 84, yl: 216 }, stroke: 13.4 };

function lockupFrame(ctx) {
  const { W, H, portrait } = ctx;
  const w = portrait ? 860 : 1000;
  const k = w / LOCKUP.w;
  const hgt = LOCKUP.h * k;
  const cx = W / 2;
  const cy = H * 0.42;
  return { x: cx - w / 2, y: cy - hgt / 2, w, h: hgt, k };
}

function hexOutline(f) {
  const i = LOCKUP.iso;
  const P = (x, y) => [f.x + x * f.k, f.y + y * f.k];
  return [P(i.cx, i.top), P(i.right, i.yu), P(i.right, i.yl), P(i.cx, i.bottom), P(i.left, i.yl), P(i.left, i.yu)];
}

// Sample a closed polygon at n points, starting from vertex `start`.
function samplePoly(vs, n, start = 3) {
  const seg = vs.map((v, i) => [v, vs[(i + 1) % vs.length]]);
  const lens = seg.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]));
  const total = lens.reduce((x, y) => x + y, 0);
  const out = [];
  for (let j = 0; j < n; j++) {
    let d = (j / (n - 1)) * total;
    let i = start;
    for (let guard = 0; guard < 12; guard++) {
      const L = lens[i % 6];
      if (d <= L) break;
      d -= L;
      i++;
    }
    const [a, b] = seg[i % 6];
    const u = d / lens[i % 6];
    out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]);
  }
  return out;
}

const reveal = {
  pre: 0.05,
  post: 0.45,
  build(ctx) {
    const { root, data, W, H, portrait } = ctx;
    const f = lockupFrame(ctx);
    const N = 241;
    const line = Array.from({ length: N }, (_, i) => [lerp(W * (portrait ? 0.12 : 0.2), W * (portrait ? 0.88 : 0.8), i / (N - 1)), H * 0.42]);
    const hex = samplePoly(hexOutline(f), N, 3);
    const svg = s('svg', { class: 'abs', width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'left:0;top:0' });
    const path = s('path', { fill: 'none', stroke: '#ff5050', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.append(path);

    const lock = ctx.inlineSvg('logoH');
    place(lock, f.x, f.y, f.w, f.h);
    lock.querySelector('svg').setAttribute('width', '100%');
    lock.querySelector('svg').setAttribute('height', '100%');
    const glow = h('div', { class: 'abs', style: { left: `${f.x + LOCKUP.iso.cx * f.k - 260}px`, top: `${f.y + 150 * f.k - 260}px`, width: '520px', height: '520px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,80,80,0.55), rgba(255,80,80,0) 65%)' } });

    const copy = h('div', { class: 'abs center', style: { left: '0', width: `${W}px`, top: `${H * (portrait ? 0.56 : 0.66)}px` } });
    const tx = words(portrait ? ['Redbelly is built', 'to change that.'] : data.text.lines, data.text.accent, 'h1');
    copy.append(tx.el);
    root.append(glow, svg, lock, copy);
    return { path, line, hex, lock, glow, tx, f };
  },
  update(st, t, ctx) {
    const { path, line, hex, lock, glow, tx, f } = st;
    const lt = t - ctx.data.start;
    const m = tw(lt, 0.12, 0.85, E.inOutCubic);
    const swirl = (1 - m) * -1.2;
    const cx = f.x + LOCKUP.iso.cx * f.k;
    const cy = f.y + 150 * f.k;
    const pts = line.map((p, i) => {
      let x = lerp(p[0], hex[i][0], m);
      let y = lerp(p[1], hex[i][1], m);
      const a = swirl * m;
      const dx = x - cx, dy = y - cy;
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
    });
    path.setAttribute('d', 'M' + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + (m > 0.999 ? ' Z' : ''));
    path.setAttribute('stroke-width', String(lerp(10, LOCKUP.stroke * f.k, m).toFixed(2)));
    const into = tw(lt, 0.95, 0.32, E.inOutCubic);
    path.style.opacity = String(1 - into);
    path.style.filter = `drop-shadow(0 0 ${Math.round(lerp(14, 4, m))}px rgba(255,80,80,0.85))`;

    // Official lockup: isotype fades in over the drawn hexagon, then the
    // logotype wipes in from the left. Clip only; proportions untouched.
    const iso = tw(lt, 0.92, 0.36, E.outCubic);
    const wipe = tw(lt, 1.25, 0.7, E.inOutQuart);
    const isoEdge = (255 / 1080) * 100;
    const right = lerp(100 - isoEdge, -5, wipe);
    lock.style.clipPath = `inset(-20% ${right.toFixed(2)}% -20% -5%)`;
    const pout = tw(lt, 3.5, 0.42, E.inCubic);
    const pulse = 1 + 0.035 * Math.exp(-Math.max(0, lt - 1.25) * 6) * (lt > 1.25 ? 1 : 0);
    fx(lock, { o: iso * (1 - pout), s: pulse * (1 - pout * 0.18), y: -pout * 60, blur: pout * 8 });
    const g = Math.exp(-Math.max(0, lt - 1.25) * 2.2) * (lt > 1.2 ? 1 : tw(lt, 0.8, 0.4));
    fx(glow, { o: g * 0.9 * (1 - pout), s: 0.7 + 0.5 * tw(lt, 0.9, 1.0, E.outCubic) });
    animWords(tx.words, lt, 0.25, 3.28, { stagger: 0.06 });
  },
};

// ---------------------------------------------------------------------------
// Asset hexagons are shared by "what" (honeycomb) and "assets" (row).
const ASSET_ICONS = ['bond', 'loan', 'fund', 'building', 'leaf'];
const RING_ANGLES = [300, 0, 60, 120, 180];

function assetHex(name) {
  const el = h('div', { class: 'hexbadge' });
  const bg = s('svg', { class: 'hexbg', viewBox: '-100 -100 200 200' },
    s('path', { d: hexPath(0, 0, 96, 30), fill: 'rgba(40,58,70,0.92)', stroke: 'rgba(236,235,236,0.22)', 'stroke-width': 3 }),
    s('path', { class: 'hexfill', d: hexPath(0, 0, 96, 30), fill: '#ff5050', stroke: 'none', opacity: 0 }));
  const ic = icon(name, { size: 96, color: '#ecebec', width: 3.2 });
  el.append(bg, ic);
  return { el, ic, fill: bg.querySelector('.hexfill') };
}

function honeycomb(ctx) {
  const { portrait } = ctx;
  const ax = 400, ay = 380, D = 168;
  const toStage = (x, y) => portrait ? [540 + (x - 400) * 1.1, 1370 + (y - 400) * 1.1] : [1440 + (x - 400) * 1.1, 556 + (y - 400) * 1.1];
  const ring1 = [0, 60, 120, 180, 240, 300].map((a) => [ax + D * Math.cos((a * Math.PI) / 180), ay + D * Math.sin((a * Math.PI) / 180), a]);
  const ring2 = [];
  for (let k = 0; k < 6; k++) {
    const a = k * 60;
    ring2.push([ax + 2 * D * Math.cos((a * Math.PI) / 180), ay + 2 * D * Math.sin((a * Math.PI) / 180)]);
    const b = a + 30;
    ring2.push([ax + Math.sqrt(3) * D * Math.cos((b * Math.PI) / 180), ay + Math.sqrt(3) * D * Math.sin((b * Math.PI) / 180)]);
  }
  return { ax, ay, D, ring1, ring2, toStage, scale: 1.1, r: 86 };
}

const what = {
  pre: 0.1,
  post: 0.1,
  build(ctx) {
    const { root, data } = ctx;
    const copy = copyBox(ctx, { width: 880 });
    const tx = words(data.text.lines, data.text.accent, 'h1');
    copy.append(tx.el);
    const art = artBox(ctx);
    const HC = honeycomb(ctx);
    const svg = s('svg', { class: 'abs', width: 800, height: 800, viewBox: '0 0 800 800', style: 'left:0;top:0' });
    const outer = HC.ring2.map(([x, y], i) => {
      const p = s('path', { d: hexPath(x, y, HC.r, 30), fill: 'rgba(40,58,70,0.35)', stroke: 'rgba(236,235,236,0.14)', 'stroke-width': 2 });
      svg.append(p);
      return p;
    });
    // Curved links from the centre, with ring nodes as in the isotype.
    const links = HC.ring1.map(([x, y], i) => {
      const mx = (HC.ax + x) / 2 + (i % 2 ? 30 : -30);
      const my = (HC.ay + y) / 2 + (i % 2 ? -24 : 24);
      const d = `M${HC.ax} ${HC.ay} Q${mx} ${my} ${x} ${y}`;
      const p = s('path', { d, fill: 'none', stroke: 'rgba(255,80,80,0.75)', 'stroke-width': 3, pathLength: 1, 'stroke-dasharray': '1 1' });
      const node = s('circle', { r: 9, fill: '#142530', stroke: '#ff5050', 'stroke-width': 3.5 });
      const spark = s('circle', { r: 5, fill: '#ffffff' });
      svg.append(p, node, spark);
      return { p, node, spark, a: [HC.ax, HC.ay], c: [mx, my], b: [x, y] };
    });
    const empty = s('path', { d: hexPath(HC.ring1[4][0], HC.ring1[4][1], HC.r, 30), fill: 'rgba(40,58,70,0.6)', stroke: 'rgba(236,235,236,0.18)', 'stroke-width': 2 });
    svg.append(empty);
    art.append(svg);
    // Five asset hexagons around the centre.
    const assets = ASSET_ICONS.map((n, i) => {
      const A = assetHex(n);
      const ang = RING_ANGLES[i];
      const [x, y] = HC.ring1.find((r) => r[2] === ang);
      place(A.el, x - 100, y - 100, 200, 200);
      A.el.style.transform = 'scale(0.86)';
      art.append(A.el);
      return { ...A, x, y };
    });
    // Centre: the official isotype.
    const core = ctx.inlineSvg('isoWhite');
    place(core, HC.ax - 75, HC.ay - 82, 150, 165);
    const coreGlow = h('div', { class: 'abs', style: { left: `${HC.ax - 170}px`, top: `${HC.ay - 170}px`, width: '340px', height: '340px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,80,80,0.5), rgba(255,80,80,0) 68%)' } });
    art.prepend(coreGlow);
    art.append(core);
    const pin = h('div', { class: 'abs', style: { left: '0', right: '0', top: '720px', display: 'flex', justifyContent: 'center' } },
      h('div', { class: 'chip' }, h('span', { class: 'dot' }, icon('pin', { size: 24, color: '#fff', width: 5 })), data.ui.pin));
    art.append(pin);
    root.append(art, copy);
    return { tx, outer, links, empty, assets, core, coreGlow, pin, HC, art };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const D = ctx.data.end - ctx.data.start;
    const { tx, outer, links, empty, assets, core, coreGlow, pin, HC } = st;
    drift(st.art, lt, 0, D, 1.1, 0.03);
    animWords(tx.words, lt, 0.04, D - 0.25, { stagger: 0.05 });
    const fade = tw(lt, D - 0.2, 0.5, E.inCubic);
    fx(core, { s: spring(lt + 0.05, 1.8, 0.5) * (1 - fade * 0.3), o: tw(lt, -0.05, 0.4) * (1 - fade) });
    fx(coreGlow, { o: (0.6 + 0.25 * Math.sin(lt * 3)) * tw(lt, 0.0, 0.6) * (1 - fade) });
    outer.forEach((p, i) => {
      const a = 0.55 + i * 0.05;
      p.style.opacity = String(tw(lt, a, 0.6, E.outCubic) * (1 - fade) * (0.55 + 0.45 * Math.sin(lt * 1.3 + i)));
    });
    links.forEach((L, i) => {
      const d = tw(lt, 0.9 + i * 0.08, 0.7, E.inOutCubic);
      L.p.style.strokeDashoffset = String((1 - d).toFixed(3));
      L.p.style.opacity = String(1 - fade);
      const nd = spring(lt - (1.3 + i * 0.08), 2.4, 0.5);
      const u = 0.5;
      const nx = (1 - u) * (1 - u) * L.a[0] + 2 * (1 - u) * u * L.c[0] + u * u * L.b[0];
      const ny = (1 - u) * (1 - u) * L.a[1] + 2 * (1 - u) * u * L.c[1] + u * u * L.b[1];
      L.node.setAttribute('cx', nx.toFixed(1));
      L.node.setAttribute('cy', ny.toFixed(1));
      L.node.setAttribute('r', (9 * clamp(nd, 0, 1.4)).toFixed(2));
      L.node.style.opacity = String(1 - fade);
      const v = ((lt - 1.6 - i * 0.21) * 0.55) % 1;
      const vv = v < 0 ? 0 : v;
      const sx = (1 - vv) * (1 - vv) * L.a[0] + 2 * (1 - vv) * vv * L.c[0] + vv * vv * L.b[0];
      const sy = (1 - vv) * (1 - vv) * L.a[1] + 2 * (1 - vv) * vv * L.c[1] + vv * vv * L.b[1];
      L.spark.setAttribute('cx', sx.toFixed(1));
      L.spark.setAttribute('cy', sy.toFixed(1));
      L.spark.style.opacity = String(lt > 1.6 + i * 0.21 ? Math.sin(vv * Math.PI) * (1 - fade) : 0);
    });
    empty.style.opacity = String(tw(lt, 0.5, 0.5) * (1 - fade) * 0.8);
    // The five assets pop in, then hand over to the "assets" scene at 17.5s.
    assets.forEach((A, i) => {
      const sp = spring(lt - (0.5 + i * 0.1), 2.2, 0.5);
      fx(A.el, { s: 0.86 * sp, o: t < ctx.data.end ? clamp(sp * 2) : 0 });
      drawIcon(A.ic, tw(lt, 0.65 + i * 0.1, 0.8, E.outCubic));
    });
    fx(pin, { o: tw(lt, 1.8, 0.5) * (1 - fade), y: (1 - tw(lt, 1.8, 0.8)) * 30 });
  },
};

// ---------------------------------------------------------------------------
const assets = {
  pre: 0.0,
  post: 0.3,
  build(ctx) {
    const { root, data, portrait, W } = ctx;
    const HC = honeycomb(ctx);
    const items = ASSET_ICONS.map((n, i) => {
      const A = assetHex(n);
      A.ic.querySelectorAll('path').forEach((p) => { p.style.strokeDasharray = 'none'; });
      const [x, y] = HC.ring1.find((r) => r[2] === RING_ANGLES[i]);
      const from = HC.toStage(x, y);
      const to = portrait
        ? (i < 3 ? [W / 2 + (i - 1) * 320, 820] : [W / 2 + (i - 3.5) * 420, 1290])
        : [960 + (i - 2) * 352, 448];
      const cap = h('div', { class: 'abs center', style: { width: '400px', fontSize: portrait ? '52px' : '48px', fontWeight: 500 } }, data.text.words[i]);
      place(A.el, -100, -100, 200, 200);
      const wrap = h('div', { class: 'abs', style: { left: '0', top: '0' } }, A.el);
      root.append(wrap, cap);
      return { ...A, wrap, cap, from, to };
    });
    return { items, s0: 0.86 * HC.scale };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { items, s0 } = st;
    const beats = [0.45, 0.76, 1.07, 1.39, 1.7];
    const out = tw(lt, 3.45, 0.45, E.inCubic);
    items.forEach((A, i) => {
      const m = tw(lt, i * 0.04, 0.75, E.inOutCubic);
      const x = lerp(A.from[0], A.to[0], m);
      const y = lerp(A.from[1], A.to[1], m) - Math.sin(m * Math.PI) * 40;
      const pop = lt > beats[i] ? 1 + 0.12 * Math.exp(-(lt - beats[i]) * 7) * Math.cos((lt - beats[i]) * 18) : 1;
      const sc = lerp(s0, 1.36, m) * pop * (1 - out * 0.2);
      fx(A.wrap, { x, y, s: sc, o: 1 - out, y2: 0 });
      A.wrap.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - out * 40).toFixed(1)}px, 0) scale(${sc.toFixed(4)})`;
      A.fill.setAttribute('opacity', String((Math.exp(-Math.max(0, lt - beats[i]) * 3) * (lt > beats[i] ? 0.9 : 0)).toFixed(3)));
      const c = tw(lt, beats[i], 0.6, E.outExpo);
      place(A.cap, A.to[0] - 200, A.to[1] + 150);
      fx(A.cap, { y: (1 - c) * 36 - out * 30, o: c * (1 - out), blur: (1 - c) * 8 });
    });
  },
};

// ---------------------------------------------------------------------------
const digital = {
  pre: 0.2,
  post: 0.5,
  build(ctx) {
    const { root, data } = ctx;
    const copy = copyBox(ctx, { width: 880 });
    const tx = words(data.text.lines, data.text.accent, 'h1');
    copy.append(tx.el);
    const art = artBox(ctx);
    const cw = 560, ch = 360, cx0 = 120, cy0 = 120;
    // Paper certificate.
    const paper = h('div', { class: 'abs', style: { width: `${cw}px`, height: `${ch}px`, borderRadius: '18px', background: 'linear-gradient(170deg,#f6f5f6,#dcdadc)', boxShadow: 'var(--shadow)', color: '#283a46', padding: '40px 44px', overflow: 'hidden' } });
    paper.append(
      h('div', { style: { fontSize: '22px', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, color: '#848b91' } }, data.ui.paper),
      ...[86, 72, 80, 54].map((w) => h('div', { style: { height: '16px', width: `${w}%`, background: '#c9c7c9', borderRadius: '8px', marginTop: '26px' } })),
      h('div', { class: 'abs', style: { right: '44px', bottom: '36px', width: '92px', height: '92px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 35%, #ff7a7a, #e23a36)', boxShadow: '0 6px 14px rgba(160,30,30,0.35)' } }),
    );
    place(paper, cx0, cy0, cw, ch);
    // Digital version, revealed by the scan line.
    const dig = h('div', { class: 'card', style: { width: `${cw}px`, height: `${ch}px`, borderRadius: '26px', padding: '36px 40px', overflow: 'hidden', border: '2px solid rgba(255,80,80,0.75)', boxShadow: '0 0 0 1px rgba(255,80,80,0.25), 0 30px 90px rgba(255,80,80,0.25), var(--shadow)' } });
    const hexes = s('svg', { class: 'abs', width: cw, height: ch, style: 'left:0;top:0;opacity:0.22' });
    for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) hexes.append(s('path', { d: hexPath(40 + c * 62 + (r % 2) * 31, 20 + r * 54, 34, 30), fill: 'none', stroke: '#ecebec', 'stroke-width': 1.2 }));
    const iso = ctx.inlineSvg('isoRed');
    place(iso, cw - 40 - 70, 34, 70, 77);
    dig.append(hexes,
      h('div', { class: 'abs label', style: { left: '40px', top: '44px', color: '#ff5050' } }, data.ui.card),
      h('div', { class: 'abs', style: { left: '40px', top: '96px', color: '#ecebec' } }, icon('building', { size: 120, color: '#ecebec', width: 2.6 })),
      iso);
    place(dig, cx0, cy0, cw, ch);
    // Rule chips that come out of the digital card.
    const chips = data.ui.rules.map((r, i) => {
      const tick = icon('check', { size: 26, color: '#fff', width: 6 });
      const c = h('div', { class: 'chip abs' }, h('span', { class: 'dot' }, tick), r);
      place(c, cx0 + 30, cy0 + ch + 44 + i * 96);
      art.append(c);
      return { c, tick };
    });
    const beam = h('div', { class: 'abs', style: { left: `${cx0 - 30}px`, width: `${cw + 60}px`, height: '6px', borderRadius: '3px', background: '#ff5050', boxShadow: '0 0 24px 6px rgba(255,80,80,0.75)' } });
    art.prepend(paper);
    art.append(dig, beam);
    const sheen = addSheen(dig);
    root.append(art, copy);
    return { tx, paper, dig, beam, chips, cy0, ch, art, sheen };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { tx, paper, dig, beam, chips, cy0, ch } = st;
    drift(st.art, lt, 0, 3.75);
    animSheen(st.sheen, lt, 1.5, 0.9);
    animWords(tx.words, lt, 0.1, 3.45, { stagger: 0.055 });
    const pin = tw(lt, 0.0, 0.8, E.outExpo);
    const out = tw(lt, 3.4, 0.45, E.inCubic);
    const tilt = lerp(-8, -2, pin);
    const scan = tw(lt, 0.65, 0.8, E.inOutSine);
    const common = { y: (1 - pin) * 120 - out * 40, r: tilt + out * 3, o: pin * (1 - out), blur: (1 - pin) * 10 + out * 8 };
    fx(paper, common);
    fx(dig, common);
    dig.style.clipPath = `inset(0 0 ${((1 - scan) * 100).toFixed(2)}% 0 round 26px)`;
    paper.style.clipPath = `inset(${(scan * 100).toFixed(2)}% 0 0 0 round 18px)`;
    beam.style.top = `${(cy0 + scan * ch - 3).toFixed(1)}px`;
    fx(beam, { o: scan > 0 && scan < 1 ? 1 : 0, r: tilt, y: common.y });
    chips.forEach((C, i) => {
      const a = 1.7 + i * 0.25;
      const p = tw(lt, a, 0.6, E.outExpo);
      fx(C.c, { x: (1 - p) * -40, o: p * (1 - out), blur: (1 - p) * 8, y: -out * 30 });
      drawIcon(C.tick, tw(lt, a + 0.05, 0.4, E.outCubic));
    });
  },
};

export default { reveal, what, assets, digital };
