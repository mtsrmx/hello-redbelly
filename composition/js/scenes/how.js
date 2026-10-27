// 0:25 to 0:50. How it works: verified people, built-in rules, final in seconds.
import { h, s, fx, words, animWords, animBlock } from '../dom.js';
import { E, tw, spring, kf, clamp, lerp, range, bez } from '../engine.js';
import { icon, drawIcon, hexPath } from '../icons.js';
import { copyBox, artBox, place } from './layout.js';
import { drift, addSheen, animSheen, addBurst, animBurst } from '../polish.js';

// Copy column used by the three ideas: number tag, headline, body, second body.
function ideaCopy(ctx, text) {
  const copy = copyBox(ctx, { width: 880 });
  const tag = h('div', { style: { marginBottom: '28px' } }, h('span', { class: 'tag' }, text.number));
  const head = words(text.headline, [], 'h1');
  const body = words(text.body, [], 'body');
  body.el.style.marginTop = '30px';
  const lockDot = h('span', { style: { flex: '0 0 auto', width: '46px', height: '46px', borderRadius: '50%', background: 'var(--red)', display: 'grid', placeItems: 'center', marginRight: '20px', marginTop: '9px' } }, icon('check', { size: 30, color: '#fff', width: 6 }));
  const body2 = words(text.body2, [], 'body');
  body2.el.style.color = '#ffffff';
  const b2row = h('div', { style: { display: 'flex', alignItems: 'flex-start', marginTop: '34px' } }, lockDot, body2.el);
  copy.append(tag, head.el, body.el, b2row);
  return { copy, tag, head, body, body2, lockDot };
}

function animIdea(I, t, t0, t2, tOut) {
  animBlock(I.tag, t, t0, tOut, { dy: 24 });
  animWords(I.head.words, t, t0 + 0.08, tOut, { stagger: 0.06 });
  animWords(I.body.words, t, t0 + 0.7, tOut, { stagger: 0.03, dur: 0.7, rise: 0.6 });
  animBlock(I.lockDot, t, t2, tOut, { dy: 0, s0: 0.3, dur: 0.6, ease: E.outBack });
  animWords(I.body2.words, t, t2 + 0.06, tOut, { stagger: 0.035, dur: 0.7, rise: 0.6 });
}

function hexTile(r, fill = 'rgba(40,58,70,0.92)', stroke = 'rgba(236,235,236,0.2)', sw = 3) {
  const svg = s('svg', { class: 'abs', viewBox: `${-r - 10} ${-r - 10} ${2 * r + 20} ${2 * r + 20}`, width: 2 * r + 20, height: 2 * r + 20 });
  const p = s('path', { d: hexPath(0, 0, r, 30), fill, stroke, 'stroke-width': sw });
  svg.append(p);
  return { svg, p };
}

