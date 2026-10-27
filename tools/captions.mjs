// Build the subtitle files from content/script.json.
// Writes submission/redbelly-made-simple.en.srt and .en.vtt
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/script.json'), 'utf8'));

const pad = (n, w = 2) => String(n).padStart(w, '0');
function stamp(sec, sep) {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

export function srt(caps = script.captions) {
  return caps.map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`).join('\n');
}

export function vtt(caps = script.captions) {
  return 'WEBVTT\n\n' + caps.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(ROOT, 'submission');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'redbelly-made-simple.en.srt'), srt());
  fs.writeFileSync(path.join(out, 'redbelly-made-simple.en.vtt'), vtt());
  console.log(`Wrote ${script.captions.length} cues to submission/redbelly-made-simple.en.srt and .en.vtt`);
}
