// 0:00 to 0:10. Money moves in seconds; buying into a fund still takes days,
// forms, ID checks and middlemen.
import { h, s, fx, words, animWords, animBlock } from '../dom.js';
import { E, tw, spring, kf, clamp, lerp, range, noise1, bez } from '../engine.js';
import { icon, drawIcon } from '../icons.js';
import { copyBox, artBox, place } from './layout.js';
import { drift } from '../polish.js';

// ---------------------------------------------------------------------------
// The phone lives across the first two scenes, so it is built by "send".
function buildPhone(sendUi, fundUi) {
  const phone = h('div', { class: 'phone' });
  const screen = h('div', { class: 'screen' });
  phone.append(screen, h('div', { class: 'notch' }));

  // Screen A: send money.
  const a = h('div', { class: 'abs', style: { inset: '0' } });
  const aTitle = h('div', { class: 'app-title' }, sendUi.app);
  const aRow = h('div', { class: 'row', style: { top: '196px' } },
    h('div', { class: 'avatar' }, sendUi.recipient[0]),
    h('div', {}, h('div', { class: 'k' }, sendUi.to), h('div', { class: 'v' }, sendUi.recipient)));
  const aBtn = h('div', { class: 'btn', style: { top: '646px' } }, sendUi.button);
  const ripple = h('div', { class: 'abs', style: { left: '200px', top: '698px', width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(255,255,255,0.6)' } });
  const plane = icon('plane', { size: 70, color: '#ffffff', width: 3.2 });
  const planeWrap = h('div', { class: 'abs', style: { left: '165px', top: '663px', width: '70px', height: '70px' } }, plane);
  const okCircle = h('div', { class: 'abs', style: { left: '115px', top: '250px', width: '170px', height: '170px', borderRadius: '50%', background: 'var(--red)', display: 'grid', placeItems: 'center', boxShadow: '0 20px 60px rgba(255,80,80,0.45)' } });
  const okTick = icon('check', { size: 120, color: '#ffffff', width: 5 });
  okCircle.append(okTick);
  const okText = h('div', { class: 'abs center', style: { left: '0', right: '0', top: '462px', fontSize: '58px', fontWeight: 500 } }, sendUi.done);
  const okTimer = h('div', { class: 'abs center', style: { left: '0', right: '0', top: '548px' } },
    h('span', { class: 'chip mono', style: { fontSize: '30px', padding: '10px 22px' } }, sendUi.timer));
  a.append(aTitle, aRow, aBtn, ripple, planeWrap, okCircle, okText, okTimer);

  // Screen B: buy into a fund.
  const b = h('div', { class: 'abs', style: { inset: '0' } });
  const bTitle = h('div', { class: 'app-title' }, fundUi.app);
  const pie = icon('fund', { size: 40, color: '#ecebec', width: 4 });
  const bRow = h('div', { class: 'row', style: { top: '196px' } },
    h('div', { class: 'avatar', style: { borderColor: 'rgba(236,235,236,0.3)' } }, pie),
    h('div', {}, h('div', { class: 'v' }, fundUi.fund)));
  const bars = h('div', { class: 'abs', style: { left: '34px', right: '34px', top: '350px' } });
  for (let i = 0; i < 4; i++) {
    bars.append(h('div', { style: { height: '22px', borderRadius: '11px', background: 'rgba(236,235,236,0.07)', marginBottom: '22px', width: `${[100, 82, 92, 64][i]}%` } }));
  }
  const bBtn = h('div', { class: 'btn', style: { top: '646px' } }, fundUi.button);
  const ripple2 = h('div', { class: 'abs', style: { left: '200px', top: '698px', width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(255,255,255,0.6)' } });
  const spinner = s('svg', { viewBox: '0 0 48 48', width: 44, height: 44 },
    s('circle', { cx: 24, cy: 24, r: 18, fill: 'none', stroke: 'rgba(236,235,236,0.18)', 'stroke-width': 5 }),
    s('path', { d: 'M24 6 A18 18 0 0 1 42 24', fill: 'none', stroke: '#ecebec', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  const pending = h('div', { class: 'abs', style: { left: '34px', right: '34px', top: '646px', height: '104px', borderRadius: '30px', border: '2px dashed rgba(236,235,236,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '22px', fontSize: '36px', fontWeight: 500, color: '#ecebec' } },
    spinner, h('span', {}, fundUi.status));
  b.append(bTitle, bRow, bars, bBtn, ripple2, pending);

  screen.append(a, b);
  return { phone, a, aRow, aBtn, ripple, planeWrap, plane, okCircle, okTick, okText, okTimer, aTitle, b, bBtn, ripple2, pending, spinner };
}

const send = {
  post: 3.75 + 0.6,
  build(ctx) {
    const { root, data, script } = ctx;
    const fundUi = script.scenes.find((x) => x.id === 'fund').ui;
    const copy = copyBox(ctx, { width: 1000 });
    const t1 = words(data.text.lines, data.text.accent, 'display');
    copy.append(t1.el);
    const art = artBox(ctx);
    const P = buildPhone(data.ui, fundUi);
    place(P.phone, ctx.portrait ? 190 : 120, -20, 420, 840);
    art.append(P.phone);
    root.append(art, copy);
    return { t1, P, art };
  },
  update(st, t, ctx) {
    const { t1, P } = st;
    drift(st.art, t, 0, 6.25);
    animWords(t1.words, t, 0.12, 2.18, { stagger: 0.07 });

    // Phone enters, then leaves at the end of the fund scene.
    const pin = tw(t, 0.0, 0.9, E.outExpo);
    const pout = tw(t, 6.0, 0.5, E.inCubic);
    fx(P.phone, {
      y: (1 - pin) * 160 + pout * 180 + Math.sin(t * 1.3) * 4,
      r: (1 - pin) * -6 + pout * 5,
      o: pin * (1 - pout),
      blur: (1 - pin) * 10 + pout * 12,
      s: 1 - pout * 0.06,
    });

    // Screen A choreography.
    const press = t < 0.95 ? 1 : 1 - 0.07 * Math.exp(-(t - 0.95) * 9) * Math.cos((t - 0.95) * 24);
    fx(P.aBtn, { s: press, o: 1 - tw(t, 1.08, 0.2, E.outCubic) });
    const rp = range(t, 0.95, 1.45);
    fx(P.ripple, { s: 1 + rp * 34, o: rp > 0 && rp < 1 ? (1 - rp) * 0.55 : 0 });
    const fly = range(t, 1.0, 1.5);
    const [px, py] = bez([0, 0], [40, -120], [160, -380], [260, -620], E.inQuad(fly));
    fx(P.planeWrap, { x: px, y: py, r: -18 * fly, s: 1 - fly * 0.4, o: fly > 0 && fly < 1 ? 1 - Math.pow(fly, 3) : 0 });
    fx(P.aRow, { o: 1 - tw(t, 1.1, 0.25, E.outCubic), y: -tw(t, 1.1, 0.3) * 20 });
    const ok = spring(t - 1.28, 2.2, 0.45);
    fx(P.okCircle, { s: ok, o: clamp(ok * 3) });
    drawIcon(P.okTick, tw(t, 1.36, 0.45, E.outCubic));
    fx(P.okText, { o: tw(t, 1.45, 0.4), y: (1 - tw(t, 1.45, 0.6)) * 30 });
    fx(P.okTimer, { o: tw(t, 1.6, 0.4), y: (1 - tw(t, 1.6, 0.6)) * 24 });

    // Swap to screen B at 2.5s.
    const sw = tw(t, 2.45, 0.6, E.inOutCubic);
    fx(P.a, { x: -sw * 420, o: 1 - sw });
    fx(P.b, { x: (1 - sw) * 420, o: sw });
    const press2 = t < 3.05 ? 1 : 1 - 0.07 * Math.exp(-(t - 3.05) * 9) * Math.cos((t - 3.05) * 24);
    fx(P.bBtn, { s: press2, o: 1 - tw(t, 3.18, 0.25, E.outCubic) });
    const rp2 = range(t, 3.05, 3.55);
    fx(P.ripple2, { s: 1 + rp2 * 34, o: rp2 > 0 && rp2 < 1 ? (1 - rp2) * 0.55 : 0 });
    fx(P.pending, { o: tw(t, 3.2, 0.4), s: 0.94 + 0.06 * tw(t, 3.2, 0.5) });
    P.spinner.style.transform = `rotate(${Math.round((t - 3.2) * 300) % 360}deg)`;
  },
};

// ---------------------------------------------------------------------------
const fund = {
  build(ctx) {
    const { root, data } = ctx;
    const copy = copyBox(ctx, { width: 1000 });
    const l1 = words(data.text.lines, [], 'display');
    const l2 = words(data.text.lines2, data.text.accent2, 'display');
    l2.el.style.marginTop = '34px';
    copy.append(l1.el, l2.el);

    // Tear-off calendar that flips through the days.
    const art = artBox(ctx);
    const cal = h('div', { class: 'card', style: { width: '290px', height: '310px', borderRadius: '28px', overflow: 'visible' } });
    const band = h('div', { class: 'abs', style: { left: '0', right: '0', top: '0', height: '84px', background: 'var(--red)', borderRadius: '28px 28px 0 0' } });
    for (const x of [70, 196]) band.append(h('div', { class: 'abs', style: { left: `${x}px`, top: '-16px', width: '22px', height: '44px', borderRadius: '11px', background: '#ecebec', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' } }));
    const pages = h('div', { class: 'abs', style: { left: '0', right: '0', top: '84px', bottom: '0', perspective: '900px' } });
    const days = data.ui.days.map((d, i) => {
      const pg = h('div', { class: 'abs', style: { inset: '0', display: 'grid', placeItems: 'center', background: 'linear-gradient(180deg,#f4f3f4,#dedcde)', borderRadius: '0 0 28px 28px', color: '#283a46', fontSize: '86px', fontWeight: 600, letterSpacing: '0.02em', transformOrigin: '50% 0%', zIndex: String(10 - i) } }, d);
      pages.append(pg);
      return pg;
    });
    cal.append(band, pages);
    place(cal, ctx.portrait ? 560 : 500, ctx.portrait ? 500 : 470);
    art.append(cal);
    root.append(art, copy);
    return { l1, l2, cal, days, art };
  },
  update(st, t, ctx) {
    const { l1, l2, cal, days } = st;
    drift(st.art, t, 0, 6.25);
    animWords(l1.words, t, 2.62, 5.95, { stagger: 0.07 });
    animWords(l2.words, t, 3.85, 5.98, { stagger: 0.07 });
    const cin = tw(t, 3.3, 0.8, E.outExpo);
    const cout = tw(t, 6.0, 0.45, E.inCubic);
    fx(cal, { y: (1 - cin) * 120 + cout * 160, r: 6 - (1 - cin) * 10 + cout * 8, o: cin * (1 - cout), blur: (1 - cin) * 8 + cout * 10 });
    const flips = [4.2, 5.1];
    days.forEach((pg, i) => {
      if (i >= flips.length) { pg.style.transform = 'none'; return; }
      const p = tw(t, flips[i], 0.45, E.inCubic);
      pg.style.transform = `rotateX(${(p * 105).toFixed(2)}deg)`;
      pg.style.opacity = String(1 - Math.max(0, p - 0.75) * 4);
    });
  },
};

// ---------------------------------------------------------------------------
const friction = {
  pre: 0.2,
  post: 0.05,
  build(ctx) {
    const { root, data, W, H, portrait } = ctx;
    const names = ['doc', 'idcard', 'people', 'hourglass'];
    const pos = portrait
      ? [[300, 760], [780, 760], [300, 1250], [780, 1250]]
      : [0, 1, 2, 3].map((i) => [960 + (i - 1.5) * 404, 500]);

    // The tangled path a deal takes today, threaded behind the tiles.
    const N = 420;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const env = Math.sin(u * Math.PI);
      if (portrait) {
        pts.push([lerp(120, 960, u) + 200 * Math.sin(u * 17) * env, lerp(560, 1450, u) + 160 * Math.sin(u * 23 + 1) * env]);
      } else {
        const k = u * Math.PI * 2 * 6.5;
        pts.push([lerp(150, 1770, u) - 95 * Math.sin(k) * env, 500 + 150 * Math.sin(u * 9 + 0.6) * env - 95 * Math.cos(k) * env + 95 * env]);
      }
    }
    const straight = pts.map((_, i) => [lerp(W * (portrait ? 0.12 : 0.2), W * (portrait ? 0.88 : 0.8), i / N), H * 0.42]);
    const svg = s('svg', { class: 'abs', width: W, height: H, viewBox: `0 0 ${W} ${H}`, style: 'left:0;top:0' });
    const path = s('path', { fill: 'none', stroke: 'rgba(236,235,236,0.4)', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const dot = s('circle', { r: 12, fill: '#ff5050', style: 'filter: drop-shadow(0 0 12px rgba(255,80,80,0.9))' });
    svg.append(path, dot);
    root.append(svg);

    const tiles = names.map((n, i) => {
      const ic = icon(n, { size: 104, color: '#ecebec', width: 3 });
      const face = h('div', { class: 'face' }, ic);
      const cap = h('div', { class: 'cap' }, data.text.words[i]);
      const tile = h('div', { class: 'tile', style: { width: '320px', left: `${pos[i][0] - 160}px`, top: `${pos[i][1] - 105}px` } }, face, cap);
      root.append(tile);
      return { tile, ic, face, cap };
    });
    // Falling sand inside the hourglass.
    const sand = s('path', { d: 'M24 52 L40 52 L32 44 Z', fill: '#ff5050', stroke: 'none' });
    tiles[3].ic.append(sand);
    return { tiles, path, dot, pts, straight, sand };
  },
  update(st, t, ctx) {
    const lt = t - ctx.data.start;
    const { tiles, path, dot, pts, straight, sand } = st;
    const beats = [0.0, 0.625, 1.25, 1.875];
    const back = tw(lt, 3.0, 0.6, E.inOutCubic);
    tiles.forEach((T, i) => {
      const a = beats[i];
      const sp = spring(lt - a, 2.6, 0.5);
      const p = tw(lt, a, 0.3, E.outCubic);
      fx(T.tile, {
        s: (1.35 - 0.35 * sp) * (1 - back * 0.08),
        r: (1 - p) * (i % 2 ? 5 : -5),
        o: p * (1 - back * 0.85),
        blur: (1 - p) * 12 + back * 5,
        y: back * 14,
      });
      drawIcon(T.ic, tw(lt, a + 0.05, 0.6, E.outCubic));
    });
    sand.setAttribute('d', `M${26 - 2 * Math.sin(lt * 3)} 52 L${38 + 2 * Math.sin(lt * 3)} 52 L32 ${46 - clamp(lt / 3) * 6} Z`);

    // Path draws in, the deal crawls along it, then everything pulls straight.
    const straighten = tw(lt, 3.0, 0.75, E.inOutCubic);
    const drawn = tw(lt, 0.15, 2.6, E.inOutSine);
    const n = Math.max(2, Math.floor(drawn * (pts.length - 1)) + 1);
    const cur = pts.map((p, i) => [lerp(p[0], straight[i][0], straighten), lerp(p[1], straight[i][1], straighten)]);
    const shown = straighten > 0 ? cur : cur.slice(0, n);
    path.setAttribute('d', 'M' + shown.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L'));
    const col = straighten;
    path.setAttribute('stroke', `rgba(${Math.round(lerp(236, 255, col))},${Math.round(lerp(235, 80, col))},${Math.round(lerp(236, 80, col))},${lerp(0.4, 1, col).toFixed(3)})`);
    path.setAttribute('stroke-width', String(lerp(3, 10, col)));
    path.style.filter = col > 0.05 ? `drop-shadow(0 0 ${Math.round(col * 14)}px rgba(255,80,80,0.8))` : 'none';
    // The deal stalls at each checkpoint.
    const crawl = kf(lt, [[0.2, 0.0], [0.9, 0.16], [1.5, 0.18], [2.1, 0.33], [2.6, 0.35], [3.0, 0.42]]);
    const k = Math.min(cur.length - 1, Math.floor(crawl * (cur.length - 1)));
    dot.setAttribute('cx', cur[k][0].toFixed(1));
    dot.setAttribute('cy', cur[k][1].toFixed(1));
    dot.style.opacity = String(tw(lt, 0.2, 0.3) * (1 - straighten));
  },
};

export default { send, fund, friction };