// ---------------------------------------------------------------------------
const how = {
  pre: 0.2,
  post: 0.3,
  build(ctx) {
    const { root, data, W, H, portrait } = ctx;
    const head = h('div', { class: 'abs center', style: { left: '0', width: `${W}px`, top: `${H * (portrait ? 0.26 : 0.2)}px` } });
    const tx = words(data.text.lines, [], 'h1');
    head.append(tx.el);
    const group = h('div', { class: 'abs', style: { left: '0', top: '0', width: `${W}px`, height: `${H}px` } });
    const cy = H * (portrait ? 0.52 : 0.6);
    const gap = portrait ? 330 : 400;
    const items = data.ui.steps.map((label, i) => {
      const cx = W / 2 + (i - 1) * gap;
      const T = hexTile(portrait ? 120 : 132, 'rgba(40,58,70,0.85)', '#ff5050', 4);
      place(T.svg, cx - (portrait ? 130 : 142), cy - (portrait ? 130 : 142));
      const n = h('div', { class: 'abs center', style: { left: `${cx - 100}px`, width: '200px', top: `${cy - 52}px`, fontSize: '96px', fontWeight: 500, lineHeight: '1' } }, String(i + 1));
      const cap = h('div', { class: 'abs center body', style: { left: `${cx - 200}px`, width: '400px', top: `${cy + (portrait ? 150 : 170)}px`, color: '#ecebec', fontWeight: 500 } }, label);
      group.append(T.svg, n, cap);
      return { T, n, cap, cx };
    });
    root.append(head, group);
    return { tx, group, items, cy };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { tx, group, items, cy } = st;
    animWords(tx.words, lt, 0.3, 1.95, { stagger: 0.06 });
    items.forEach((I, i) => {
      const a = 0.45 + i * 0.25;
      const sp = spring(lt - a, 2.3, 0.48);
      fx(I.T.svg, { s: sp, o: clamp(sp * 2), r: (1 - clamp(sp)) * -30 });
      fx(I.n, { s: sp, o: clamp(sp * 2) });
      const c = tw(lt, a + 0.15, 0.6, E.outExpo);
      fx(I.cap, { y: (1 - c) * 24, o: c, blur: (1 - c) * 6 });
    });
    // Dive into idea one.
    const z = tw(lt, 2.0, 0.55, E.inQuart);
    const cx = items[0].cx;
    group.style.transformOrigin = `${cx}px ${cy}px`;
    group.style.transform = `scale(${(1 + z * 2.6).toFixed(4)})`;
    group.style.opacity = String(1 - z);
    group.style.filter = z > 0.02 ? `blur(${(z * 10).toFixed(2)}px)` : 'none';
  },
};

