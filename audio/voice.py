#!/usr/bin/env python3
"""Narration for "Redbelly, where it matters".

The voice reads the film's own subtitles from content/script.json, so what you
hear, what you read and what the fact check covers are the same words. Where a
subtitle is written differently from how it is said ("CSIRO", "redbelly.network")
the caption carries a "say" field.

Voice: Chatterbox by Resemble AI (MIT licence), its built-in default voice, run
locally. No real person's voice is cloned. Chatterbox marks its output with an
inaudible watermark that identifies it as synthetic speech.

For each line the script records several takes, trims the silence, transcribes
every take with Whisper and keeps the take that says every word and fits the
time the subtitle is on screen. Lines that run into the next subtitle are
tightened with Rubber Band time-stretching (pitch and formants preserved).

    python audio/voice.py              # writes audio/voice/line-NN.flac and lines.json
    python audio/voice.py --only 4 12  # re-record some lines, keep the rest

Requires the packages in audio/voice-requirements.txt (Python 3.11, CPU is fine).
"""
import argparse
import difflib
import json
import pathlib
import re
import subprocess
import tempfile

import numpy as np
import soundfile as sf
import torch
from scipy.signal import resample_poly

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = json.loads((ROOT / 'content' / 'script.json').read_text())
OUT = ROOT / 'audio' / 'voice'
TAKES = ROOT / 'build' / 'voice-takes'

MODEL = 'ResembleAI/chatterbox'
SETTINGS = dict(exaggeration=0.55, cfg_weight=0.45, temperature=0.7)
SEED = 100
LEAD = 0.05       # voice starts this long after its subtitle appears
GAP = 0.12        # shortest breath between two lines
OVERHANG = 0.25   # a line may run this far into the next subtitle
LATE = 0.45       # latest start after its subtitle appears
MAX_TEMPO = 1.12  # most a take may be tightened
END_PAD = 0.6     # quiet time left before the film ends
MIN_SCORE = 0.97  # share of words Whisper must hear in the right order

NUMBERS = {'1': 'one', '2': 'two', '3': 'three'}


def words(text):
    """Comparable word list: lower case, no punctuation, CSIRO and Redbelly joined."""
    t = text.lower().replace('\n', ' ')
    t = re.sub(r'\bc\.?\s?s\.?\s?i\.?\s?r\.?\s?o\b\.?', 'csiro', t)
    t = re.sub(r'\bred\s+belly\b', 'redbelly', t)
    t = re.sub(r"[’']", '', t)
    t = re.sub(r'[^a-z0-9]+', ' ', t)
    out = [NUMBERS.get(w, w) for w in t.split()]
    return [w for w in out if w != 'dot']


def score(expected, heard):
    return difflib.SequenceMatcher(None, words(expected), words(heard)).ratio()


def units():
    """Group subtitles into spoken lines: a subtitle that does not end a sentence
    is said together with the next one, so the sentence keeps its melody."""
    caps = SCRIPT['captions']
    groups, cur = [], []
    for i, c in enumerate(caps):
        cur.append(i)
        if re.search(r'[.?!:]\s*$', c['text']) or i == len(caps) - 1:
            groups.append(cur)
            cur = []
    out = []
    for n, g in enumerate(groups):
        say = ' '.join(caps[i].get('say', caps[i]['text']).replace('\n', ' ') for i in g)
        nxt = caps[groups[n + 1][0]]['start'] if n + 1 < len(groups) else SCRIPT['duration'] - END_PAD + OVERHANG
        out.append(dict(captions=g, start=caps[g[0]]['start'], until=nxt, say=say,
                        text=' '.join(caps[i]['text'].replace('\n', ' ') for i in g)))
    return out


def trim(x, sr, floor_db=-42, pad=0.03):
    env = np.convolve(np.abs(x), np.ones(int(0.01 * sr)) / int(0.01 * sr), mode='same')
    on = np.where(env > np.max(env) * 10 ** (floor_db / 20))[0]
    if not len(on):
        return x
    a = max(0, on[0] - int(pad * sr))
    b = min(len(x), on[-1] + int(pad * 2 * sr))
    y = x[a:b].copy()
    f = int(0.008 * sr)
    y[:f] *= np.linspace(0, 1, f)
    y[-f * 3:] *= np.linspace(1, 0, f * 3)
    return y


