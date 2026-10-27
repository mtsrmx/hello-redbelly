// Build the written deliverables from the same data the film uses:
//   submission/SOURCES.md      the list of sources behind every fact
//   submission/SCRIPT.md       the full script with timings and storyboard notes
//   submission/FACT-CHECK.md   every line of the film, its claim and the exact quotes
//   submission/redbelly-made-simple-submission-pack.pdf   all of the above in one PDF
//   submission/poster-*.jpg and site/thumbs/*.jpg          stills taken from the rendered films
//
// Usage: node tools/docs.mjs
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/script.json'), 'utf8'));
const { sources, accessed } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sources.json'), 'utf8'));
const SUB = path.join(ROOT, 'submission');
const THUMBS = path.join(ROOT, 'site', 'thumbs');
fs.mkdirSync(THUMBS, { recursive: true });

const THUMB_AT = {
  send: 1.9, fund: 5.6, friction: 8.6, reveal: 12.6, what: 18.0, assets: 22.4, digital: 26.0, how: 29.0,
  verified: 35.6, rules: 43.0, final: 50.5, science: 59.0, acacia: 66.0, result: 71.5, bookend: 75.6, end: 82.0,
};

const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const accessedLong = new Date(`${accessed}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const srcIndex = Object.fromEntries(sources.map((s, i) => [s.id, i + 1]));
const claimById = Object.fromEntries(script.claims.map((c) => [c.id, c]));
const voice = fs.existsSync(path.join(ROOT, 'audio/voice/lines.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'audio/voice/lines.json'), 'utf8')) : null;

// Licensed media other than the brand kit, listed with the sources.
const MEDIA = [
  ...(voice ? [{
    what: 'Narration',
    text: `Synthetic voice generated with Chatterbox by Resemble AI, using its built-in default voice (no one's voice is cloned). ${voice.licence} licence, which allows commercial use. It reads the film's own fact-checked subtitles.`,
    url: voice.source,
  }] : []),
  { what: 'Music and sound effects', text: 'Original, synthesised for this film from code (audio/compose.py). No samples, loops or stock music.', url: null },
  { what: 'Typeface', text: 'Readex Pro, SIL Open Font License 1.1, as linked from the Redbelly brand kit.', url: 'https://fonts.google.com/specimen/Readex+Pro' },
];

// The words the viewer reads in each scene, in order.
function sceneWords(s) {
  const t = s.text || {};
  const parts = [];
  if (t.label) parts.push(t.label);
  if (t.number) parts.push(t.number);
  if (t.headline) parts.push([].concat(t.headline).join(' '));
  for (const k of ['lines', 'body', 'lines2', 'body2', 'items']) if (t[k]) parts.push(t[k].join(' '));
  if (t.lead) parts.unshift(t.lead);
  if (t.words) parts.push(t.words.join(' '));
  if (t.tagline) parts.push(t.tagline.join(' '));
  if (t.url) parts.push(t.url);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function frame(video, t, out, width) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1',
    '-vf', `scale=${width}:-2:flags=lanczos`, '-q:v', '3', out]);
  if (r.status !== 0) throw new Error(String(r.stderr));
}

// ---------------------------------------------------------------------------
const v169 = path.join(SUB, 'redbelly-made-simple-16x9.mp4');
const v916 = path.join(SUB, 'redbelly-made-simple-9x16.mp4');
if (fs.existsSync(v169)) {
  for (const s of script.scenes) frame(v169, THUMB_AT[s.id], path.join(THUMBS, `${s.id}.jpg`), 640);
  frame(v169, THUMB_AT.reveal, path.join(SUB, 'poster-16x9.jpg'), 1920);
  console.log('Wrote site/thumbs/*.jpg and submission/poster-16x9.jpg');
}
if (fs.existsSync(v916)) {
  frame(v916, THUMB_AT.reveal, path.join(SUB, 'poster-9x16.jpg'), 1080);
  for (const s of script.scenes) frame(v916, THUMB_AT[s.id], path.join(THUMBS, `${s.id}-9x16.jpg`), 360);
  console.log('Wrote submission/poster-9x16.jpg');
}

// ---------------------------------------------------------------------------
// SOURCES.md
let md = '# Sources\n\n';
md += `Every fact in *${script.title}* comes from the public pages below. All were read on ${accessedLong}. `;
md += 'The exact sentences behind each line of the film are in [FACT-CHECK.md](FACT-CHECK.md).\n\n';
md += '| # | Source | Publisher | Facts it supports |\n|---|---|---|---|\n';
for (const s of sources) {
  const uses = script.claims.filter((c) => c.evidence.some((e) => e.source === s.id)).map((c) => c.text.replace(/\.$/, ''));
  md += `| ${srcIndex[s.id]} | [${s.title}](${s.url}) | ${s.publisher} | ${uses.join('; ')} |\n`;
}
md += '\nThe Redbelly brand kit at [redbelly.network/brand](https://redbelly.network/brand) supplied the logos, the Readex Pro typeface and the colour palette.\n';
md += '\n## Media and licences\n\n| Element | Source and licence |\n|---|---|\n';
for (const m of MEDIA) md += `| ${m.what} | ${m.text}${m.url ? ` ${m.url}` : ''} |\n`;
fs.writeFileSync(path.join(SUB, 'SOURCES.md'), md);

// SCRIPT.md
md = `# ${script.title}: script\n\n`;
md += `${script.logline} Length ${clock(script.duration)} (${script.duration} s). ${voice ? 'A narrator reads the subtitles, and the' : 'The'} words on screen carry the story, so the film works with or without sound; the same words are in the subtitle files.\n\n`;
md += '| Time | On screen | What you see |\n|---|---|---|\n';
for (const s of script.scenes) md += `| ${clock(s.start)} | ${sceneWords(s)} | ${s.visual} |\n`;
md += '\n## Subtitles\n\n| # | In | Out | Text |\n|---|---|---|---|\n';
script.captions.forEach((c, i) => { md += `| ${i + 1} | ${c.start.toFixed(2)} | ${c.end.toFixed(2)} | ${c.text.replace(/\n/g, ' ')}${c.say ? ` (said as "${c.say}")` : ''} |\n`; });
fs.writeFileSync(path.join(SUB, 'SCRIPT.md'), md);

// FACT-CHECK.md
md = '# Fact check\n\n';
md += `Each scene is listed with the words on screen, the claim those words make, and the exact sentences from public sources that support it. Quotes are word for word; [...] marks words left out. Sources were read on ${accessedLong}; \`npm run check-sources\` re-reads every page and confirms each quote is still there.\n\n`;
for (const s of script.scenes) {
  md += `## ${clock(s.start)} · ${sceneWords(s)}\n\n`;
  if (!s.claims.length) { md += '_No factual claim: an everyday example or a heading._\n\n'; continue; }
  for (const id of s.claims) {
    const c = claimById[id];
    md += `**${c.text}**\n\n`;
    for (const e of c.evidence) {
      const src = sources.find((x) => x.id === e.source);
      md += `- "${e.quote}" ([${srcIndex[e.source]}] ${src.publisher}, [${src.title}](${src.url}))\n`;
    }
    md += '\n';
  }
}
fs.writeFileSync(path.join(SUB, 'FACT-CHECK.md'), md);
console.log('Wrote submission/SOURCES.md, SCRIPT.md and FACT-CHECK.md');

// ---------------------------------------------------------------------------
// Submission pack PDF
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fileUrl = (p) => pathToFileURL(p).href;
const verification = fs.existsSync(path.join(ROOT, 'docs/verification.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/verification.json'), 'utf8')) : null;
const logo = fs.readFileSync(path.join(ROOT, 'composition/assets/brand/brand-horizontal-negative.svg'), 'utf8').replace(/<title>[^<]*<\/title>/, '');
const poster = fs.existsSync(path.join(SUB, 'poster-16x9.jpg')) ? `<img class="poster" src="${fileUrl(path.join(SUB, 'poster-16x9.jpg'))}">` : '';

let html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Readex Pro'; src: url('${fileUrl(path.join(ROOT, 'composition/assets/fonts/ReadexPro-VF.ttf'))}'); font-weight: 160 700; }
@page { size: A4; margin: 16mm 15mm; }
* { box-sizing: border-box; }
body { font-family: 'Readex Pro', sans-serif; color: #283a46; font-size: 10pt; line-height: 1.45; margin: 0; }
h1, h2, h3 { font-weight: 500; color: #142530; margin: 0 0 8px; }
h2 { font-size: 17pt; margin-top: 4px; padding-bottom: 8px; border-bottom: 2px solid #ff5050; display: inline-block; }
h3 { font-size: 11pt; margin-top: 14px; }
a { color: #e23a36; text-decoration: none; }
.cover { background: #142530; color: #ecebec; margin: -16mm -15mm 0; padding: 22mm 18mm 18mm; height: 297mm; page-break-after: always; position: relative; }
.cover svg { width: 62mm; height: auto; }
.cover h1 { color: #fff; font-size: 34pt; margin: 18mm 0 4mm; letter-spacing: -0.02em; }
.cover h1 span { color: #ff5050; }
.cover p.lead { font-size: 13pt; color: #d9d9d9; max-width: 150mm; margin: 0 0 9mm; }
.cover .poster { width: 100%; border-radius: 4mm; border: 1px solid rgba(236,235,236,0.15); }
.cover table { width: 100%; border-collapse: collapse; margin-top: 8mm; font-size: 10pt; }
.cover td { padding: 2.4mm 0; border-bottom: 1px solid rgba(236,235,236,0.14); color: #ecebec; vertical-align: top; }
.cover td:first-child { color: #848b91; width: 42mm; }
.sec { page-break-before: always; }
table.grid { width: 100%; border-collapse: collapse; margin-top: 6px; }
table.grid th { text-align: left; font-weight: 500; color: #848b91; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 6px 6px 0; border-bottom: 1.5px solid #283a46; }
table.grid td { padding: 7px 8px 7px 0; border-bottom: 1px solid #d9d9d9; vertical-align: top; }
table.grid tr, .q, .claim, h3 { break-inside: avoid; page-break-inside: avoid; }
h3 { break-after: avoid; page-break-after: avoid; }
table.grid img { width: 38mm; border-radius: 1.5mm; display: block; }
.t { color: #ff5050; font-weight: 500; white-space: nowrap; }
.q { color: #283a46; margin: 3px 0 3px 10px; padding-left: 8px; border-left: 2px solid #ff5050; font-size: 9pt; }
.src { color: #848b91; font-size: 8.5pt; }
.claim { margin: 10px 0 2px; font-weight: 500; }
.pass { color: #1f7a4d; font-weight: 600; } .fail { color: #e23a36; font-weight: 600; }
.note { color: #848b91; font-size: 9pt; }
</style></head><body>`;

html += `<section class="cover">${logo}
<h1>Redbelly, <span>made simple</span></h1>
<p class="lead">${esc(script.logline)} An animated explainer for people outside crypto, told in everyday words with no jargon.</p>
${poster}
<table>
<tr><td>Format</td><td>Video. Landscape 1920 x 1080 and vertical 1080 x 1920 versions of the same cut</td></tr>
<tr><td>Length</td><td>${script.duration} seconds (limit 90)</td></tr>
<tr><td>Files</td><td>MP4, H.264 and AAC, 30 fps</td></tr>
<tr><td>Subtitles</td><td>Burned into the picture, plus separate SRT and WebVTT files</td></tr>
<tr><td>Sound</td><td>${voice ? `Narration by a licensed synthetic voice (Chatterbox, ${voice.licence} licence) reading the subtitles. ` : ''}Original music and effects, synthesised for this film</td></tr>
<tr><td>Sources</td><td>${sources.length} public sources: Redbelly, Tokeniser and the RBA's Project Acacia report</td></tr>
</table></section>`;

html += '<section><h2>Script and storyboard</h2><table class="grid"><tr><th>Time</th><th>Frame</th><th>On screen</th><th>What you see</th></tr>';
for (const s of script.scenes) {
  const img = fs.existsSync(path.join(THUMBS, `${s.id}.jpg`)) ? `<img src="${fileUrl(path.join(THUMBS, `${s.id}.jpg`))}">` : '';
  html += `<tr><td class="t">${clock(s.start)}</td><td>${img}</td><td>${esc(sceneWords(s))}</td><td class="note">${esc(s.visual)}</td></tr>`;
}
html += '</table></section>';

html += `<section class="sec"><h2>Sources</h2><p class="note">All read on ${accessedLong}. Every fact in the film traces to at least one of these pages.</p><table class="grid"><tr><th>#</th><th>Source</th><th>Facts it supports</th></tr>`;
for (const s of sources) {
  const uses = script.claims.filter((c) => c.evidence.some((e) => e.source === s.id)).map((c) => esc(c.text));
  html += `<tr><td class="t">${srcIndex[s.id]}</td><td><b>${esc(s.title)}</b><br><span class="src">${esc(s.publisher)}</span><br><a href="${s.url}">${esc(s.url)}</a></td><td class="note">${uses.join('<br>')}</td></tr>`;
}
html += '</table><h3>Media and licences</h3><table class="grid"><tr><th>Element</th><th>Source and licence</th></tr>';
for (const m of MEDIA) html += `<tr><td><b>${esc(m.what)}</b></td><td class="note">${esc(m.text)}${m.url ? `<br><a href="${m.url}">${esc(m.url)}</a>` : ''}</td></tr>`;
html += '</table></section>';

html += '<section class="sec"><h2>Fact check</h2><p class="note">Each line of the film, the claim it makes and the exact supporting sentences. [...] marks words left out of a quote.</p>';
for (const s of script.scenes) {
  if (!s.claims.length) continue;
  html += `<h3><span class="t">${clock(s.start)}</span> ${esc(sceneWords(s))}</h3>`;
  for (const id of s.claims) {
    const c = claimById[id];
    html += `<div class="claim">${esc(c.text)}</div>`;
    for (const e of c.evidence) html += `<div class="q">"${esc(e.quote)}" <span class="src">[${srcIndex[e.source]}]</span></div>`;
  }
}
html += '</section>';

if (verification) {
  html += `<section class="sec"><h2>Verification</h2><p>${verification.passed} of ${verification.total} automated checks pass. They are re-run with <code>npm run verify</code>.</p>`;
  for (const g of verification.groups) {
    html += `<h3>${esc(g.name)}</h3><table class="grid"><tr><th>Check</th><th>Result</th><th>Detail</th></tr>`;
    for (const r of g.results) html += `<tr><td>${esc(r.name)}</td><td class="${r.ok ? 'pass' : 'fail'}">${r.ok ? 'PASS' : 'FAIL'}</td><td class="note">${esc(r.detail)}</td></tr>`;
    html += '</table>';
  }
  html += '</section>';
}
html += '</body></html>';

const tmpHtml = path.join(ROOT, 'build', 'submission-pack.html');
fs.mkdirSync(path.dirname(tmpHtml), { recursive: true });
fs.writeFileSync(tmpHtml, html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: path.join(SUB, 'redbelly-made-simple-submission-pack.pdf'), format: 'A4', printBackground: true, margin: { top: '16mm', bottom: '16mm', left: '15mm', right: '15mm' } });
await browser.close();
console.log('Wrote submission/redbelly-made-simple-submission-pack.pdf');