// ---------------------------------------------------------------------------
const verified = {
  pre: 0.1,
  post: 0.5,
  build(ctx) {
    const { root, data } = ctx;
    const I = ideaCopy(ctx, data.text);
    const art = artBox(ctx);
    // Person in a hexagon.
    const A = hexTile(170);
    place(A.svg, 300 - 180, 330 - 180);
    const person = icon('user', { size: 230, color: '#ecebec', width: 2.6 });
    const personWrap = h('div', { class: 'abs', style: { left: `${300 - 115}px`, top: `${330 - 125}px` } }, person);
    // Face check brackets and scan line.
    const brackets = icon('scanface', { size: 330, color: '#ff5050', width: 2.4 });
    const brWrap = h('div', { class: 'abs', style: { left: `${300 - 165}px`, top: `${330 - 175}px` } }, brackets);
    const scan = h('div', { class: 'abs', style: { left: `${300 - 140}px`, width: '280px', height: '4px', borderRadius: '2px', background: '#ff5050', boxShadow: '0 0 18px 4px rgba(255,80,80,0.7)' } });
    const dots = [[-34, -44], [34, -44], [0, -16], [-22, 14], [22, 14], [0, 30], [-50, -10], [50, -10]].map(([dx, dy]) => {
      const d = h('div', { class: 'abs', style: { left: `${300 + dx - 6}px`, top: `${300 + dy - 6}px`, width: '12px', height: '12px', borderRadius: '50%', background: '#ff5050', boxShadow: '0 0 10px rgba(255,80,80,0.9)' } });
      return d;
    });
    const scanLabel = h('div', { class: 'abs chip', style: { left: `${300 - 110}px`, top: '540px' } }, h('span', { class: 'dot' }, icon('scanface', { size: 24, color: '#fff', width: 6 })), data.ui.scan);
    // Passport.
    const pp = h('div', { class: 'card', style: { width: '280px', height: '380px', borderRadius: '24px', background: 'linear-gradient(160deg,#3a4f5e,#22343f)', padding: '30px' } });
    const ppDetails = h('div', { class: 'abs', style: { left: '30px', right: '30px', top: '210px' } });
    ppDetails.append(
      h('div', { style: { display: 'flex', gap: '16px' } },
        h('div', { style: { width: '74px', height: '90px', borderRadius: '10px', background: 'rgba(236,235,236,0.18)' } }),
        h('div', { style: { flex: '1' } }, ...[90, 70, 80].map((w) => h('div', { style: { height: '12px', width: `${w}%`, background: 'rgba(236,235,236,0.28)', borderRadius: '6px', marginBottom: '14px' } })))),
      h('div', { style: { height: '10px', width: '100%', background: 'rgba(236,235,236,0.2)', borderRadius: '5px', marginTop: '16px' } }),
      h('div', { style: { height: '10px', width: '86%', background: 'rgba(236,235,236,0.2)', borderRadius: '5px', marginTop: '10px' } }));
    pp.append(
      h('div', { class: 'label', style: { color: '#ecebec', textAlign: 'center', fontSize: '20px' } }, data.ui.passport),
      h('div', { class: 'abs', style: { left: '50%', top: '72px', marginLeft: '-56px' } }, icon('globe', { size: 112, color: '#ff5050', width: 2.6 })),
      ppDetails);
    place(pp, 490, 250);
    const lockChip = h('div', { class: 'abs chip' }, h('span', { class: 'dot' }, icon('lock', { size: 24, color: '#fff', width: 5.5 })), data.ui.lock);
    place(lockChip, 470, 660);
    // Verified badge.
    const badge = hexTile(56, '#ff5050', 'none', 0);
    const tick = icon('check', { size: 64, color: '#fff', width: 6 });
    const badgeWrap = h('div', { class: 'abs', style: { left: `${300 + 112 - 66}px`, top: `${330 + 96 - 66}px`, width: '132px', height: '132px' } }, badge.svg, h('div', { class: 'abs', style: { left: '34px', top: '34px' } }, tick));
    badge.svg.style.left = '0';
    badge.svg.style.top = '0';
    art.append(A.svg, personWrap, brWrap, ...dots, scan, scanLabel, pp, badgeWrap, lockChip);
    const burst = addBurst(art, 300 + 112, 330 + 96, { r0: 60, r1: 130 }, badgeWrap);
    root.append(art, I.copy);
    return { I, A, personWrap, person, brWrap, scan, dots, scanLabel, pp, ppDetails, lockChip, badgeWrap, tick, art, burst };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const S = st;
    drift(S.art, lt, 0, 7.5);
    animBurst(S.burst, lt, 3.45);
    animIdea(S.I, lt, 0.05, 4.55, 7.12);
    const out = tw(lt, 7.1, 0.45, E.inCubic);
    const ain = spring(lt - 0.5, 1.9, 0.55);
    fx(S.A.svg, { s: ain * (1 - out * 0.1), o: clamp(ain * 2) * (1 - out) });
    fx(S.personWrap, { s: ain, o: clamp(ain * 2) * (1 - out) });
    drawIcon(S.person, tw(lt, 0.6, 0.9, E.outCubic));
    const bIn = tw(lt, 2.15, 0.5, E.outExpo);
    const bOut = tw(lt, 3.5, 0.5, E.inCubic);
    fx(S.brWrap, { s: 1.25 - 0.25 * bIn, o: bIn * (1 - bOut * 0.75) * (1 - out) });
    const sp = range(lt, 2.25, 3.3);
    S.scan.style.top = `${(190 + E.inOutSine(sp) * 270).toFixed(1)}px`;
    fx(S.scan, { o: sp > 0 && sp < 1 ? Math.sin(sp * Math.PI) : 0 });
    S.dots.forEach((d, i) => {
      const p = tw(lt, 2.5 + i * 0.08, 0.3, E.outBack);
      fx(d, { s: p, o: p * (1 - tw(lt, 3.5, 0.6)) * (1 - out) });
    });
    const sl = tw(lt, 2.2, 0.5, E.outExpo);
    fx(S.scanLabel, { o: sl * (1 - tw(lt, 3.4, 0.4)) * (1 - out), y: (1 - sl) * 20 });
    const pin = tw(lt, 1.4, 0.9, E.outExpo);
    fx(S.pp, { x: (1 - pin) * 200, y: (1 - pin) * 260 - out * 30, r: 7 + (1 - pin) * 18, o: pin * (1 - out), blur: (1 - pin) * 8 + out * 6 });
    const priv = tw(lt, 4.6, 0.6, E.inOutCubic);
    S.ppDetails.style.filter = priv > 0.01 ? `blur(${(priv * 9).toFixed(2)}px)` : 'none';
    S.ppDetails.style.opacity = String(1 - priv * 0.35);
    const lc = tw(lt, 4.65, 0.6, E.outExpo);
    fx(S.lockChip, { o: lc * (1 - out), y: (1 - lc) * 30, s: 0.9 + 0.1 * lc });
    const bd = spring(lt - 3.42, 2.6, 0.42);
    fx(S.badgeWrap, { s: bd * (1 - out * 0.2), o: clamp(bd * 3) * (1 - out) });
    drawIcon(S.tick, tw(lt, 3.5, 0.4, E.outCubic));
  },
};

