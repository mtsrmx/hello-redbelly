// Review site: everything below is generated from the same data the film uses.
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k);
  return n;
};
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const [script, src, ver] = await Promise.all([
  fetch('content/script.json').then((r) => r.json()),
  fetch('content/sources.json').then((r) => r.json()),
  fetch('docs/verification.json').then((r) => (r.ok ? r.json() : null)).catch(() => null),
]);
const sources = src.sources;
const srcIndex = Object.fromEntries(sources.map((s, i) => [s.id, i + 1]));
const claimById = Object.fromEntries(script.claims.map((c) => [c.id, c]));
const film = $('#film');

function sceneWords(s) {
  const t = s.text || {};
  const parts = [];
  if (t.lead) parts.push(t.lead);
  if (t.label) parts.push(t.label);
  if (t.headline) parts.push([].concat(t.headline).join(' '));
  for (const k of ['lines', 'body', 'lines2', 'body2', 'items']) if (t[k]) parts.push(t[k].join(' '));
  if (t.words) parts.push(t.words.join(' '));
  if (t.tagline) parts.push(t.tagline.join(' '));
  if (t.url) parts.push(t.url);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
const chapterAt = (t) => script.chapters.find((c) => t >= c.start && t < c.end)?.label || '';

// Player: two formats of the same cut.
const formats = {
  '16x9': { src: 'submission/redbelly-made-simple-16x9.mp4', poster: 'submission/poster-16x9.jpg' },
  '9x16': { src: 'submission/redbelly-made-simple-9x16.mp4', poster: 'submission/poster-9x16.jpg' },
};
function setFormat(ar, keepTime = true) {
  const t = keepTime ? film.currentTime : 0;
  const playing = !film.paused;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ar === ar)));
  $('.frame').dataset.ar = ar;
  film.poster = formats[ar].poster;
  film.querySelector('source').src = formats[ar].src;
  film.load();
  film.addEventListener('loadedmetadata', () => { film.currentTime = t; if (playing) film.play(); }, { once: true });
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setFormat(b.dataset.ar)));
function seek(t) {
  film.currentTime = t;
  film.play().catch(() => {});
  $('#watch').scrollIntoView({ behavior: 'smooth' });
}

// Story.
const scenes = $('#scenes');
for (const s of script.scenes) {
  const img = el('img', { src: `site/thumbs/${s.id}.jpg`, alt: '', loading: 'lazy', width: '640', height: '360' });
  const meta = el('div', { class: 'meta' }, el('span', { class: 'time', text: clock(s.start) }), el('span', { class: 'chap', text: chapterAt(s.start) }), el('p', { text: sceneWords(s) }));
  const btn = el('button', { type: 'button', 'aria-label': `Play from ${clock(s.start)}` }, img, meta);
  btn.addEventListener('click', () => seek(s.start + 0.05));
  scenes.append(el('li', { class: 'scene' }, btn));
}

// Subtitle cues, highlighted as the film plays.
const cues = $('#cues');
const cueEls = script.captions.map((c) => {
  const li = el('li', {}, el('span', { class: 'tc', text: `${clock(c.start)}.${String(Math.round((c.start % 1) * 10))}` }), el('span', { class: 'tx', text: c.text }));
  li.addEventListener('click', () => seek(c.start + 0.02));
  cues.append(li);
  return li;
});
let current = -1;
film.addEventListener('timeupdate', () => {
  const t = film.currentTime;
  const i = script.captions.findIndex((c) => t >= c.start && t < c.end);
  if (i === current) return;
  if (current >= 0) cueEls[current].classList.remove('now');
  current = i;
  if (i >= 0) {
    cueEls[i].classList.add('now');
    const li = cueEls[i];
    if (li.offsetTop < cues.scrollTop || li.offsetTop + li.offsetHeight > cues.scrollTop + cues.clientHeight) {
      cues.scrollTo({ top: li.offsetTop - cues.clientHeight / 3, behavior: 'smooth' });
    }
  }
});