def stretch(x, sr, tempo):
    with tempfile.TemporaryDirectory() as d:
        src, dst = pathlib.Path(d, 'a.wav'), pathlib.Path(d, 'b.wav')
        sf.write(src, x, sr, subtype='FLOAT')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-af',
                        f'rubberband=tempo={tempo:.4f}:pitchq=quality:formant=preserved:transients=smooth',
                        '-c:a', 'pcm_f32le', str(dst)], check=True)
        y, _ = sf.read(dst, dtype='float32')
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--takes', type=int, default=2)
    ap.add_argument('--only', type=int, nargs='*', help='line numbers to re-record')
    a = ap.parse_args()

    from chatterbox.tts import ChatterboxTTS
    from faster_whisper import WhisperModel
    torch.set_num_threads(max(1, torch.get_num_threads()))
    tts = ChatterboxTTS.from_pretrained('cpu')
    asr = WhisperModel('small.en', device='cpu', compute_type='int8')
    sr = tts.sr

    OUT.mkdir(parents=True, exist_ok=True)
    TAKES.mkdir(parents=True, exist_ok=True)
    old = {}
    if (OUT / 'lines.json').exists():
        old = {l['n']: l for l in json.loads((OUT / 'lines.json').read_text())['lines']}

    def heard(x):
        x16 = resample_poly(x, 16000, sr).astype(np.float32)
        segs, _ = asr.transcribe(x16, beam_size=5, language='en')
        return ' '.join(s.text.strip() for s in segs)

    lines, prev_end = [], 0.0
    for n, u in enumerate(units()):
        start = max(u['start'] + LEAD, prev_end + GAP)
        room = u['until'] + OVERHANG - start
        keep = a.only is not None and n not in a.only and n in old and (OUT / old[n]['file']).exists()
        if keep:
            line = old[n]
            x, _ = sf.read(OUT / line['file'], dtype='float32')
        else:
            takes = []
            for k in range(a.takes + 3):
                if k >= a.takes and any(t['fits'] and t['score'] >= MIN_SCORE for t in takes):
                    break
                seed = SEED + n * 10 + k
                torch.manual_seed(seed)
                x = tts.generate(u['say'], **SETTINGS).squeeze(0).numpy()
                x = trim(x, sr)
                h = heard(x)
                d = len(x) / sr
                t = dict(seed=seed, x=x, heard=h, score=round(score(u['say'], h), 3), dur=round(d, 3),
                         fits=d <= room * MAX_TEMPO)
                sf.write(TAKES / f'line-{n:02d}-take-{k}.flac', x, sr, subtype='PCM_24')
                takes.append(t)
                print(f'line {n:2d} take {k}: {d:5.2f} s (room {room:4.2f}) score {t["score"]:.3f}  "{h}"', flush=True)
            good = [t for t in takes if t['score'] >= MIN_SCORE] or takes
            best = sorted(good, key=lambda t: (not t['fits'], -t['score'], abs(t['dur'] - min(room, t['dur']))))[0]
            x, tempo = best['x'], 1.0
            if len(x) / sr > room:
                tempo = min(MAX_TEMPO, (len(x) / sr) / room)
                x = stretch(x, sr, tempo)
                best['heard'] = heard(x)
                best['score'] = round(score(u['say'], best['heard']), 3)
            line = dict(n=n, captions=u['captions'], text=u['text'], say=u['say'], seed=best['seed'],
                        tempo=round(tempo, 3), heard=best['heard'], score=best['score'], file=f'line-{n:02d}.flac')
            sf.write(OUT / line['file'], x, sr, subtype='PCM_24')
        d = len(x) / sr
        line.update(start=round(start, 3), end=round(start + d, 3), duration=round(d, 3),
                    caption_start=u['start'], next_caption=round(u['until'], 3))
        lines.append(line)
        prev_end = start + d
        ok = line['end'] <= u['until'] + OVERHANG + 1e-6 and line['start'] - u['start'] <= LATE and line['score'] >= MIN_SCORE
        flag = '' if ok else '  << check'
        print(f'line {n:2d}: {line["start"]:6.2f}-{line["end"]:6.2f}  tempo {line["tempo"]:.3f}  score {line["score"]:.3f}  {u["say"]}{flag}', flush=True)

    meta = dict(model=MODEL, voice='Chatterbox built-in default voice (no cloning)', licence='MIT',
                source='https://huggingface.co/ResembleAI/chatterbox', settings=SETTINGS, sample_rate=sr,
                asr='faster-whisper small.en', rules=dict(lead=LEAD, gap=GAP, overhang=OVERHANG, late=LATE,
                                                          max_tempo=MAX_TEMPO, min_score=MIN_SCORE), lines=lines)
    (OUT / 'lines.json').write_text(json.dumps(meta, indent=2) + '\n')
    print(f'Wrote {len(lines)} lines to {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
