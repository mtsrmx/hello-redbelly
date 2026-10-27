// Render still frames for review.
// Usage: node tools/stills.mjs [--ar 9x16] [--out build/stills] t1 t2 ...
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './serve.mjs';

const args = process.argv.slice(2);
let ar = '16x9';
let out = 'build/stills';
const times = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--ar') ar = args[++i];
  else if (args[i] === '--out') out = args[++i];
  else times.push(Number(args[i]));
}
if (!times.length) for (let t = 0.5; t < 82.5; t += 2.5) times.push(Math.round(t * 100) / 100);

const portrait = ar === '9x16';
const W = portrait ? 1080 : 1920;
const H = portrait ? 1920 : 1080;
fs.mkdirSync(out, { recursive: true });
const server = await startServer(0);
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/composition/index.html?render=1${portrait ? '&ar=9x16' : ''}`);
await page.waitForFunction(() => document.documentElement.dataset.ready || document.documentElement.dataset.error, null, { timeout: 60000 });
const err = await page.evaluate(() => document.documentElement.dataset.error);
if (err) { console.error(err); process.exit(1); }
for (const t of times) {
  await page.evaluate((tt) => window.__composition.seek(tt), t);
  const file = path.join(out, `${ar}-${String(t.toFixed(2)).padStart(6, '0')}.png`);
  await page.screenshot({ path: file });
  console.log(file);
}
if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
await browser.close();
server.close();
