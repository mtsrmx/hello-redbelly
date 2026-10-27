// Re-read every source page live and confirm each quoted sentence is still there.
// HTML pages are rendered in Chromium (several are built client-side); the RBA
// report is downloaded and read with pdftotext.
//
// Usage: node tools/check-sources.mjs [--write]   (--write saves docs/SOURCE-CHECK.md)
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { sources } = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/sources.json'), 'utf8'));

const norm = (s) => s
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐-–]/g, '-')
  .replace(/\s+/g, ' ').replace(/(\w)- (\w)/g, '$1-$2').trim();

async function pageText(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  } catch {
    // Some pages keep long-polling; the text is there once the DOM has settled.
  }
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(120);
  }
  const text = await page.evaluate(() => document.body.innerText);
  await page.close();
  return text;
}

function pdfText(url) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'src-'));
  const pdf = path.join(tmp, 'doc.pdf');
  const dl = spawnSync('curl', ['-sSfL', '--max-time', '180', '-o', pdf, url]);
  if (dl.status !== 0) throw new Error(`download failed: ${dl.stderr}`);
  const txt = spawnSync('pdftotext', ['-raw', pdf, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (txt.status !== 0) throw new Error('pdftotext is needed to read the RBA report (poppler-utils)');
  return txt.stdout;
}

const browser = await chromium.launch();
let missing = 0;
const rows = [];
for (const s of sources) {
  let text = '';
  try {
    text = norm(s.pdf ? pdfText(s.url) : await pageText(browser, s.url));
  } catch (e) {
    console.log(`ERROR ${s.id}: ${e.message}`);
    missing += s.quotes.length;
    rows.push({ s, found: 0, absent: s.quotes });
    continue;
  }
  const absent = s.quotes.filter((q) => !text.includes(norm(q)));
  missing += absent.length;
  rows.push({ s, found: s.quotes.length - absent.length, absent });
  console.log(`${absent.length ? 'MISS' : 'OK  '} ${s.id.padEnd(18)} ${s.quotes.length - absent.length}/${s.quotes.length} quotes  ${s.url}`);
  for (const q of absent) console.log(`       not found: "${q}"`);
}
await browser.close();
console.log(missing ? `\n${missing} quote(s) not found` : '\nEvery quote was found on its live source page.');
if (process.argv.includes('--write')) {
  const day = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Tokyo' });
  const total = rows.reduce((n, r) => n + r.s.quotes.length, 0);
  let md = `# Source check\n\nEvery quote in \`content/sources.json\` was looked up on its live page on ${day} with \`npm run check-sources\`. `;
  md += `${total - missing} of ${total} quotes were found word for word.\n\n| Source | Quotes found | Page |\n|---|---|---|\n`;
  for (const r of rows) md += `| ${r.s.title} | ${r.found}/${r.s.quotes.length} | ${r.s.url} |\n`;
  for (const r of rows) for (const q of r.absent) md += `\nNot found on ${r.s.url}: "${q}"\n`;
  fs.writeFileSync(path.join(ROOT, 'docs', 'SOURCE-CHECK.md'), md);
  console.log('Wrote docs/SOURCE-CHECK.md');
}
process.exit(missing ? 1 : 0);
