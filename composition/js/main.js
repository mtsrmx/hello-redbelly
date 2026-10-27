// Composition runtime: loads the script, builds every scene once, then draws any
// moment in time with seek(t). Used both for live playback and frame rendering.
import { Background } from './background.js';
import { h, fx, show, visibleText } from './dom.js';
import { tw, E } from './engine.js';
import { SCENES } from './scenes/index.js';
import { Wipe } from './polish.js';

const params = new URLSearchParams(location.search);
const RENDER = params.has('render');
const PORTRAIT = params.get('ar') === '9x16';
const W = PORTRAIT ? 1080 : 1920;
const H = PORTRAIT ? 1920 : 1080;

async function loadText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to load ${url}`);
  return r.text();
}

async function boot() {
  const script = JSON.parse(await loadText(new URL('../../content/script.json', import.meta.url)));
  const brandFiles = {
    isoWhite: 'isotype-white.svg',
    isoRed: 'isotype-red.svg',
    logoH: 'brand-horizontal-negative.svg',
    logoV: 'brand-vertical-negative.svg',
  };
  const brand = {};
  for (const [k, f] of Object.entries(brandFiles)) {
    brand[k] = await loadText(new URL(`../assets/brand/${f}`, import.meta.url));
  }

  const stage = document.getElementById('stage');
  if (PORTRAIT) stage.classList.add('portrait');
  const bg = new Background(document.getElementById('bg'), W, H, PORTRAIT, script);
  const layer = document.getElementById('scenes');
  const wipe = new Wipe(document.getElementById('wipe'), W, H, script.chapters.slice(1).map((c) => c.start));

  // Brand SVGs are inlined so their parts can be animated. Each copy gets its
  // own class names, because the official files reuse the same ones.
  let svgCopy = 0;
  const inlineSvg = (key, cls = '') => {
    const id = `b${svgCopy++}`;
    const src = brand[key].replace(/\.([a-f0-9-]{36})/g, (m, c) => `.${id}-${c}`).replace(/class="([a-f0-9-]{36})"/g, (m, c) => `class="${id}-${c}"`);
    const wrap = h('div', { class: `brand ${cls}`, html: src });
    const svg = wrap.querySelector('svg');
    svg.removeAttribute('id');
    svg.querySelector('title')?.remove();
    svg.setAttribute('aria-hidden', 'true');
    return wrap;
  };

  const ctx = { W, H, portrait: PORTRAIT, script, brand, inlineSvg };
  const built = [];
  for (const data of script.scenes) {
    const def = SCENES[data.id];
    if (!def) throw new Error(`No scene for ${data.id}`);
    const root = h('div', { class: `scene scene-${data.id}`, 'data-scene': data.id });
    layer.append(root);
    const state = def.build({ ...ctx, root, data });
    built.push({ def, data, root, state, pre: def.pre ?? 0.25, post: def.post ?? 0.6 });
  }

  // Chapter label, top left, with the red rule from the brand manual.
  const chapterEl = document.getElementById('chapter');
  const chapters = script.chapters.map((c) => {
    const text = h('span', { class: 'chap-text label' }, c.label);
    const rule = h('span', { class: 'chap-rule' });
    const el = h('div', { class: 'chap' }, text, rule);
    chapterEl.append(el);
    return { ...c, el, text, rule };
  });

  await document.fonts.ready;
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));

  function seek(t) {
    bg.draw(t);
    for (const b of built) {
      const on = t >= b.data.start - b.pre && t <= b.data.end + b.post;
      show(b.root, on);
      if (on) b.def.update(b.state, t, { ...ctx, data: b.data, root: b.root });
    }
    for (const c of chapters) {
      const on = t >= c.start - 0.1 && t <= c.end + 0.5;
      show(c.el, on);
      if (!on) continue;
      const pin = tw(t, c.start + 0.25, 0.7, E.outExpo);
      const pout = tw(t, c.end - 0.35, 0.4, E.inCubic);
      fx(c.text, { y: (1 - pin) * 18 + pout * -10, o: pin * (1 - pout), blur: (1 - pin) * 6 });
      c.rule.style.transform = `scaleX(${(tw(t, c.start + 0.15, 0.9, E.outExpo) * (1 - pout)).toFixed(4)})`;
    }
    wipe.draw(t);
  }

  const api = {
    W, H, portrait: PORTRAIT, duration: script.duration, script,
    seek, text: () => visibleText(stage),
  };
  window.__composition = api;
  seek(Number(params.get('t') || 0));
  document.documentElement.dataset.ready = '1';

  if (!RENDER) livePlayer(api);
}

// Live playback in the browser, scaled to the window, synced to the soundtrack.
function livePlayer(api) {
  const stage = document.getElementById('stage');
  const fit = () => {
    const s = Math.min(innerWidth / api.W, innerHeight / api.H);
    stage.style.transform = `translate(${(innerWidth - api.W * s) / 2}px, ${(innerHeight - api.H * s) / 2}px) scale(${s})`;
  };
  fit();
  addEventListener('resize', fit);
  const audio = new Audio(new URL('../assets/audio/soundtrack.m4a', import.meta.url).href);
  audio.preload = 'auto';
  let start = null;
  let t0 = Number(params.get('t') || 0);
  let playing = false;
  const ui = document.getElementById('play');
  const now = () => (playing ? (audio.duration && !audio.paused ? audio.currentTime : (performance.now() - start) / 1000 + t0) : t0);
  const loop = () => {
    const t = now();
    api.seek(Math.min(t, api.duration));
    if (playing && t >= api.duration) { playing = false; t0 = 0; ui?.classList.remove('hide'); }
    requestAnimationFrame(loop);
  };
  const toggle = () => {
    if (playing) {
      t0 = now();
      playing = false;
      audio.pause();
      ui?.classList.remove('hide');
    } else {
      playing = true;
      start = performance.now();
      audio.currentTime = t0;
      audio.play().catch(() => {});
      ui?.classList.add('hide');
    }
  };
  addEventListener('click', toggle);
  addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggle(); } });
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  document.documentElement.dataset.error = String(e && e.stack || e);
  console.error(e);
});
