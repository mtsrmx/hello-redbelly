// Screenshots of the review site for the README (docs/screenshots/).
// Usage: node tools/screenshots.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch();

async function shoot(name, { width, height, scale = 1, section, full = false }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  // Hide the browser's player controls, whose loading spinner would otherwise sit on the poster.
  await page.evaluate(() => document.querySelectorAll('video').forEach((v) => v.removeAttribute('controls')));
  await page.waitForTimeout(400);
  if (section) {
    await page.addStyleTag({ content: '.top { position: static !important; }' });
    await page.evaluate(() => { const f = document.querySelectorAll('.fact'); if (f[3]) f[3].open = true; });
    const el = page.locator(section);
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await el.screenshot({ path: path.join(OUT, `${name}.png`) });
  } else {
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
  }
  await page.close();
  console.log(`docs/screenshots/${name}.png`);
}

await shoot('home', { width: 1440, height: 1000 });
await shoot('story', { width: 1440, height: 1000, section: '#story' });
await shoot('fact-check', { width: 1440, height: 1000, section: '#facts' });
await shoot('checks', { width: 1440, height: 1000, section: '#checks' });
await shoot('mobile', { width: 390, height: 844, scale: 2 });
await browser.close();
server.close();
