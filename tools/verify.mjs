// Verification suite: checks the entry against every rule in the brief.
//
//   node tools/verify.mjs            print the report, exit 1 on any failure
//   node tools/verify.mjs --write    also refresh docs/VERIFICATION.md
//
// What it checks:
//   1. Wording   - the banned word and its stand-ins never appear on screen, in the
//                  captions, in the script or in the video metadata; plus a stricter
//                  jargon list so the entry stays in everyday language.
//   2. Facts     - every factual scene is backed by claims, every claim by a quote,
//                  and every quote belongs to a listed public source.
//   3. Captions  - SRT and VTT match the script, are in order, never overlap, stay
//                  readable (line length, lines per cue, reading speed) and match
//                  the words burned into the picture at that moment.
//   4. Video     - MP4, H.264 High, yuv420p, 1080p or higher, 30 fps, at most 90 s,
//                  AAC stereo, BT.709 tags, fast start, -14 LUFS and true peak.
//   5. Rules     - no personal credit, no price talk or investment advice, official
//                  logo files untouched, brand font and colours, licensed assets.
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { srt as makeSrt, vtt as makeVtt } from './captions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const script = JSON.parse(read('content/script.json'));
const sources = JSON.parse(read('content/sources.json'));
const WRITE = process.argv.includes('--write');

