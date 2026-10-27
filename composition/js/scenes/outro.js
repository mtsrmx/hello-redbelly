// 1:05 to 1:22. Why it matters, the bookend to the opening line, and the end card.
import { h, s, fx, words, animWords, animBlock } from '../dom.js';
import { E, tw, spring, clamp, lerp } from '../engine.js';
import { icon, drawIcon } from '../icons.js';
import { place } from './layout.js';

const result = {
  pre: 0.1,
  post: 0.5,
  build(ctx) {
    const { root, data, W, H, portrait } = ctx;
    const lead = h('div', { class: 'abs center h2', style: { left: '0', width: `${W}px`, top: `${H * (portrait ? 0.17 : 0.2)}px`, color: '#d9d9d9' } }, data.text.lead);
    const icons = ['stack', 'people', 'clock'];
    const cards = data.text.items.map((txt, i) => {
      const ic = icon(icons[i], { size: portrait ? 130 : 150, color: '#ecebec', width: 2.8 });
      const ext = i === 2 ? h('div', { style: { fontSize: '34px', fontWeight: 600, color: '#ff5050', marginTop: '-6px', letterSpacing: '0.04em' } }, data.ui.clock) : null;
      const label = h('div', { class: 'h2', style: { fontSize: portrait ? '58px' : '54px', textAlign: portrait ? 'left' : 'center' } }, txt);
      let card;
      if (portrait) {
        card = h('div', { class: 'card', style: { width: '904px', height: '300px', display: 'flex', alignItems: 'center', gap: '40px', padding: '0 50px' } },
          h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center' } }, ic, ext), label);
        place(card, 88, H * 0.27 + i * 340);
      } else {
        card = h('div', { class: 'card', style: { width: '500px', height: '440px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '30px', padding: '0 30px' } },
          h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', height: '170px', justifyContent: 'center' } }, ic, ext), label);
        place(card, W / 2 + (i - 1) * 560 - 250, H * 0.33);
      }
      root.append(card);
      return { card, ic, ext };
    });
    root.prepend(lead);
    return { lead, cards };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { lead, cards } = st;
    const out = tw(lt, 4.62, 0.4, E.inCubic);
    animBlock(lead, lt, 0.25, 4.62, { dy: 20 });
    const at = [0.45, 1.45, 2.55];
    cards.forEach((C, i) => {
      const sp = spring(lt - at[i], 2.0, 0.55);
      const p = tw(lt, at[i], 0.5, E.outCubic);
      fx(C.card, { y: (1 - clamp(sp)) * 80 - out * 30, s: 0.92 + 0.08 * sp, o: p * (1 - out), blur: (1 - p) * 10 + out * 6 });
      drawIcon(C.ic, tw(lt, at[i] + 0.1, 0.8, E.outCubic));
      if (i === 1) {
        // Fewer middlemen: the figures on either side fade back.
        const fade = tw(lt, at[i] + 0.8, 0.6, E.inOutCubic);
        C.ic.querySelectorAll('path').forEach((p, k) => { p.style.opacity = k >= 2 ? String(1 - 0.75 * fade) : '1'; });
      }
      if (i === 2) {
        const hand = C.ic.querySelectorAll('path')[1];
        hand.setAttribute('transform', `rotate(${(Math.max(0, lt - at[i]) * 240).toFixed(1)} 32 32)`);
        fx(C.ext, { o: tw(lt, at[i] + 0.4, 0.5) });
      }
      if (i === 0) {
        const shrink = tw(lt, at[i] + 0.8, 0.6, E.inOutCubic);
        C.ic.querySelectorAll('path').forEach((p, k) => { if (k === 1 || k === 2) p.style.opacity = String(1 - 0.8 * shrink); });
      }
    });
  },
};

// ---------------------------------------------------------------------------
const bookend = {
  pre: 0.1,
  post: 0.4,
  build(ctx) {
    const { root, data, W, H, portrait } = ctx;
    const copy = h('div', { class: 'abs center', style: { left: '0', width: `${W}px`, top: `${H * (portrait ? 0.3 : 0.28)}px` } });
    const tx = words(portrait ? ['Ownership that', 'moves like money:', 'fast, safe, and', 'by the rules.'] : data.text.lines,
      portrait ? ['fast, safe, and', 'by the rules.'] : data.text.accent, 'h1');
    copy.append(tx.el);
    const pill = (k, v, ic) => h('div', { class: 'card', style: { position: 'relative', display: 'flex', alignItems: 'center', gap: '22px', padding: '22px 34px 22px 24px', borderRadius: '999px' } },
      h('div', { style: { width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(236,235,236,0.08)', display: 'grid', placeItems: 'center' } }, icon(ic, { size: 40, color: '#ecebec', width: 3.6 })),
      h('div', {}, h('div', { class: 'muted', style: { fontSize: '24px' } }, k), h('div', { style: { fontSize: '38px', fontWeight: 500 } }, v)),
      h('div', { style: { width: '48px', height: '48px', borderRadius: '50%', background: '#ff5050', display: 'grid', placeItems: 'center', marginLeft: '8px' } }, icon('check', { size: 32, color: '#fff', width: 6.5 })));
    const left = pill(data.ui.left, data.ui.leftDone, 'plane');
    const right = pill(data.ui.right, data.ui.rightDone, 'building');
    const row = h('div', { class: 'abs', style: { left: '0', width: `${W}px`, top: `${H * (portrait ? 0.62 : 0.66)}px`, display: 'flex', justifyContent: 'center', gap: '40px', flexDirection: portrait ? 'column' : 'row', alignItems: 'center' } }, left, right);
    root.append(copy, row);
    return { tx, left, right };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { tx, left, right } = st;
    animWords(tx.words, lt, 0.08, 4.62, { stagger: 0.06 });
    animBlock(left, lt, 1.15, 4.62, { dy: 40, ease: E.outBack, dur: 0.7 });
    animBlock(right, lt, 1.45, 4.62, { dy: 40, ease: E.outBack, dur: 0.7 });
  },
};

// ---------------------------------------------------------------------------
const end = {
  pre: 0.1,
  post: 0.2,
  build(ctx) {
    const { root, data, W, H, portrait } = ctx;
    const lw = portrait ? 640 : 600;
    const lh = lw * 0.75;
    const logo = ctx.inlineSvg('logoV');
    place(logo, W / 2 - lw / 2, H * (portrait ? 0.34 : 0.4) - lh / 2, lw, lh);
    logo.querySelector('svg').setAttribute('width', '100%');
    logo.querySelector('svg').setAttribute('height', '100%');
    const halo = h('div', { class: 'abs', style: { left: `${W / 2 - 420}px`, top: `${H * (portrait ? 0.34 : 0.4) - 470}px`, width: '840px', height: '840px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,80,80,0.32), rgba(255,80,80,0) 62%)' } });
    const tag = h('div', { class: 'abs', style: { left: '0', width: `${W}px`, top: `${H * (portrait ? 0.57 : 0.74)}px`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '26px', flexDirection: portrait ? 'column' : 'row', fontSize: portrait ? '50px' : '40px', fontWeight: 500, color: '#ecebec' } });
    const parts = data.text.tagline.map((p, i) => {
      const el = h('span', {}, p);
      tag.append(el);
      if (!portrait && i < data.text.tagline.length - 1) {
        const dot = h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: '#ff5050', display: 'inline-block' } });
        tag.append(dot);
      }
      return el;
    });
    const url = h('div', { class: 'abs center', style: { left: '0', width: `${W}px`, top: `${H * (portrait ? 0.79 : 0.845)}px`, fontSize: portrait ? '40px' : '32px', fontWeight: 500, letterSpacing: '0.06em', color: '#ff5050' } }, data.text.url);
    root.append(halo, logo, tag, url);
    return { logo, halo, tag, parts, url };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { logo, halo, tag, parts, url } = st;
    const sp = spring(lt - 0.05, 1.6, 0.6);
    fx(logo, { s: 0.86 + 0.14 * sp, o: clamp(tw(lt, 0.0, 0.5, E.outCubic)), blur: (1 - tw(lt, 0, 0.6)) * 10 });
    fx(halo, { o: (0.5 + 0.5 * Math.exp(-lt * 1.5)) * tw(lt, 0, 0.6), s: 0.8 + 0.2 * tw(lt, 0, 1.2, E.outCubic) });
    fx(tag, { o: 1 });
    [...tag.children].forEach((el, i) => {
      const p = tw(lt, 0.9 + i * 0.14, 0.7, E.outExpo);
      fx(el, { y: (1 - p) * 26, o: p, blur: (1 - p) * 6 });
    });
    const u = tw(lt, 1.9, 0.8, E.outExpo);
    fx(url, { y: (1 - u) * 20, o: u, blur: (1 - u) * 6 });
  },
};

export default { result, bookend, end };
