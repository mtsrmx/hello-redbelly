// Render the composition to a finished MP4: every frame is drawn in headless
// Chromium at an exact time, captured losslessly, then encoded once with the
// loudness-normalised soundtrack.
//
// Usage: node tools/render.mjs [--ar 16x9|9x16] [--fps 30] [--workers 3] [--crf 18]
//                              [--from 0] [--to 85] [--out file.mp4]
//        node tools/render.mjs --ar 16x9 --audio-only   # put a new mix into the finished MP4
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/script.json'), 'utf8'));

const opt = { ar: '16x9', fps: 30, workers: 3, crf: 20, from: 0, to: script.duration, out: null, preset: 'slow' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i].replace(/^--/, '');
  if (k === 'audio-only') opt.audioOnly = true;
  else if (k in opt) opt[k] = typeof opt[k] === 'number' ? Number(argv[++i]) : argv[++i];
}
const portrait = opt.ar === '9x16';
const W = portrait ? 1080 : 1920;
const H = portrait ? 1920 : 1080;
const BUILD = path.join(ROOT, 'build');
const TMP = path.join(BUILD, `frames-${opt.ar}`);
fs.mkdirSync(TMP, { recursive: true });
const out = opt.out || path.join(ROOT, 'submission', `redbelly-made-simple-${opt.ar}.mp4`);

function run(cmd, args, { input, capture } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let err = '';
    let so = '';
    p.stderr.on('data', (d) => { err += d; });
    p.stdout.on('data', (d) => { so += d; });
    p.on('close', (code) => (code === 0 ? resolve(capture ? err : so) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`))));
    if (input) input(p);
  });
}

// Two-pass EBU R128 normalisation to -14 LUFS, true peak -1.5 dBTP.
async function loudnorm(src, dst) {
  const target = 'I=-14:TP=-1.5:LRA=11';
  const log = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], { capture: true });
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const second = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run('ffmpeg', ['-hide_banner', '-y', '-i', src, '-af', second, '-ar', '48000', '-c:a', 'pcm_s24le', dst]);
  return m;
}

async function renderChunk(port, wi, a, b, textLog) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/composition/index.html?render=1${portrait ? '&ar=9x16' : ''}`);
  await page.waitForFunction(() => document.documentElement.dataset.ready || document.documentElement.dataset.error, null, { timeout: 120000 });
  const bootErr = await page.evaluate(() => document.documentElement.dataset.error);
  if (bootErr) throw new Error(bootErr);
  const cdp = await page.context().newCDPSession(page);
  const file = path.join(TMP, `chunk-${String(wi).padStart(2, '0')}.mkv`);
  const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(opt.fps), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264rgb', '-preset', 'ultrafast', '-qp', '0', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => { ffErr += d; });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(ffErr)))));
  const textEvery = Math.max(1, Math.round(opt.fps / 4));
  for (let i = a; i < b; i++) {
    const t = i / opt.fps;
    await page.evaluate((tt) => window.__composition.seek(tt), t);
    if (i % textEvery === 0) textLog.push({ t: Math.round(t * 1000) / 1000, text: await page.evaluate(() => window.__composition.text()) });
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    if (!ff.stdin.write(Buffer.from(data, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
    if ((i - a) % 150 === 0) console.log(`  worker ${wi}: frame ${i - a + 1}/${b - a}`);
  }
  ff.stdin.end();
  await done;
  await browser.close();
  if (errors.length) throw new Error('Page errors:\n' + errors.join('\n'));
  return file;
}

// Soundtrack: synthesise if missing, then normalise loudness. Also writes the
// same mix, compressed, for the live in-browser player.
async function soundtrack() {
  const wav = path.join(BUILD, 'audio', 'soundtrack.wav');
  if (!fs.existsSync(wav)) await run(process.env.PYTHON || 'python3', [path.join(ROOT, 'audio', 'compose.py')]);
  const normWav = path.join(BUILD, 'audio', 'soundtrack-normalised.wav');
  const m = await loudnorm(wav, normWav);
  console.log(`Soundtrack measured ${m.input_i} LUFS, normalised to -14 LUFS`);
  const liveAudio = path.join(ROOT, 'composition', 'assets', 'audio', 'soundtrack.m4a');
  fs.mkdirSync(path.dirname(liveAudio), { recursive: true });
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', normWav, '-c:a', 'aac', '-b:a', '160k', '-map_metadata', '-1', '-movflags', '+faststart', liveAudio]);
  return normWav;
}

const AUDIO_OUT = ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
  '-map_metadata', '-1', '-metadata', `title=${script.title}`, '-metadata:s:a:0', 'language=eng'];

// Swap the soundtrack of a finished film without touching its pictures.
async function remuxAudio() {
  if (!fs.existsSync(out)) throw new Error(`${path.relative(ROOT, out)} does not exist yet; render it first`);
  const normWav = await soundtrack();
  const tmp = out.replace(/\.mp4$/, '.remux.mp4');
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', out, '-i', normWav,
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', ...AUDIO_OUT, '-movflags', '+faststart', '-shortest', tmp]);
  fs.renameSync(tmp, out);
  console.log(`Put the new soundtrack into ${path.relative(ROOT, out)}`);
}

async function main() {
  const t0 = Date.now();
  if (opt.audioOnly) return remuxAudio();
  const first = Math.round(opt.from * opt.fps);
  const last = Math.round(opt.to * opt.fps);
  const total = last - first;
  console.log(`Rendering ${opt.ar} ${W}x${H} @ ${opt.fps} fps: ${total} frames with ${opt.workers} workers`);

  const normWav = await soundtrack();

  const server = await startServer(0);
  const port = server.address().port;
  const per = Math.ceil(total / opt.workers);
  const logs = [];
  const jobs = [];
  for (let w = 0; w < opt.workers; w++) {
    const a = first + w * per;
    const b = Math.min(last, a + per);
    if (a >= b) continue;
    const log = [];
    logs.push(log);
    jobs.push(renderChunk(port, w, a, b, log));
  }
  const chunks = await Promise.all(jobs);
  server.close();
  console.log(`Frames captured in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

  const list = path.join(TMP, 'chunks.txt');
  fs.writeFileSync(list, chunks.map((c) => `file '${c}'`).join('\n') + '\n');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const gop = String(opt.fps * 2);
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-ss', String(opt.from), '-t', String((last - first) / opt.fps), '-i', normWav,
    '-map', '0:v', '-map', '1:a',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p',
    '-c:v', 'libx264', '-preset', opt.preset, '-crf', String(opt.crf), '-profile:v', 'high', '-level:v', opt.fps > 30 ? '4.2' : '4.1',
    '-g', gop, '-keyint_min', gop, '-bf', '2', '-x264-params', 'aq-mode=3:deblock=-1,-1',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    ...AUDIO_OUT, '-movflags', '+faststart', '-shortest', out]);

  const textFile = path.join(BUILD, `onscreen-text-${opt.ar}.json`);
  fs.writeFileSync(textFile, JSON.stringify(logs.flat().sort((x, y) => x.t - y.t), null, 1));
  console.log(`Wrote ${path.relative(ROOT, out)} and ${path.relative(ROOT, textFile)} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main().catch((e) => { console.error(e); process.exit(1); });
