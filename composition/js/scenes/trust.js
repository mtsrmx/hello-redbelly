// 0:50 to 1:05. Why trust it: university research, a proven core, and
// Australia's central bank issuing trial digital dollars on Redbelly.
import { h, s, fx, words, animWords, animBlock } from '../dom.js';
import { E, tw, spring, clamp, lerp, rng } from '../engine.js';
import { icon, drawIcon, hexPath } from '../icons.js';
import { copyBox, artBox, place } from './layout.js';
import { drift, addSheen, animSheen, addBurst, animBurst } from '../polish.js';

const science = {
  pre: 0.1,
  post: 0.5,
  build(ctx) {
    const { root, data } = ctx;
    const copy = copyBox(ctx, { width: 880 });
    const b1 = words(data.text.lines, data.text.accent, 'h2');
    const b2 = words(data.text.lines2, data.text.accent2, 'h2');
    b2.el.style.marginTop = '56px';
    copy.append(b1.el, b2.el);

    const art = artBox(ctx);
    const chips = data.ui.chips.map((c, i) => {
      const el = h('div', { class: 'abs chip' }, h('span', { class: 'dot' }, icon(i ? 'spark' : 'bank', { size: 24, color: '#fff', width: 5 })), c);
      place(el, i ? 520 : 70, 20);
      art.append(el);
      return el;
    });
    // A state graph: every reachable state gets checked, layer by layer.
    const layers = [[400], [230, 400, 570], [140, 290, 450, 610], [200, 350, 500, 650], [300, 500]];
    const ys = [170, 285, 400, 515, 625];
    const nodes = [];
    layers.forEach((xs, li) => xs.forEach((x) => nodes.push({ x, y: ys[li], li })));
    const r = rng(5);
    const edges = [];
    for (let li = 0; li < layers.length - 1; li++) {
      const a = nodes.filter((n) => n.li === li);
      const b = nodes.filter((n) => n.li === li + 1);
      b.forEach((nb, j) => {
        const src = a[Math.min(a.length - 1, Math.floor((j / b.length) * a.length))];
        edges.push([src, nb]);
      });
      a.forEach((na) => {
        const nb = b[Math.floor(r() * b.length)];
        if (!edges.some(([p, q]) => p === na && q === nb)) edges.push([na, nb]);
      });
    }
    const svg = s('svg', { class: 'abs', width: 800, height: 800, viewBox: '0 0 800 800', style: 'left:0;top:0' });
    const E1 = edges.map(([a, b]) => {
      const p = s('path', { d: `M${a.x} ${a.y} L${b.x} ${b.y}`, fill: 'none', stroke: 'rgba(236,235,236,0.3)', 'stroke-width': 3, pathLength: 1, 'stroke-dasharray': '1 1' });
      svg.append(p);
      return { p, a, b };
    });
    const N1 = nodes.map((n) => {
      const g = s('g', { transform: `translate(${n.x} ${n.y})` });
      const c = s('circle', { r: 24, fill: '#1b2d39', stroke: 'rgba(236,235,236,0.55)', 'stroke-width': 4 });
      const tick = s('path', { d: 'M-10 1 L-3 8 L11 -8', fill: 'none', stroke: '#fff', 'stroke-width': 4.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 });
      g.append(c, tick);
      svg.append(g);
      return { ...n, g, c, tick };
    });
    art.append(svg);
    const seal = h('div', { class: 'abs', style: { left: '0', right: '0', top: '690px', display: 'flex', justifyContent: 'center' } },
      h('div', { class: 'chip', style: { fontSize: '32px', padding: '16px 30px 16px 20px', border: '2px solid #ff5050' } }, h('span', { class: 'dot', style: { width: '42px', height: '42px' } }, icon('check', { size: 30, color: '#fff', width: 6 })), data.ui.seal));
    art.append(seal);
    const burst = addBurst(art, 400, 722, { n: 14, r0: 90, r1: 230 }, seal);
    root.append(art, copy);
    return { b1, b2, chips, E1, N1, seal, art, burst };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { b1, b2, chips, E1, N1, seal } = st;
    drift(st.art, lt, 0, 7.5);
    animBurst(st.burst, lt, 6.0);
    animWords(b1.words, lt, 0.3, 7.12, { stagger: 0.045 });
    animWords(b2.words, lt, 4.35, 7.12, { stagger: 0.05 });
    const out = tw(lt, 7.1, 0.45, E.inCubic);
    chips.forEach((c, i) => {
      const p = tw(lt, 0.9 + i * 0.3, 0.7, E.outExpo);
      fx(c, { o: p * (1 - out), y: (1 - p) * -24, blur: (1 - p) * 6 });
    });
    const wave = (li) => 4.35 + li * 0.3;
    N1.forEach((n) => {
      const a = 0.35 + n.li * 0.42;
      const sp = spring(lt - a, 2.4, 0.5);
      n.g.style.opacity = String((clamp(sp * 2) * (1 - out)).toFixed(4));
      n.g.setAttribute('transform', `translate(${n.x} ${n.y}) scale(${Math.max(0.001, sp).toFixed(4)})`);
      const on = lt > wave(n.li);
      const k = tw(lt, wave(n.li), 0.3, E.outCubic);
      n.c.setAttribute('fill', on ? `rgba(255,80,80,${(0.25 + 0.75 * k).toFixed(3)})` : '#1b2d39');
      n.c.setAttribute('stroke', on ? '#ff5050' : 'rgba(236,235,236,0.55)');
      n.tick.setAttribute('stroke-dashoffset', String((1 - tw(lt, wave(n.li) + 0.05, 0.3, E.outCubic)).toFixed(3)));
    });
    E1.forEach((e) => {
      const a = 0.35 + e.a.li * 0.42 + 0.2;
      const d = tw(lt, a, 0.45, E.inOutCubic);
      e.p.style.strokeDashoffset = String((1 - d).toFixed(3));
      const red = tw(lt, wave(e.b.li), 0.3);
      e.p.setAttribute('stroke', red > 0 ? `rgba(255,80,80,${(0.35 + 0.5 * red).toFixed(3)})` : 'rgba(236,235,236,0.3)');
      e.p.style.opacity = String(1 - out);
    });
    const sl = spring(lt - 6.0, 2.2, 0.5);
    fx(seal, { s: sl, o: clamp(sl * 2) * (1 - out) });
  },
};