// The brief, point by point.
const checkIcon = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', '18');
  s.setAttribute('height', '18');
  s.innerHTML = '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  return s;
};
const brief = [
  ['One video, 90 seconds or less', `One film, ${script.duration} seconds, delivered in landscape 1920 x 1080 and vertical 1080 x 1920 versions of the same cut.`],
  ['1080p or higher, MP4', 'H.264 High and AAC in MP4 at 30 fps, tagged BT.709, fast start, mixed to -14 LUFS for social platforms.'],
  ['Subtitles burned in or as a file', 'Both. Every line is burned into the picture and the same text ships as SRT and WebVTT. A check confirms each cue matches the picture.'],
  ['A short list of sources', `${sources.length} public sources, listed in SOURCES.md and the PDF pack, with the exact sentence behind every fact.`],
  ['What Redbelly does and why it matters, in everyday words', 'A moment everyone knows (money moves in seconds, buying into a fund takes days), then what Redbelly is, three plain ideas, why you can trust it and why it matters.'],
  ['No banned word and no stand-ins', 'The banned word, the stand-ins the brief names and 13 further jargon patterns are scanned for in everything visible on screen, four times a second, plus the subtitles and the file metadata. None appear.'],
  ['Every fact correct, from public material', `${script.claims.length} claims, each backed by word-for-word quotes from Redbelly, Tokeniser and the RBA's Project Acacia report. A script re-reads the live pages to confirm them.`],
  ['No price talk, advice or promised returns', 'No prices, amounts, returns, tickers or calls to buy, in the film or the subtitles. Checked automatically.'],
  ['No unlicensed music, images or footage', 'Original synthesised score and sound effects; narration by Chatterbox from Resemble AI, MIT licence (commercial use allowed), using its built-in voice with no one cloned; original icons and animation; official Redbelly logo files from the brand kit and the OFL-licensed brand typeface.'],
  ['Checked, not just generated', 'Every sentence was checked against the sources, the quotes are verbatim, every narrated line is confirmed word for word by speech recognition, and the whole entry passes an automated suite before release.'],
  ['No personal credit in the entry', 'No names, handles, signatures, credit watermarks or "made by" lines in the film, the subtitles or the file metadata. Checked automatically. The narration carries Chatterbox\'s inaudible marker that flags it as synthetic speech; it names no one.'],
  ['Not posted before judging', 'This review page is marked noindex and nofollow and is not linked from anywhere. Share it with the judges only.'],
];
const bl = $('#brief-list');
for (const [h, p] of brief) bl.append(el('div', { class: 'req' }, el('span', { class: 'ok' }, checkIcon()), el('div', {}, el('h3', { text: h }), el('p', { text: p }))));

// Fact check.
const fl = $('#facts-list');
for (const s of script.scenes) {
  if (!s.claims.length) continue;
  const quotes = s.claims.reduce((n, id) => n + claimById[id].evidence.length, 0);
  const body = el('div', { class: 'body' });
  for (const id of s.claims) {
    const c = claimById[id];
    body.append(el('p', { class: 'claim', text: c.text }));
    for (const e of c.evidence) {
      const so = sources.find((x) => x.id === e.source);
      body.append(el('blockquote', { class: 'quote' }, `"${e.quote}" `, el('a', { href: so.url, target: '_blank', rel: 'noopener', text: `[${srcIndex[e.source]}] ${so.publisher}` })));
    }
  }
  fl.append(el('details', { class: 'fact' },
    el('summary', {}, el('span', { class: 'tc', text: clock(s.start) }), el('span', { class: 'line', text: sceneWords(s) }), el('span', { class: 'count', text: `${s.claims.length} claim${s.claims.length > 1 ? 's' : ''} · ${quotes} quote${quotes > 1 ? 's' : ''}` })),
    body));
}
$('#stat-facts').textContent = String(script.claims.length);

// Sources.
const sl = $('#sources-list');
const accessed = new Date(`${src.accessed}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
$('#sources-sub').textContent = `${sources.length} public sources: Redbelly Network, Tokeniser and the Reserve Bank of Australia's Project Acacia report, all read on ${accessed}.`;
for (const s of sources) sl.append(el('li', {}, el('b', { text: s.title }), el('span', { class: 'pub', text: s.publisher }), el('br'), el('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.url })));

// Checks.
if (ver) {
  $('#checks-sub').textContent = `${ver.passed} of ${ver.total} automated checks pass. They test the film against every rule in the brief: the words on screen, the subtitles, the facts, the video files and the credits.`;
  if (ver.specs?.length) {
    const t = el('table', {}, el('tr', {}, ...['Format', 'Resolution', 'FPS', 'Length', 'Loudness', 'Size'].map((x) => el('th', { text: x }))));
    for (const r of ver.specs) t.append(el('tr', {}, ...[r.ar.replace('x', ':'), r.res, r.fps, `${r.dur} s`, r.loud, r.size].map((x) => el('td', { text: x }))));
    $('#specs').append(t);
  }
  const cl = $('#checks-list');
  for (const g of ver.groups) {
    const ok = g.results.filter((r) => r.ok).length;
    const ul = el('ul');
    for (const r of g.results) ul.append(el('li', {}, el('span', { class: r.ok ? 'pass' : 'fail', text: r.ok ? '✓' : '✕' }), el('span', {}, r.name, el('span', { class: 'd', text: r.detail }))));
    cl.append(el('div', { class: 'group' }, el('h3', {}, g.name, el('span', { text: `${ok}/${g.results.length}` })), ul));
  }
}

// Copy the suggested post.
$('#copy').addEventListener('click', async () => {
  const text = $('#post-text').textContent;
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = el('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  $('#copy').textContent = 'Copied';
  setTimeout(() => { $('#copy').textContent = 'Copy caption'; }, 1600);
});