// ---------------------------------------------------------------------------
function miniPerson(ok, r = 64) {
  const T = hexTile(r, ok ? 'rgba(40,58,70,0.95)' : 'rgba(40,58,70,0.7)', ok ? 'rgba(236,235,236,0.3)' : 'rgba(132,139,145,0.35)', 3);
  const size = 2 * r + 20;
  const p = icon('user', { size: r * 1.3, color: ok ? '#ecebec' : '#848b91', width: 3.6 });
  const wrap = h('div', { class: 'abs', style: { width: `${size}px`, height: `${size}px` } }, T.svg, h('div', { class: 'abs', style: { left: `${(size - r * 1.3) / 2}px`, top: `${(size - r * 1.3) / 2 - r * 0.06}px` } }, p));
  T.svg.style.left = '0';
  T.svg.style.top = '0';
  if (ok) {
    const b = h('div', { class: 'abs', style: { right: `${r * 0.05}px`, bottom: `${r * 0.1}px`, width: `${r * 0.72}px`, height: `${r * 0.72}px`, borderRadius: '50%', background: '#ff5050', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(255,80,80,0.5)' } }, icon('check', { size: r * 0.48, color: '#fff', width: 7 }));
    wrap.append(b);
  }
  return wrap;
}

const rules = {
  pre: 0.1,
  post: 0.5,
  build(ctx) {
    const { root, data } = ctx;
    const I = ideaCopy(ctx, data.text);
    const art = artBox(ctx);
    const gx = 500, gy = 330;
    const gate = s('svg', { class: 'abs', width: 800, height: 800, viewBox: '0 0 800 800', style: 'left:0;top:0' });
    const ring = s('path', { d: hexPath(gx, gy, 232, 30), fill: 'rgba(255,80,80,0.04)', stroke: '#ff5050', 'stroke-width': 3, 'stroke-dasharray': '14 10' });
    const beamA = s('path', { d: `M220 200 Q270 190 ${gx - 172} ${gy - 70}`, fill: 'none', stroke: '#ff5050', 'stroke-width': 6, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1', style: 'filter: drop-shadow(0 0 8px rgba(255,80,80,0.9))' });
    gate.append(ring, beamA);
    // The asset carries its own rules.
    const ruleRows = data.ui.rules.map((r) => {
      const tickEl = icon('check', { size: 24, color: '#fff', width: 6.5 });
      const dot = h('span', { style: { width: '36px', height: '36px', borderRadius: '50%', background: '#3a4a55', display: 'grid', placeItems: 'center', flex: '0 0 auto' } }, tickEl);
      const row = h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', fontSize: '28px', fontWeight: 500, color: '#ecebec', marginTop: '16px' } }, dot, r);
      return { row, dot, tickEl };
    });
    const card = h('div', { class: 'card', style: { width: '344px', height: '300px', borderRadius: '28px', padding: '26px 28px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '18px' } },
        icon('building', { size: 86, color: '#ecebec', width: 2.8 }),
        h('div', {}, h('div', { style: { fontSize: '40px', fontWeight: 500 } }, data.ui.asset), h('div', { class: 'muted', style: { fontSize: '24px', marginTop: '2px' } }, data.ui.assetSub))),
      h('div', { style: { height: '2px', background: 'rgba(236,235,236,0.12)', margin: '20px 0 6px' } }),
      ...ruleRows.map((r) => r.row));
    place(card, gx - 172, gy - 150);
    const A = miniPerson(true, 70);
    const B = miniPerson(false, 70);
    const ok = h('div', { class: 'abs chip' }, h('span', { class: 'dot' }, icon('check', { size: 24, color: '#fff', width: 6 })), data.ui.ok);
    place(ok, 10, 330);
    const no = h('div', { class: 'abs chip off' }, h('span', { class: 'dot', style: { background: '#4a5963' } }, icon('cross', { size: 24, color: '#ecebec', width: 6 })), data.ui.no);
    place(no, -20, 720);
    const X = icon('cross', { size: 110, color: '#ff5050', width: 7 });
    const xWrap = h('div', { class: 'abs', style: { left: '262px', top: '462px' } }, X);
    art.append(gate, card, A, B, ok, no, xWrap);
    const sheen = addSheen(card);
    const burst = addBurst(art, 160, 210, { r0: 84, r1: 150 }, A);
    root.append(art, I.copy);
    return { I, ring, beamA, card, ruleRows, A, B, ok, no, X, xWrap, art, sheen, burst };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const S = st;
    drift(S.art, lt, 0, 7.5);
    animSheen(S.sheen, lt, 3.1, 0.9);
    animBurst(S.burst, lt, 3.1);
    animIdea(S.I, lt, 0.05, 4.6, 7.12);
    const out = tw(lt, 7.1, 0.45, E.inCubic);
    const cin = tw(lt, 0.6, 0.9, E.outExpo);
    fx(S.card, { y: (1 - cin) * 60, o: cin * (1 - out), blur: (1 - cin) * 8, s: 0.94 + 0.06 * cin });
    const rg = tw(lt, 1.0, 1.0, E.outCubic);
    S.ring.style.opacity = String(rg * (1 - out) * (0.65 + 0.35 * Math.sin(lt * 4)));
    S.ring.style.strokeDashoffset = String(-lt * 30);
    S.ruleRows.forEach((R, i) => {
      const on = lt > 2.55 + i * 0.25;
      R.dot.style.background = on ? '#ff5050' : '#3a4a55';
      drawIcon(R.tickEl, on ? tw(lt, 2.55 + i * 0.25, 0.35) : 0);
    });
    // Buyer A: verified and eligible, gets through.
    const aIn = tw(lt, 1.6, 0.7, E.outExpo);
    const aMove = tw(lt, 2.0, 0.5, E.inOutCubic);
    place(S.A, lerp(-10, 80, aMove), lerp(120, 130, aMove));
    fx(S.A, { o: aIn * (1 - out), s: 0.9 + 0.1 * aIn });
    const beam = tw(lt, 3.05, 0.5, E.outCubic);
    S.beamA.style.strokeDashoffset = String((1 - beam).toFixed(3));
    S.beamA.style.opacity = String(1 - out);
    const okp = tw(lt, 3.1, 0.6, E.outExpo);
    fx(S.ok, { o: okp * (1 - out), y: (1 - okp) * 20 });
    // Buyer B: not eligible, bounces off the rules.
    const bIn = tw(lt, 3.6, 0.7, E.outExpo);
    const bMove = tw(lt, 4.2, 0.55, E.inQuad);
    const back = lt > 4.75 ? spring(lt - 4.75, 1.4, 0.55) : 0;
    const bx = lt < 4.75 ? lerp(-10, 120, bMove) : lerp(120, -10, back);
    const by = lt < 4.75 ? lerp(560, 500, bMove) : lerp(500, 540, back);
    place(S.B, bx, by);
    fx(S.B, { o: bIn * (1 - out) * (lt > 4.75 ? lerp(1, 0.5, tw(lt, 4.75, 0.6)) : 1), s: 0.9 + 0.1 * bIn, r: lt > 4.75 ? Math.sin((lt - 4.75) * 22) * 6 * Math.exp(-(lt - 4.75) * 5) : 0 });
    const xp = spring(lt - 4.72, 2.8, 0.45);
    fx(S.xWrap, { s: xp, o: clamp(xp * 3) * (1 - tw(lt, 6.0, 0.5)) * (1 - out) });
    drawIcon(S.X, tw(lt, 4.74, 0.3, E.outCubic));
    const flash = lt > 4.75 ? Math.exp(-(lt - 4.75) * 4) : 0;
    S.ring.style.fill = `rgba(255,80,80,${(0.04 + flash * 0.18).toFixed(3)})`;
    const nop = tw(lt, 4.9, 0.6, E.outExpo);
    fx(S.no, { o: nop * (1 - out), y: (1 - nop) * 20 });
  },
};

// ---------------------------------------------------------------------------
const final = {
  pre: 0.1,
  post: 0.5,
  build(ctx) {
    const { root, data } = ctx;
    const I = ideaCopy(ctx, data.text);
    const art = artBox(ctx);
    const L = miniPerson(true, 78);
    const R = miniPerson(true, 78);
    place(L, 6, 480);
    place(R, 618, 480);
    const C = hexTile(132, 'rgba(40,58,70,0.6)', 'rgba(236,235,236,0.22)', 3);
    place(C.svg, 400 - 142, 300 - 142);
    const swapIc = icon('swap', { size: 110, color: 'rgba(236,235,236,0.35)', width: 3 });
    const swapWrap = h('div', { class: 'abs', style: { left: '345px', top: '245px' } }, swapIc);
    const ringSvg = s('svg', { class: 'abs', width: 800, height: 800, viewBox: '0 0 800 800', style: 'left:0;top:0' });
    const ring = s('circle', { cx: 400, cy: 300, r: 168, fill: 'none', stroke: '#ff5050', 'stroke-width': 7, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1', transform: 'rotate(-90 400 300)', style: 'filter: drop-shadow(0 0 10px rgba(255,80,80,0.8))' });
    ringSvg.append(ring);
    const coin = h('div', { class: 'abs', style: { width: '136px', height: '136px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #ff8a8a, #ff5050 55%, #d63a36)', display: 'grid', placeItems: 'center', fontSize: '50px', fontWeight: 600, color: '#fff', boxShadow: '0 16px 40px rgba(255,80,80,0.45)', border: '4px solid rgba(255,255,255,0.35)' } }, data.ui.money);
    const asset = h('div', { class: 'card', style: { width: '150px', height: '136px', borderRadius: '24px', display: 'grid', placeItems: 'center' } }, icon('building', { size: 88, color: '#ecebec', width: 3 }));
    const lockA = h('div', { class: 'abs', style: { width: '56px', height: '56px', borderRadius: '50%', background: '#ecebec', display: 'grid', placeItems: 'center', boxShadow: '0 6px 16px rgba(0,0,0,0.35)' } }, icon('lock', { size: 34, color: '#283a46', width: 5.5 }));
    const lockB = lockA.cloneNode(true);
    const stamp = h('div', { class: 'abs', style: { left: '400px', top: '300px', width: '0', height: '0' } },
      h('div', { style: { position: 'absolute', transform: 'translate(-50%,-50%)', fontSize: '58px', fontWeight: 600, letterSpacing: '0.16em', color: '#ff5050', border: '6px solid #ff5050', borderRadius: '16px', padding: '10px 22px 8px 30px', background: 'rgba(20,37,48,0.9)', textTransform: 'uppercase', whiteSpace: 'nowrap' } }, data.ui.stamp));
    const undo = icon('undo', { size: 110, color: '#ecebec', width: 4 });
    const slash = s('svg', { class: 'abs', width: 140, height: 140, viewBox: '0 0 140 140', style: 'left:-15px;top:-15px' }, s('path', { d: 'M18 122 L122 18', stroke: '#ff5050', 'stroke-width': 9, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }));
    const undoWrap = h('div', { class: 'abs', style: { left: '345px', top: '540px', width: '110px', height: '110px' } }, undo, slash);
    art.append(C.svg, swapWrap, ringSvg, L, R, asset, coin, lockA, lockB, stamp, undoWrap);
    const burst = addBurst(art, 400, 300, { n: 16, r0: 150, r1: 240, width: 5 });
    root.append(art, I.copy);
    return { I, L, R, C, swapWrap, ring, coin, asset, lockA, lockB, stamp: stamp.firstChild, undoWrap, undo, slash: slash.firstChild, art, burst };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const S = st;
    drift(S.art, lt, 0, 7.5);
    animBurst(S.burst, lt, 3.0);
    animIdea(S.I, lt, 0.05, 4.6, 7.12);
    const out = tw(lt, 7.1, 0.45, E.inCubic);
    const pin = tw(lt, 0.5, 0.8, E.outExpo);
    fx(S.L, { o: pin * (1 - out), x: (1 - pin) * -40 });
    fx(S.R, { o: pin * (1 - out), x: (1 - pin) * 40 });
    fx(S.C.svg, { o: tw(lt, 0.7, 0.6) * (1 - out), s: 0.9 + 0.1 * tw(lt, 0.7, 0.8) });
    fx(S.swapWrap, { o: tw(lt, 0.9, 0.6) * (1 - tw(lt, 2.3, 0.4)) * (1 - out) });
    // Items rise, swap along mirrored arcs in one move, then lock.
    const rise = tw(lt, 0.8, 0.6, E.outExpo);
    const m = tw(lt, 1.55, 0.85, E.inOutCubic);
    const coinFrom = [27, 310], coinTo = [637, 310];
    const assetFrom = [631, 310], assetTo = [21, 310];
    const c = bez(coinFrom, [190, 80], [480, 80], coinTo, m);
    const a = bez(assetFrom, [470, 560], [180, 560], assetTo, m);
    const lift = (1 - rise) * 60;
    place(S.coin, c[0], c[1] + lift);
    place(S.asset, a[0], a[1] + lift);
    const glowPeak = Math.exp(-Math.pow((lt - 1.97) / 0.18, 2));
    fx(S.coin, { o: rise * (1 - out), s: 1 + glowPeak * 0.12 });
    fx(S.asset, { o: rise * (1 - out), s: 1 + glowPeak * 0.12 });
    const lk = spring(lt - 2.38, 2.6, 0.45);
    place(S.lockA, coinTo[0] + 100, coinTo[1] - 20);
    place(S.lockB, assetTo[0] + 112, assetTo[1] - 20);
    fx(S.lockA, { s: lk, o: clamp(lk * 3) * (1 - out) });
    fx(S.lockB, { s: lk, o: clamp(lk * 3) * (1 - out) });
    const rp = tw(lt, 2.3, 0.65, E.inOutCubic);
    S.ring.style.strokeDashoffset = String((1 - rp).toFixed(3));
    S.ring.style.opacity = String(1 - out);
    const st1 = tw(lt, 3.0, 0.22, E.inQuad);
    const settle = lt > 3.22 ? 1 + 0.05 * Math.exp(-(lt - 3.22) * 8) * Math.cos((lt - 3.22) * 30) : 1;
    S.stamp.style.opacity = String((st1 * (1 - out)).toFixed(4));
    S.stamp.style.transform = `translate(-50%,-50%) scale(${(lerp(2.1, 1, st1) * settle).toFixed(4)}) rotate(-8deg)`;
    // "No take-backs": an undo that gets struck out.
    const u = tw(lt, 4.4, 0.6, E.outExpo);
    const wig = lt > 4.6 && lt < 4.95 ? Math.sin((lt - 4.6) * 40) * 8 : 0;
    fx(S.undoWrap, { o: u * (1 - tw(lt, 6.2, 0.5)) * (1 - out), y: (1 - u) * 30, r: wig });
    drawIcon(S.undo, tw(lt, 4.4, 0.6, E.outCubic));
    S.slash.style.strokeDashoffset = String((1 - tw(lt, 4.88, 0.25, E.outCubic)).toFixed(3));
  },
};

export default { how, verified, rules, final };