// ---------------------------------------------------------------------------
const acacia = {
  pre: 0.1,
  post: 0.5,
  build(ctx) {
    const { root, data } = ctx;
    const copy = copyBox(ctx, { width: 880 });
    const label = h('div', { style: { marginBottom: '34px', display: 'inline-flex', flexDirection: 'column', alignSelf: 'flex-start' } },
      h('span', { class: 'label', style: { color: '#ff5050', paddingBottom: '12px' } }, data.text.label),
      h('span', { style: { height: '3px', background: '#ff5050', width: '100%', display: 'block' } }));
    const b1 = words(data.text.lines, data.text.accent, 'h2');
    const b2 = words(data.text.lines2, data.text.accent2, 'h2');
    b2.el.style.marginTop = '40px';
    copy.append(label, b1.el, b2.el);

    const art = artBox(ctx, { cx: ctx.portrait ? undefined : 1400 });
    const coin = h('div', { class: 'abs', style: { left: '330px', top: '40px', width: '140px', height: '140px', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #ff8a8a, #ff5050 55%, #d63a36)', display: 'grid', placeItems: 'center', fontSize: '50px', fontWeight: 600, color: '#fff', boxShadow: '0 0 0 10px rgba(255,80,80,0.15), 0 20px 60px rgba(255,80,80,0.5)', border: '5px solid rgba(255,255,255,0.35)' } }, data.ui.coin);
    const xs = [128, 400, 672];
    const svg = s('svg', { class: 'abs', width: 800, height: 800, viewBox: '0 0 800 800', style: 'left:0;top:0' });
    const streams = xs.map((x) => {
      const d = `M400 190 C400 280 ${x} 260 ${x} 350`;
      const p = s('path', { d, fill: 'none', stroke: 'rgba(255,80,80,0.7)', 'stroke-width': 4, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-linecap': 'round' });
      const bits = [0, 1, 2].map(() => s('circle', { r: 7, fill: '#ffd0d0' }));
      svg.append(p, ...bits);
      return { p, bits, x };
    });
    const tiles = data.ui.networks.map((n, i) => {
      const pub = i === 2;
      const tile = h('div', { class: 'card', style: { width: '236px', height: '330px', borderRadius: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '34px 16px 0', gap: '20px', border: pub ? '3px solid #ff5050' : undefined } });
      let ic;
      if (pub) {
        ic = ctx.inlineSvg('isoRed');
        Object.assign(ic.style, { position: 'relative', width: '90px', height: '99px' });
      } else {
        ic = h('div', {}, icon('lock', { size: 92, color: '#848b91', width: 3.4 }));
      }
      const name = h('div', { class: 'center', style: { fontSize: '34px', fontWeight: 500, lineHeight: '1.12', color: pub ? '#ffffff' : '#d9d9d9' } }, ...n.split(' ').flatMap((w, j) => (j ? [h('br'), w] : [w])));
      tile.append(ic, name);
      if (pub) tile.append(h('div', { style: { fontSize: '30px', color: '#ff5050', fontWeight: 600 } }, data.ui.redbelly));
      place(tile, xs[i] - 118, 340);
      art.append(tile);
      return { tile, pub };
    });
    const badge = h('div', { class: 'abs', style: { left: `${xs[2] + 84}px`, top: '310px', width: '64px', height: '64px', borderRadius: '50%', background: '#ff5050', display: 'grid', placeItems: 'center', boxShadow: '0 8px 24px rgba(255,80,80,0.6)' } }, icon('check', { size: 40, color: '#fff', width: 6.5 }));
    art.prepend(svg);
    art.append(coin, badge);
    const sheen = addSheen(tiles[2].tile);
    const burst = addBurst(art, 672 + 116, 342, { r0: 40, r1: 100 }, badge);
    root.append(art, copy);
    return { label, b1, b2, coin, streams, tiles, badge, art, sheen, burst };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { label, b1, b2, coin, streams, tiles, badge } = st;
    drift(st.art, lt, 0, 7.5);
    animSheen(st.sheen, lt, 3.5, 0.9);
    animBurst(st.burst, lt, 3.5);
    animBlock(label, lt, 0.05, 7.12, { dy: 20 });
    animWords(b1.words, lt, 0.15, 7.12, { stagger: 0.05 });
    animWords(b2.words, lt, 3.45, 7.12, { stagger: 0.06 });
    const out = tw(lt, 7.1, 0.45, E.inCubic);
    const c = spring(lt - 0.55, 1.8, 0.5);
    fx(coin, { s: c * (1 - out * 0.3), o: clamp(c * 2) * (1 - out), y: (1 - clamp(c)) * -60 });
    streams.forEach((S, i) => {
      const d = tw(lt, 1.5 + i * 0.12, 0.6, E.inOutCubic);
      S.p.style.strokeDashoffset = String((1 - d).toFixed(3));
      S.p.style.opacity = String((i < 2 ? 1 - 0.6 * tw(lt, 3.45, 0.5) : 1) * (1 - out));
      S.bits.forEach((b, k) => {
        const u = ((lt - 1.9 - k * 0.33 - i * 0.1) * 0.8) % 1;
        const on = lt > 1.9 + k * 0.33 + i * 0.1 && lt < 6.8;
        const uu = Math.max(0, u);
        const x = (1 - uu) ** 3 * 400 + 3 * (1 - uu) ** 2 * uu * 400 + 3 * (1 - uu) * uu * uu * S.x + uu ** 3 * S.x;
        const y = (1 - uu) ** 3 * 190 + 3 * (1 - uu) ** 2 * uu * 280 + 3 * (1 - uu) * uu * uu * 260 + uu ** 3 * 350;
        b.setAttribute('cx', x.toFixed(1));
        b.setAttribute('cy', y.toFixed(1));
        b.style.opacity = on ? String(Math.sin(uu * Math.PI) * (1 - out)) : '0';
      });
    });
    tiles.forEach((T, i) => {
      const p = tw(lt, 1.3 + i * 0.15, 0.8, E.outExpo);
      const hi = tw(lt, 3.45, 0.5, E.inOutCubic);
      const dim = T.pub ? 1 : 1 - hi * 0.55;
      fx(T.tile, { y: (1 - p) * 60, o: p * dim * (1 - out), s: T.pub ? 1 + hi * 0.08 : 1 - hi * 0.03, blur: (1 - p) * 8 });
      if (T.pub) T.tile.style.boxShadow = `0 0 0 ${Math.round(hi * 8)}px rgba(255,80,80,0.18), 0 30px 90px rgba(255,80,80,${(0.35 * hi).toFixed(2)}), var(--shadow)`;
    });
    const b = spring(lt - 3.5, 2.5, 0.45);
    fx(badge, { s: b, o: clamp(b * 3) * (1 - out) });
  },
};

export default { science, acacia };