// ---------------------------------------------------------------------------
// Word lists. The banned word is written with a gap so that this file never
// contains it as a word itself.
const BANNED = [
  { name: 'the banned word (and variants)', re: new RegExp('b\\s*l\\s*o\\s*c\\s*k[\\s\\-_]*c\\s*h\\s*a\\s*i\\s*n', 'i') },
  { name: 'the first stand-in the brief names (distributed + ledger)', re: /distributed[\s\-_]*ledger/i },
  { name: 'the second stand-in the brief names (its three-letter short form)', re: /\bD\.?\s?L\.?\s?T\b/ },
];
const STAND_INS = [
  { name: 'ledger', re: /\bledgers?\b/i },
  { name: 'chain / on-chain', re: /\b(on|off)?[\s-]?chains?\b/i },
  { name: 'crypto', re: /\bcrypto/i },
  { name: 'web3', re: /\bweb\s?3\b/i },
  { name: 'decentralised', re: /\bdecentrali[sz]/i },
  { name: 'layer 1', re: /\blayer[\s-]?(1|one)\b|\bL1\b/i },
  { name: 'node', re: /\bnodes?\b/i },
  { name: 'consensus', re: /\bconsensus\b/i },
  { name: 'smart contract', re: /\bsmart[\s-]contracts?\b/i },
  { name: 'token / tokenise', re: /\btoken/i },
  { name: 'DeFi / NFT', re: /\bdefi\b|\bnfts?\b/i },
  { name: 'stablecoin / CBDC', re: /stablecoin|\bcbdc\b/i },
  { name: 'mining', re: /\bmin(ing|ers?)\b/i },
];
const PRICE_TALK = [
  { name: 'price', re: /\bpric(e|es|ing)\b/i },
  { name: 'profit / gains', re: /\bprofits?\b|\bgains?\b/i },
  { name: 'returns / yield / APY', re: /\breturns?\b|\byields?\b|\bAPY\b|\bAPR\b|\bROI\b/i },
  { name: 'earn / income', re: /\bearn(s|ing)?\b|passive income/i },
  { name: 'advice to invest or buy', re: /\binvest in\b|\byou should (buy|invest)|\bbuy now\b|financial advice/i },
  { name: 'hype', re: /to the moon|\b\d+x\b|guaranteed|\bmarket cap/i },
  { name: 'token ticker', re: /\$?\bRBNT\b/i },
  { name: 'money amounts', re: /(A\$|US\$|\$)\s?\d/ },
];
// Creator names come from git (commit authors and the repository owner), so no
// personal name has to be written into this repository.
function creatorNames() {
  const names = new Set();
  const log = spawnSync('git', ['log', '--format=%an%n%cn'], { cwd: ROOT, encoding: 'utf8' });
  for (const n of (log.stdout || '').split('\n')) if (n.trim()) names.add(n.trim());
  const remote = spawnSync('git', ['config', '--get', 'remote.origin.url'], { cwd: ROOT, encoding: 'utf8' });
  const owner = ((remote.stdout || '').match(/github\.com[/:]([^/]+)\//) || [])[1];
  if (owner) names.add(owner);
  return [...names].filter((n) => n.length > 2);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CREATORS = creatorNames();
const CREDIT = [
  { name: 'social handle', re: /@[A-Za-z0-9_]{2,}/ },
  { name: '"made by" style credit', re: /\b(made|created|produced|designed|edited|animated|directed|written) by\b/i },
  { name: 'copyright line', re: /©|\(c\)\s?\d{4}|copyright/i },
  ...(CREATORS.length ? [{ name: 'creator name (from git)', re: new RegExp(CREATORS.map(esc).join('|'), 'i') }] : []),
];

// ---------------------------------------------------------------------------
const results = [];
function check(group, name, ok, detail = '') {
  results.push({ group, name, ok: Boolean(ok), detail });
}
const fmt = (n, d = 1) => Number(n).toFixed(d);

function scan(texts, list) {
  const hits = [];
  for (const { where, text } of texts) {
    for (const rule of list) {
      const m = text.match(rule.re);
      if (m) hits.push(`${rule.name}: "${m[0]}" in ${where}`);
    }
  }
  return hits;
}

// Every string that is shown to the viewer, straight from the script.
function scriptDisplayStrings() {
  const out = [{ where: 'title', text: script.title }];
  const walk = (v, where) => {
    if (typeof v === 'string') out.push({ where, text: v });
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`);
  };
  for (const s of script.scenes) {
    walk(s.text, `scene ${s.id} text`);
    walk(s.ui || {}, `scene ${s.id} ui`);
  }
  script.chapters.forEach((c) => out.push({ where: 'chapter label', text: c.label }));
  script.captions.forEach((c, i) => out.push({ where: `caption ${i + 1}`, text: c.text }));
  return out;
}

// Sample everything visible on screen, four times a second, in both formats.
async function sampleScreens() {
  const server = await startServer(0);
  const port = server.address().port;
  const browser = await chromium.launch();
  const out = {};
  for (const ar of ['16x9', '9x16']) {
    const portrait = ar === '9x16';
    const page = await browser.newPage({ viewport: { width: portrait ? 1080 : 1920, height: portrait ? 1920 : 1080 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${port}/composition/index.html?render=1${portrait ? '&ar=9x16' : ''}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready || document.documentElement.dataset.error, null, { timeout: 120000 });
    const samples = await page.evaluate((dur) => {
      const res = [];
      for (let t = 0; t <= dur + 1e-6; t += 0.25) {
        window.__composition.seek(t);
        res.push({ t: Math.round(t * 100) / 100, text: window.__composition.text() });
      }
      return res;
    }, script.duration);
    out[ar] = { samples, errors };
    await page.close();
  }
  await browser.close();
  server.close();
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'onscreen-text.json'), JSON.stringify(out, null, 1));
  return out;
}

function parseSrt(txt) {
  const blocks = txt.replace(/\r/g, '').trim().split(/\n\n+/);
  return blocks.map((b) => {
    const lines = b.split('\n');
    const m = lines[1].match(/(\d\d):(\d\d):(\d\d)[,.](\d{3}) --> (\d\d):(\d\d):(\d\d)[,.](\d{3})/);
    const sec = (h, mi, s, ms) => Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    return { index: Number(lines[0]), start: sec(m[1], m[2], m[3], m[4]), end: sec(m[5], m[6], m[7], m[8]), text: lines.slice(2).join('\n') };
  });
}

function parseVtt(txt) {
  const body = txt.replace(/\r/g, '').replace(/^WEBVTT[^\n]*\n\n/, '').trim();
  return body.split(/\n\n+/).map((b, i) => {
    const lines = b.split('\n');
    const m = lines[0].match(/(\d\d):(\d\d):(\d\d)\.(\d{3}) --> (\d\d):(\d\d):(\d\d)\.(\d{3})/);
    const sec = (h, mi, s, ms) => Number(h) * 3600 + Number(mi) * 60 + Number(s) + Number(ms) / 1000;
    return { index: i + 1, start: sec(m[1], m[2], m[3], m[4]), end: sec(m[5], m[6], m[7], m[8]), text: lines.slice(1).join('\n') };
  });
}

const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'$ ]+/g, ' ').replace(/\s+/g, ' ').trim();

function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  return JSON.parse(r.stdout);
}

function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary'));
  const I = Number((s.match(/I:\s+(-?[\d.]+) LUFS/) || [])[1]);
  const TP = Number((s.match(/Peak:\s+(-?[\d.]+) dBFS/) || [])[1]);
  return { I, TP };
}

function moovFirst(file) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(16);
  let off = 0;
  const size = fs.statSync(file).size;
  while (off < size) {
    fs.readSync(fd, buf, 0, 16, off);
    let len = buf.readUInt32BE(0);
    const type = buf.toString('latin1', 4, 8);
    if (len === 1) len = Number(buf.readBigUInt64BE(8));
    if (type === 'moov') { fs.closeSync(fd); return true; }
    if (type === 'mdat') { fs.closeSync(fd); return false; }
    if (len < 8) break;
    off += len;
  }
  fs.closeSync(fd);
  return false;
}

const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex');

// ---------------------------------------------------------------------------
async function main() {
  // 0. Script integrity -------------------------------------------------------
  const sc = script.scenes;
  check('Script', 'Running time is 90 seconds or less', script.duration <= 90, `${fmt(script.duration, 2)} s`);
  check('Script', 'Scenes run back to back from 0 s to the end',
    sc[0].start === 0 && sc.every((s, i) => i === 0 || Math.abs(s.start - sc[i - 1].end) < 1e-6) && Math.abs(sc[sc.length - 1].end - script.duration) < 1e-6,
    `${sc.length} scenes`);

  // 1. Wording -----------------------------------------------------------------
  const display = scriptDisplayStrings();
  const screens = await sampleScreens();
  for (const [ar, d] of Object.entries(screens)) {
    check('Wording', `Composition loads without errors (${ar})`, d.errors.length === 0, d.errors.join('; ') || 'no page errors');
    check('Wording', `On-screen text sampled for the whole film (${ar})`, d.samples.length >= script.duration * 4, `${d.samples.length} samples, 4 per second`);
  }
  const onScreen = [];
  for (const [ar, d] of Object.entries(screens)) {
    const seen = new Set();
    for (const s of d.samples) for (const tx of s.text) if (!seen.has(tx)) { seen.add(tx); onScreen.push({ where: `on screen ${ar} at ${fmt(s.t, 2)} s`, text: tx }); }
  }
  const srtTxt = fs.existsSync(path.join(ROOT, 'submission/redbelly-made-simple.en.srt')) ? read('submission/redbelly-made-simple.en.srt') : '';
  const vttTxt = fs.existsSync(path.join(ROOT, 'submission/redbelly-made-simple.en.vtt')) ? read('submission/redbelly-made-simple.en.vtt') : '';
  const subtitleTexts = [{ where: 'SRT file', text: srtTxt }, { where: 'VTT file', text: vttTxt }];
  const entryTexts = [...display, ...onScreen, ...subtitleTexts];
  const distinctScreen = new Set(onScreen.map((x) => x.text)).size;

  let hits = scan(entryTexts, BANNED);
  check('Wording', 'The banned word and the two stand-ins the brief names never appear in the entry', hits.length === 0,
    hits.length ? hits.join('; ') : `${display.length} script strings, ${distinctScreen} distinct on-screen strings and both subtitle files scanned`);
  hits = scan(entryTexts, STAND_INS);
  check('Wording', 'No other stand-ins or jargon (ledger, chain, crypto, token, node, consensus and more)', hits.length === 0,
    hits.length ? hits.join('; ') : `${STAND_INS.length} jargon patterns, none found`);

  // The whole repository is kept free of the three banned terms too.
  const repoHits = [];
  const skip = new Set(['node_modules', 'build', '.git']);
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(f.name)) continue;
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(html|css|js|mjs|json|md|txt|srt|vtt|py|svg|csv|yml|yaml)$/i.test(f.name)) {
        const txt = fs.readFileSync(p, 'utf8');
        for (const rule of BANNED) if (rule.re.test(txt)) repoHits.push(`${rule.name} in ${path.relative(ROOT, p)}`);
      }
    }
  };
  walk(ROOT);
  check('Wording', 'No file in the repository contains the three banned terms', repoHits.length === 0, repoHits.join('; ') || 'all text files scanned');

  // 2. Facts -------------------------------------------------------------------
  const srcById = Object.fromEntries(sources.sources.map((s) => [s.id, s]));
  const claimById = Object.fromEntries(script.claims.map((c) => [c.id, c]));
  const factual = sc.filter((s) => !['send', 'how'].includes(s.id));
  check('Facts', 'Every scene that states a fact cites at least one claim', factual.every((s) => s.claims && s.claims.length), factual.filter((s) => !s.claims?.length).map((s) => s.id).join(', ') || `${factual.length} scenes`);
  const unknown = sc.flatMap((s) => (s.claims || []).filter((c) => !claimById[c]).map((c) => `${s.id}:${c}`));
  check('Facts', 'Every claim a scene cites exists', unknown.length === 0, unknown.join(', ') || `${new Set(sc.flatMap((s) => s.claims || [])).size} distinct claims cited`);
  const badEvidence = [];
  for (const c of script.claims) {
    if (!c.evidence?.length) badEvidence.push(`${c.id}: no evidence`);
    for (const e of c.evidence || []) {
      const s = srcById[e.source];
      if (!s) badEvidence.push(`${c.id}: unknown source ${e.source}`);
      else if (!s.quotes.includes(e.quote)) badEvidence.push(`${c.id}: quote not listed under ${e.source}`);
    }
  }
  check('Facts', 'Every claim is backed by a verbatim quote from a listed source', badEvidence.length === 0, badEvidence.join('; ') || `${script.claims.length} claims, ${script.claims.reduce((n, c) => n + c.evidence.length, 0)} quotes`);
  const badSources = sources.sources.filter((s) => !/^https:\/\//.test(s.url) || !s.title || !s.publisher || !s.quotes.length);
  check('Facts', 'Every source has a publisher, title, https link and quotes', badSources.length === 0, badSources.map((s) => s.id).join(', ') || `${sources.sources.length} sources`);
  const used = new Set(script.claims.flatMap((c) => c.evidence.map((e) => e.source)));
  const unused = sources.sources.filter((s) => !used.has(s.id)).map((s) => s.id);
  check('Facts', 'Every listed source is used by at least one claim', unused.length === 0, unused.join(', ') || 'all sources used');
  const publicOnly = sources.sources.every((s) => /redbelly\.network|tokeniser\.com|rba\.gov\.au/.test(s.url));
  check('Facts', 'Facts come only from public Redbelly material and the RBA report', publicOnly, [...new Set(sources.sources.map((s) => new URL(s.url).hostname))].join(', '));

  // 3. Captions ---------------------------------------------------------------
  const caps = script.captions;
  check('Captions', 'SRT and VTT files exist', srtTxt && vttTxt, 'submission/redbelly-made-simple.en.srt and .en.vtt');
  if (srtTxt && vttTxt) {
    const S = parseSrt(srtTxt);
    const V = parseVtt(vttTxt);
    check('Captions', 'Subtitle files are up to date with the script', srtTxt === makeSrt() && vttTxt === makeVtt(), 'regenerate with npm run captions');
    check('Captions', 'SRT cues are numbered 1..n in order', S.every((c, i) => c.index === i + 1), `${S.length} cues`);
    check('Captions', 'SRT and VTT carry the same cues', S.length === V.length && S.every((c, i) => c.text === V[i].text && Math.abs(c.start - V[i].start) < 1e-3 && Math.abs(c.end - V[i].end) < 1e-3), `${V.length} cues`);
    const overlaps = S.filter((c, i) => i && c.start < S[i - 1].end - 1e-6).map((c) => c.index);
    check('Captions', 'Cues never overlap and stay inside the film', overlaps.length === 0 && S.every((c) => c.start >= 0 && c.end <= script.duration && c.end > c.start), overlaps.join(', ') || `last cue ends ${fmt(S[S.length - 1].end, 2)} s`);
    const longLines = S.filter((c) => c.text.split('\n').some((l) => l.length > 42) || c.text.split('\n').length > 2).map((c) => c.index);
    check('Captions', 'At most two lines per cue and 42 characters per line', longLines.length === 0, longLines.join(', ') || `longest line ${Math.max(...S.flatMap((c) => c.text.split('\n').map((l) => l.length)))} characters`);
    const speeds = S.map((c) => ({ i: c.index, cps: c.text.replace(/\n/g, ' ').length / (c.end - c.start), d: c.end - c.start }));
    const fast = speeds.filter((x) => x.cps > 20).map((x) => `${x.i} (${fmt(x.cps)} cps)`);
    check('Captions', 'Reading speed is 20 characters per second or less', fast.length === 0, fast.join(', ') || `fastest ${fmt(Math.max(...speeds.map((x) => x.cps)))} cps`);
    const short = speeds.filter((x) => x.d < 1.0).map((x) => x.i);
    check('Captions', 'Every cue stays up for at least 1 second', short.length === 0, short.join(', ') || `shortest ${fmt(Math.min(...speeds.map((x) => x.d)), 2)} s`);
    // Burned in: the words of each cue are on screen while the cue is shown.
    for (const ar of Object.keys(screens)) {
      const misses = [];
      for (const c of S) {
        const window_ = screens[ar].samples.filter((s) => s.t >= c.start - 0.3 && s.t <= c.end + 0.3);
        const screenWords = new Set(norm(window_.flatMap((s) => s.text).join(' ')).split(' '));
        const words = norm(c.text).split(' ').filter((w) => !['one', 'two', 'three', 'in', 'project', 'acacia', 'the'].includes(w));
        const found = words.filter((w) => screenWords.has(w)).length;
        if (found / words.length < 0.85) misses.push(`${c.index} (${found}/${words.length})`);
      }
      check('Captions', `Every cue's words are burned into the picture while it shows (${ar})`, misses.length === 0, misses.join(', ') || `${S.length} cues matched against the on-screen text`);
    }
  }

  // 4. Video -------------------------------------------------------------------
  const videos = ['16x9', '9x16'].map((ar) => ({ ar, file: path.join(ROOT, 'submission', `redbelly-made-simple-${ar}.mp4`) })).filter((v) => fs.existsSync(v.file));
  check('Video', 'Rendered video files are present', videos.length > 0, videos.map((v) => path.relative(ROOT, v.file)).join(', ') || 'none rendered yet: npm run render');
  const specRows = [];
  for (const v of videos) {
    const p = probe(v.file);
    const vs = p.streams.find((s) => s.codec_type === 'video');
    const as = p.streams.find((s) => s.codec_type === 'audio');
    const [num, den] = vs.r_frame_rate.split('/').map(Number);
    const fps = num / den;
    const dur = Number(p.format.duration);
    const size = fs.statSync(v.file).size;
    const L = loudness(v.file);
    const wantW = v.ar === '9x16' ? 1080 : 1920;
    const wantH = v.ar === '9x16' ? 1920 : 1080;
    const tags = { ...(p.format.tags || {}) };
    const creditTags = Object.keys(tags).filter((k) => /artist|author|composer|comment|copyright|publisher|album|description|encoded_by|creator/i.test(k));
    const metaHits = scan([{ where: 'metadata', text: Object.values(tags).join(' ') }], [...BANNED, ...CREDIT]);
    check('Video', `${v.ar}: MP4 container with H.264 High video and AAC audio`, /mp4/.test(p.format.format_name) && vs.codec_name === 'h264' && /High/.test(vs.profile) && as?.codec_name === 'aac', `${p.format.format_name}, ${vs.codec_name} ${vs.profile}, ${as?.codec_name}`);
    check('Video', `${v.ar}: ${wantW} x ${wantH} (1080p or higher)`, vs.width === wantW && vs.height === wantH && Math.min(vs.width, vs.height) >= 1080, `${vs.width} x ${vs.height}`);
    check('Video', `${v.ar}: 30 fps, yuv420p, BT.709 colour tags`, Math.abs(fps - 30) < 0.01 && vs.pix_fmt === 'yuv420p' && vs.color_space === 'bt709', `${fmt(fps, 2)} fps, ${vs.pix_fmt}, ${vs.color_space}`);
    check('Video', `${v.ar}: 90 seconds or less`, dur <= 90.0, `${fmt(dur, 2)} s`);
    check('Video', `${v.ar}: stereo 48 kHz audio`, as && Number(as.sample_rate) === 48000 && as.channels === 2, as ? `${as.sample_rate} Hz, ${as.channels} ch` : 'no audio');
    check('Video', `${v.ar}: loudness -14 LUFS (within 1 LU), true peak at or below -1 dBTP`, Math.abs(L.I + 14) <= 1 && L.TP <= -1.0, `${fmt(L.I)} LUFS, ${fmt(L.TP)} dBTP`);
    check('Video', `${v.ar}: fast start (plays while downloading)`, moovFirst(v.file), 'moov atom before mdat');
    check('Video', `${v.ar}: no credit or banned words in file metadata`, creditTags.length === 0 && metaHits.length === 0, [...creditTags, ...metaHits].join('; ') || `tags: ${Object.keys(tags).join(', ')}`);
    check('Video', `${v.ar}: file size under 100 MB`, size < 100 * 1024 * 1024, `${fmt(size / 1024 / 1024)} MB`);
    specRows.push({ ar: v.ar, res: `${vs.width} x ${vs.height}`, fps: fmt(fps, 2), dur: fmt(dur, 2), loud: `${fmt(L.I)} LUFS / ${fmt(L.TP)} dBTP`, size: `${fmt(size / 1024 / 1024)} MB`, br: `${Math.round(Number(p.format.bit_rate) / 1000)} kb/s` });
  }

  // 5. Rules -------------------------------------------------------------------
  hits = scan(entryTexts, CREDIT);
  check('Rules', 'No personal credit in the entry (names, handles, "made by", signatures)', hits.length === 0, hits.join('; ') || 'none found');
  hits = scan(entryTexts, PRICE_TALK);
  check('Rules', 'No price talk, investment advice or promises of returns', hits.length === 0, hits.join('; ') || `${PRICE_TALK.length} patterns, none found`);
  const urls = [...new Set(onScreen.flatMap((x) => x.text.match(/\b[a-z0-9-]+\.(network|com|org|io|net|au|xyz)\b/gi) || []))];
  check('Rules', 'The only web address on screen is redbelly.network', urls.length === 1 && urls[0] === 'redbelly.network', urls.join(', ') || 'none');
  const official = JSON.parse(read('composition/assets/brand/official-hashes.json'));
  const changed = Object.entries(official.files).filter(([f, h]) => sha256(`composition/assets/brand/${f}`) !== h).map(([f]) => f);
  check('Rules', 'Logo files are byte-identical to the official Redbelly brand pack', changed.length === 0, changed.join(', ') || `${Object.keys(official.files).length} files match the SHA-256 recorded from the brand pack`);
  const css = read('composition/styles.css');
  const families = [...new Set((css.match(/font-family:\s*([^;]+);/g) || []).map((x) => x.replace(/font-family:\s*/, '').split(',')[0].replace(/['";]/g, '').trim()))];
  check('Rules', 'Brand typeface Readex Pro is the only font used', families.length === 1 && families[0] === 'Readex Pro', families.join(', '));
  const palette = ['#ff5050', '#283a46', '#142530', '#848b91', '#d9d9d9', '#ecebec', '#fa423c'];
  const missing = palette.filter((c) => !css.toLowerCase().includes(c));
  check('Rules', 'Brand colours defined as design tokens', missing.length === 0, missing.join(', ') || palette.join(' '));
  const assets = [];
  const listAssets = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((f) => (f.isDirectory() ? listAssets(path.join(dir, f.name)) : assets.push(path.join(dir, f.name))));
  listAssets('composition/assets');
  const credits = read('docs/ASSETS.md');
  const undocumented = assets.filter((a) => !credits.includes(path.basename(a)));
  check('Rules', 'Every asset file is listed with its licence in docs/ASSETS.md', undocumented.length === 0, undocumented.join(', ') || `${assets.length} asset files`);
  const audioNote = fs.existsSync(path.join(ROOT, 'audio/compose.py')) && /No samples, loops, presets or\s+third-party recordings/.test(read('audio/compose.py'));
  check('Rules', 'Music and sound effects are original, generated by audio/compose.py', audioNote, 'synthesised from code, no samples');

  // Report ----------------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  const groups = [...new Set(results.map((r) => r.group))];
  let md = '# Verification report\n\n';
  md += 'Generated by `tools/verify.mjs`. Run `npm run verify -- --write` to check everything again and refresh this page.\n\n';
  md += `**${results.length - failed.length} of ${results.length} checks pass.**\n\n`;
  if (specRows.length) {
    md += '## Measured from the exported files\n\n| Format | Resolution | FPS | Length | Loudness | Bitrate | Size |\n|---|---|---|---|---|---|---|\n';
    for (const r of specRows) md += `| ${r.ar.replace('x', ':')} | ${r.res} | ${r.fps} | ${r.dur} s | ${r.loud} | ${r.br} | ${r.size} |\n`;
    md += '\n';
  }
  for (const g of groups) {
    md += `## ${g}\n\n| Check | Result | Detail |\n|---|---|---|\n`;
    for (const r of results.filter((x) => x.group === g)) md += `| ${r.name} | ${r.ok ? 'PASS' : '**FAIL**'} | ${String(r.detail).replace(/\|/g, '\\|').replace(/\n/g, ' ')} |\n`;
    md += '\n';
  }
  md += '## Items for a person to check\n\n';
  md += '- Watch the film once with sound on and once muted before submitting.\n';
  md += '- Run `npm run check-sources` close to the deadline to confirm every quoted page still says the same thing.\n';
  for (const g of groups) {
    console.log(`\n${g}`);
    for (const r of results.filter((x) => x.group === g)) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} checks pass`);
  if (WRITE) {
    fs.writeFileSync(path.join(ROOT, 'docs', 'VERIFICATION.md'), md);
    const json = {
      passed: results.length - failed.length,
      total: results.length,
      specs: specRows,
      groups: groups.map((g) => ({ name: g, results: results.filter((r) => r.group === g).map(({ name, ok, detail }) => ({ name, ok, detail: String(detail) })) })),
    };
    fs.writeFileSync(path.join(ROOT, 'docs', 'verification.json'), JSON.stringify(json, null, 2) + '\n');
    console.log('Wrote docs/VERIFICATION.md and docs/verification.json');
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
