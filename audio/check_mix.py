#!/usr/bin/env python3
"""Listen to the finished films and confirm the narration is understood over the music.

Whisper transcribes the soundtrack of each exported MP4. Every narration line
from audio/voice/lines.json is compared with the words heard while it plays.
The result, with a hash of each file checked, goes to audio/voice/mix-check.json,
which tools/verify.mjs reads.

    python audio/check_mix.py

Uses the same environment as audio/voice.py (audio/voice-requirements.txt).
"""
import hashlib
import json
import pathlib
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'audio'))
from voice import score  # noqa: E402

LINES = json.loads((ROOT / 'audio' / 'voice' / 'lines.json').read_text())['lines']
SLACK = 0.3


def audio16k(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype='<f4').copy()


def main():
    model = WhisperModel('small.en', device='cpu', compute_type='int8')
    out = dict(asr='faster-whisper small.en', slack=SLACK, files={})
    for ar in ('16x9', '9x16'):
        f = ROOT / 'submission' / f'redbelly-made-simple-{ar}.mp4'
        segs, _ = model.transcribe(audio16k(f), beam_size=5, language='en', word_timestamps=True)
        words = [w for s in segs for w in s.words]
        # Each heard word belongs to the line it falls in, or the nearest one within SLACK.
        owner = []
        for w in words:
            mid = (w.start + w.end) / 2
            gaps = [max(line['start'] - mid, mid - line['end'], 0) for line in LINES]
            k = int(np.argmin(gaps))
            owner.append(k if gaps[k] <= SLACK else None)
        rows = []
        for k, line in enumerate(LINES):
            said = ' '.join(w.word.strip() for w, o in zip(words, owner) if o == k)
            rows.append(dict(n=line['n'], say=line['say'], heard=said, score=round(score(line['say'], said), 3)))
            print(f'{ar} line {line["n"]:2d} {rows[-1]["score"]:.3f}  "{said}"', flush=True)
        out['files'][ar] = dict(file=str(f.relative_to(ROOT)), sha256=hashlib.sha256(f.read_bytes()).hexdigest(), lines=rows)
    (ROOT / 'audio' / 'voice' / 'mix-check.json').write_text(json.dumps(out, indent=2) + '\n')
    print('Wrote audio/voice/mix-check.json')


if __name__ == '__main__':
    main()
