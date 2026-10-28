#!/usr/bin/env python3
"""Original score, sound design and final mix for "Redbelly, where it matters".

The music and every sound effect are synthesised by this script from sine
waves, band-limited saw waves and filtered noise. No samples, loops, presets or
third-party recordings are used, so there is nothing to license.

The narration is recorded by audio/voice.py (Chatterbox, MIT licence) into
audio/voice/. This script places each line where audio/voice/lines.json says,
and the music and effects duck under the voice while it speaks.

Timing comes from content/script.json: scene starts, the tempo and every
sound-effect cue, so the music and effects land on the animation.

    python3 audio/compose.py              # writes build/audio/soundtrack.wav
    python3 audio/compose.py --stems      # also writes music, effects and voice stems
    python3 audio/compose.py --no-voice   # music and effects only

Requires numpy and scipy (see audio/requirements.txt) and ffmpeg.
"""
import argparse
import json
import pathlib
import subprocess
import wave

import numpy as np
from scipy import ndimage, signal

SR = 48000
ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = json.loads((ROOT / 'content' / 'script.json').read_text())
DUR = float(SCRIPT['duration'])
BPM = float(SCRIPT['tempo']['bpm'])
BEAT = 60.0 / BPM
BAR = BEAT * 4
N = int(round(DUR * SR))
SCENE = {s['id']: s for s in SCRIPT['scenes']}
RNG = np.random.default_rng(20261027)


# ---------------------------------------------------------------------------
# Small DSP toolkit

def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def saw(freq, n, phase=0.0):
    """Band-limited sawtooth (polyBLEP)."""
    dt = freq / SR
    ph = (phase + dt * np.arange(n)) % 1.0
    y = 2.0 * ph - 1.0
    m = ph < dt
    x = ph[m] / dt
    y[m] -= x + x - x * x - 1.0
    m = ph > 1.0 - dt
    x = (ph[m] - 1.0) / dt
    y[m] -= x * x + x + x + 1.0
    return y


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), 'low')
    return signal.lfilter(b, a, x)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR * 0.45) / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def sweep_bp(x, f0, f1, q=1.2, block=256, curve=1.0):
    """Band-pass whose centre glides from f0 to f1 (processed in short blocks)."""
    y = np.zeros_like(x)
    zi = None
    nb = int(np.ceil(len(x) / block))
    for i in range(nb):
        u = (i / max(1, nb - 1)) ** curve
        fc = f0 * (f1 / f0) ** u
        lo = max(30.0, fc / (1 + 1 / q))
        hi = min(SR * 0.45, fc * (1 + 1 / q))
        b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band')
        seg = x[i * block:(i + 1) * block]
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        out, zi = signal.lfilter(b, a, seg, zi=zi)
        y[i * block:(i + 1) * block] = out
    return y


def env_adsr(n, a=0.01, d=0.1, s=0.8, r=0.2, hold=None):
    """Attack-decay-sustain-release envelope; `hold` is the note length in seconds."""
    t = tt(n)
    hold = (n / SR - r) if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t > hold
    level = np.interp(hold, t, e) if n else 0
    e[rel] = level * np.exp(-(t[rel] - hold) / max(r / 4, 1e-6))
    return e


def noise(n):
    return RNG.standard_normal(n)


def pan(x, p):
    """Constant-power pan, p in [-1, 1]."""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)])


class Track:
    """A stereo buffer you can drop sounds into at a time in seconds."""

    def __init__(self, n=N):
        self.buf = np.zeros((2, n))

    def add(self, t, x, gain=1.0, p=0.0):
        i = int(round(t * SR))
        if x.ndim == 1:
            x = pan(x, p)
        if i < 0:
            x = x[:, -i:]
            i = 0
        j = min(self.buf.shape[1], i + x.shape[1])
        if j > i:
            self.buf[:, i:j] += gain * x[:, : j - i]


def reverb_ir(seconds=2.2, rt60=1.7, damp=5200, seed=3):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = tt(n)
    decay = np.exp(-6.91 * t / rt60)
    ir = np.stack([r.standard_normal(n), r.standard_normal(n)]) * decay
    ir = np.stack([lp(ch, damp) for ch in ir])
    for k, (dt_, g) in enumerate([(0.011, 0.5), (0.019, 0.38), (0.027, 0.3), (0.041, 0.22)]):
        idx = int(dt_ * SR)
        ir[k % 2, idx] += g * 6
    ir[:, : int(0.006 * SR)] *= np.linspace(0, 1, int(0.006 * SR))
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


IR = reverb_ir()


def reverb(st, wet=0.2):
    out = np.stack([signal.fftconvolve(st[0], IR[0])[: st.shape[1]], signal.fftconvolve(st[1], IR[1])[: st.shape[1]]])
    return st + wet * out


def pingpong(st, delay, fb=0.35, wet=0.25, taps=5, damp=4200):
    out = np.zeros_like(st)
    d = int(delay * SR)
    src = lp(st[0] + st[1], damp) * 0.5
    g = 1.0
    for k in range(1, taps + 1):
        g *= fb if k > 1 else 1.0
        ch = k % 2
        if d * k < st.shape[1]:
            out[ch, d * k:] += g * src[: st.shape[1] - d * k]
        src = lp(src, damp)
    return st + wet * out


# ---------------------------------------------------------------------------
# Instruments

def pad_note(m, dur, rel=1.4, att=0.7, bright=1600):
    n = int((dur + rel) * SR)
    f = midi(m)
    out = np.zeros((2, n))
    for cents, p in [(-11, -0.8), (-4, -0.3), (4, 0.3), (11, 0.8)]:
        v = saw(f * 2 ** (cents / 1200), n, phase=RNG.random())
        out += pan(v, p)
    out += pan(np.sin(2 * np.pi * f / 2 * tt(n)), 0) * 0.25
    out = np.stack([hp(lp(lp(ch, bright), bright * 1.6), 150) for ch in out])
    e = env_adsr(n, a=att, d=0.6, s=0.82, r=rel, hold=dur)
    return out * e / 4


def pluck(m, dur=0.9, bright=2.4, decay=0.32):
    n = int(dur * SR)
    t = tt(n)
    f = midi(m)
    idx = bright * np.exp(-t / 0.08)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * 2 * f * t))
    y += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.12)
    e = (1 - np.exp(-t / 0.0015)) * np.exp(-t / decay)
    return y * e


def keys_note(m, dur=2.2):
    """Soft electric-piano style note for the reflective section."""
    n = int(dur * SR)
    t = tt(n)
    f = midi(m)
    idx = 1.2 * np.exp(-t / 0.35)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    y += 0.18 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.05)
    e = (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.9)
    return y * e


def bass_note(m, dur, sustain=0.7):
    n = int((dur + 0.06) * SR)
    t = tt(n)
    f = midi(m)
    y = np.sin(2 * np.pi * f * t) + 0.22 * np.sin(2 * np.pi * 2 * f * t + 0.4)
    y = np.tanh(1.8 * y) / np.tanh(1.8)
    e = env_adsr(n, a=0.006, d=0.18, s=sustain, r=0.08, hold=dur)
    return lp(y * e, 900)


def kick():
    n = int(0.5 * SR)
    t = tt(n)
    f = 46 + 120 * np.exp(-t / 0.032)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.3)
    click = hp(noise(n), 2500) * np.exp(-t / 0.003) * 0.25
    return np.tanh(1.4 * (y + click)) / np.tanh(1.4)


def clap():
    n = int(0.4 * SR)
    t = tt(n)
    e = np.zeros(n)
    for k, dt_ in enumerate([0.0, 0.011, 0.022]):
        e += (t >= dt_) * np.exp(-np.clip(t - dt_, 0, None) / 0.006) * (0.8 if k < 2 else 1.0)
    e += (t >= 0.022) * np.exp(-np.clip(t - 0.022, 0, None) / 0.11) * 0.45
    return bp(noise(n), 900, 4200) * e


def rim():
    n = int(0.12 * SR)
    t = tt(n)
    y = np.sin(2 * np.pi * 1700 * t) * np.exp(-t / 0.012) + bp(noise(n), 2000, 6000) * np.exp(-t / 0.006) * 0.6
    return y


def hat(open_=False):
    n = int((0.32 if open_ else 0.07) * SR)
    t = tt(n)
    y = hp(noise(n), 7200, 3) * np.exp(-t / (0.11 if open_ else 0.018))
    return y


def shaker():
    n = int(0.09 * SR)
    t = tt(n)
    e = (1 - np.exp(-t / 0.012)) * np.exp(-t / 0.035)
    return bp(noise(n), 5000, 11000) * e


def crash(dur=2.4):
    n = int(dur * SR)
    t = tt(n)
    y = hp(noise(n), 3800, 2) * np.exp(-t / 0.9)
    y += bp(noise(n), 6000, 12000) * np.exp(-t / 0.35) * 0.5
    return y


# ---------------------------------------------------------------------------
# Sound effects (one function per cue type in the script)

def fx_tap():
    n = int(0.06 * SR)
    t = tt(n)
    return np.sin(2 * np.pi * 1450 * t) * np.exp(-t / 0.012) * 0.7 + bp(noise(n), 2500, 7000) * np.exp(-t / 0.004) * 0.5


def fx_whoosh(dur=0.5, f0=350, f1=4200):
    n = int(dur * SR)
    t = tt(n)
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.6
    y = sweep_bp(noise(n), f0, f1, q=1.4) * shape
    return y * 1.6


def fx_success():
    out = np.zeros(int(1.4 * SR))
    for dt_, m in [(0.0, 88), (0.11, 93)]:  # E6 then A6
        n = int(1.2 * SR)
        t = tt(n)
        f = midi(m)
        y = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.45) + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.18)
             + 0.12 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t / 0.08))
        y *= 1 - np.exp(-t / 0.002)
        i = int(dt_ * SR)
        out[i:i + n] += y[: len(out) - i]
    return out * 0.55


def fx_flip():
    n = int(0.12 * SR)
    t = tt(n)
    e = np.exp(-t / 0.012) + 0.7 * (t > 0.028) * np.exp(-np.clip(t - 0.028, 0, None) / 0.016)
    return bp(noise(n), 1800, 7000) * e * 0.9


def fx_stamp():
    n = int(0.35 * SR)
    t = tt(n)
    thud = np.sin(2 * np.pi * np.cumsum(70 + 80 * np.exp(-t / 0.02)) / SR) * np.exp(-t / 0.11)
    slap = bp(noise(n), 350, 2400) * np.exp(-t / 0.035)
    return np.tanh(1.5 * (thud + 0.8 * slap))


def fx_riser(dur=2.5):
    n = int(dur * SR)
    t = tt(n)
    u = t / dur
    y = sweep_bp(noise(n), 250, 7500, q=2.0, curve=1.4) * (u ** 2.2) * 1.4
    f = 110 * 2 ** (2.0 * u ** 1.6)
    s_ = np.sin(2 * np.pi * np.cumsum(f) / SR) * (u ** 2.5) * 0.25
    return y + lp(s_, 1800)


def fx_zip():
    return fx_whoosh(0.28, 600, 9000) * 0.8


def fx_impact():
    n = int(3.2 * SR)
    t = tt(n)
    boom = np.sin(2 * np.pi * np.cumsum(30 + 34 * np.exp(-t / 0.35)) / SR) * np.exp(-t / 1.1)
    hit = lp(noise(n), 2600) * np.exp(-t / 0.18) * 0.5
    shimmer = np.zeros(n)
    for m, g in [(84, 0.25), (88, 0.2), (91, 0.18), (96, 0.12)]:  # C6 E6 G6 C7
        shimmer += g * np.sin(2 * np.pi * midi(m) * t) * np.exp(-t / 1.6) * (1 - np.exp(-t / 0.01))
    return np.tanh(1.2 * (boom * 1.1 + hit)) + shimmer * 0.5


def fx_swell(dur=1.4):
    n = int(dur * SR)
    t = tt(n)
    u = t / dur
    e = np.sin(np.pi * u) ** 2
    y = sweep_bp(noise(n), 400, 2400, q=3.0) * e
    for m in (64, 67, 72):
        y += 0.18 * np.sin(2 * np.pi * midi(m) * t) * e
    return y * 0.7


def fx_pop(k=0):
    notes = [72, 74, 76, 79, 81]
    f0 = midi(notes[k % len(notes)])
    n = int(0.18 * SR)
    t = tt(n)
    f = f0 * (1 + 0.9 * np.exp(-t / 0.012))
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.06) * (1 - np.exp(-t / 0.001))
    return y * 0.8


def fx_scan(dur=0.9):
    n = int(dur * SR)
    t = tt(n)
    u = t / dur
    f = 700 * 2 ** (1.2 * u)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * 18 * t)
    hiss = bp(noise(n), 3000, 9000) * 0.25
    return (tone + hiss) * trem * np.sin(np.pi * u) ** 0.8


def fx_tick(k=0):
    n = int(0.08 * SR)
    t = tt(n)
    f = [1900, 2150, 2400][k % 3]
    return np.sin(2 * np.pi * f * t) * np.exp(-t / 0.015) * 0.6 + bp(noise(n), 4000, 9000) * np.exp(-t / 0.003) * 0.3


def fx_lock():
    n = int(0.3 * SR)
    t = tt(n)
    y = np.zeros(n)
    for dt_ in (0.0, 0.055):
        m = t >= dt_
        y[m] += bp(noise(m.sum()), 2500, 7500) * np.exp(-(t[m] - dt_) / 0.007)
    thunk = np.sin(2 * np.pi * 150 * t) * np.exp(-t / 0.06) * (t > 0.05)
    return y * 0.9 + thunk * 0.7


def fx_deny():
    out = np.zeros(int(0.32 * SR))
    for dt_, f in [(0.0, 233), (0.12, 185)]:
        n = int(0.14 * SR)
        t = tt(n)
        y = np.tanh(2.5 * np.sin(2 * np.pi * f * t)) * np.exp(-t / 0.06) * (1 - np.exp(-t / 0.002))
        i = int(dt_ * SR)
        out[i:i + n] += lp(y, 1600)[: len(out) - i]
    return out * 0.6


def fx_coin():
    n = int(1.0 * SR)
    t = tt(n)
    f = 1760
    y = sum(g * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, g, d in [(1, 0.6, 0.35), (2.76, 0.3, 0.16), (5.4, 0.15, 0.07), (8.93, 0.08, 0.04)])
    return y * (1 - np.exp(-t / 0.001)) * 0.7


def fx_slide():
    return fx_whoosh(0.32, 500, 3000) * 0.6


SFX = {
    'tap': (fx_tap, 0.55), 'whoosh': (fx_whoosh, 0.42), 'success': (fx_success, 0.5), 'flip': (fx_flip, 0.5),
    'stamp': (fx_stamp, 0.55), 'riser': (fx_riser, 0.38), 'zip': (fx_zip, 0.4), 'impact': (fx_impact, 0.8),
    'swell': (fx_swell, 0.35), 'pop': (fx_pop, 0.42), 'scan': (fx_scan, 0.3), 'tick': (fx_tick, 0.42),
    'lock': (fx_lock, 0.6), 'deny': (fx_deny, 0.5), 'coin': (fx_coin, 0.4), 'slide': (fx_slide, 0.5),
}


# ---------------------------------------------------------------------------
# Harmony and arrangement

CHORDS = {
    #       bass, pad voicing,          arpeggio notes
    'Am': (45, [57, 60, 64, 67], [69, 72, 76, 79]),
    'F': (41, [53, 57, 60, 64], [65, 69, 72, 76]),
    'C': (48, [55, 60, 62, 64], [67, 72, 74, 76]),
    'G': (43, [55, 59, 62, 67], [67, 71, 74, 79]),
    'Em': (40, [55, 59, 62, 64], [64, 67, 71, 74]),
    'Dm': (38, [53, 57, 60, 62], [62, 65, 69, 72]),
}

# One chord per bar (2.5 s). The hook sits in A minor; the reveal resolves to C.
PROGRESSION = (
    ['Am', 'Am', 'F', 'Dm']            # 0-10 s   hook
    + ['C', 'F']                       # 10-15 s  reveal
    + ['Am', 'F', 'C', 'G', 'Am', 'F']  # 15-30 s  what it is, how it works
    + ['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F', 'C']  # 30-52.5 s three ideas
    + ['F', 'G', 'Em', 'Am', 'F', 'G']  # 52.5-67.5 s why trust it
    + ['F', 'G', 'Am', 'G']            # 67.5-77.5 s why it matters
    + ['C', 'C', 'C', 'C']             # 77.5-85 s end card
)


def section(t):
    s = SCENE
    if t < s['reveal']['start']:
        return 'hook'
    if t < s['what']['start']:
        return 'reveal'
    if t < s['how']['start']:
        return 'what'
    if t < s['science']['start']:
        return 'how'
    if t < s['result']['start']:
        return 'trust'
    if t < s['end']['start']:
        return 'matters'
    return 'end'


BRIGHT = {'hook': 900, 'reveal': 1500, 'what': 1800, 'how': 2300, 'trust': 1500, 'matters': 2600, 'end': 2000}
PAD_GAIN = {'hook': 0.5, 'reveal': 0.62, 'what': 0.55, 'how': 0.46, 'trust': 0.62, 'matters': 0.5, 'end': 0.66}


def compose():
    pad, keys_, arp, bass, drums, fxt = Track(), Track(), Track(), Track(), Track(), Track()
    kicks = []
    bars = int(np.ceil(DUR / BAR))
    for b in range(bars):
        t0 = b * BAR
        name = PROGRESSION[min(b, len(PROGRESSION) - 1)]
        root, voicing, arpn = CHORDS[name]
        sec = section(t0 + 0.01)
        last = b == bars - 1

        # Pad
        dur = BAR + (0.0 if not last else 0.0)
        for m in voicing:
            pad.add(t0, pad_note(m, dur, bright=BRIGHT[sec], rel=1.6 if sec != 'end' else 2.2), PAD_GAIN[sec] * 0.55)

        # Bass
        if sec == 'hook':
            for beat in (0, 2):
                bass.add(t0 + beat * BEAT, bass_note(root - 12, BEAT * 0.6, 0.4), 0.45)
        elif sec == 'reveal':
            pass
        elif sec in ('what',):
            for beat in (0, 2):
                bass.add(t0 + beat * BEAT, bass_note(root - 12, BEAT * 1.8, 0.75), 0.55)
        elif sec in ('how', 'matters'):
            for k in range(8):
                bass.add(t0 + k * BEAT / 2, bass_note(root - 12, BEAT * 0.42, 0.6), 0.5 if k % 2 else 0.42)
        elif sec == 'trust':
            bass.add(t0, bass_note(root - 12, BAR * 0.95, 0.85), 0.45)
        elif sec == 'end' and b == int(SCENE['end']['start'] / BAR):
            bass.add(t0, bass_note(root - 12, BAR * 2.6, 0.9), 0.55)

        # Arpeggio and keys
        if sec == 'what' or (sec == 'reveal' and t0 + BAR > SCENE['what']['start']):
            pattern = [0, 1, 2, 3, 2, 1, 2, 3]
            for k, idx in enumerate(pattern):
                at = t0 + k * BEAT / 2
                if at >= SCENE['what']['start'] - 1e-6:
                    arp.add(at, pluck(arpn[idx], 0.8, 1.8, 0.28), 0.32 if k % 2 else 0.4, p=-0.25 if k % 2 else 0.25)
        elif sec == 'how':
            pattern = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2]
            for k, idx in enumerate(pattern):
                at = t0 + k * BEAT / 4
                up = 12 if k in (6, 14) else 0
                arp.add(at, pluck(arpn[idx] + up, 0.6, 2.2, 0.2), (0.36 if k % 4 == 0 else 0.24), p=0.3 * np.sin(k))
        elif sec == 'trust':
            for k, idx in enumerate([0, 2, 1, 3]):
                keys_.add(t0 + k * BEAT, keys_note(arpn[idx] - 12, 2.4), 0.3, p=-0.2 + 0.13 * k)
        elif sec == 'matters':
            pattern = [0, 1, 2, 3, 2, 3, 1, 2]
            for k, idx in enumerate(pattern):
                up = 12 if k in (3, 7) else 0
                arp.add(t0 + k * BEAT / 2, pluck(arpn[idx] + up, 0.8, 2.6, 0.26), 0.36, p=-0.3 if k % 2 else 0.3)
        elif sec == 'end' and b == int(SCENE['end']['start'] / BAR):
            for k, m in enumerate([72, 76, 79, 84]):
                arp.add(t0 + 0.2 + k * BEAT / 2, pluck(m, 2.2, 2.0, 0.7), 0.42, p=-0.3 + 0.2 * k)

        # Drums
        if sec == 'hook':
            for k in range(8):  # clock: tick, tock
                drums.add(t0 + k * BEAT / 2, fx_tick(0 if k % 2 == 0 else 2) * 0.7, 0.12, p=-0.35 if k % 2 else 0.35)
        elif sec == 'what' and t0 >= SCENE['what']['start'] - 0.01:
            for beat in (0, 2):
                drums.add(t0 + beat * BEAT, kick(), 0.6)
                kicks.append(t0 + beat * BEAT)
            drums.add(t0 + 2 * BEAT, clap(), 0.18)
            for k in range(8):
                if k % 2:
                    drums.add(t0 + k * BEAT / 2, hat(), 0.12, p=0.25)
            for k in range(16):
                drums.add(t0 + k * BEAT / 4, shaker(), 0.05 + 0.03 * (k % 2), p=-0.4)
        elif sec in ('how', 'matters'):
            for beat in range(4):
                drums.add(t0 + beat * BEAT, kick(), 0.72)
                kicks.append(t0 + beat * BEAT)
            for beat in (1, 3):
                drums.add(t0 + beat * BEAT, clap(), 0.3, p=0.05)
            for k in range(16):
                vel = 0.15 if k % 4 == 2 else 0.08
                drums.add(t0 + k * BEAT / 4, hat(), vel, p=0.3)
            if b % 2 == 1:
                drums.add(t0 + 3.5 * BEAT, hat(True), 0.12, p=0.3)
        elif sec == 'trust':
            for beat in (1, 3):
                drums.add(t0 + beat * BEAT, rim(), 0.16, p=-0.2)
            for k in range(8):
                drums.add(t0 + k * BEAT / 2, hat(), 0.06 + 0.03 * (k % 2), p=0.3)
            if t0 >= SCENE['result']['start'] - BAR - 0.01:  # build into "why it matters"
                for k in range(16):
                    drums.add(t0 + k * BEAT / 4, clap() * 0.6, 0.06 + 0.2 * (k / 16) ** 2, p=0.0)

    # Section crashes and transitions.
    for name in ('what', 'how', 'verified', 'rules', 'final', 'result'):
        drums.add(SCENE[name]['start'] if name != 'what' else SCENE['what']['start'] + 1.25, crash(), 0.18 if name in ('how', 'result') else 0.1, p=0.15)
    for c in SCRIPT['chapters'][1:]:
        fxt.add(c['start'] - 0.38, fx_whoosh(0.7, 250, 3600), 0.3, p=0.0)
    fxt.add(SCENE['result']['start'] - 2.5, fx_riser(2.5), 0.28)

    # Script cues.
    for sc in SCRIPT['scenes']:
        for cue in sc.get('sfx', []):
            fn, g = SFX[cue['type']]
            t = sc['start'] + cue['t']
            if cue['type'] == 'riser':
                x = fn(2.5)
                t -= 2.5
            elif cue['type'] in ('pop', 'tick'):
                x = fn(cue.get('n', 0))
            else:
                x = fn()
            fxt.add(t, x, g, p=cue.get('pan', 0.0))

    # Sidechain ducking from the kick.
    t = tt(N)
    duck = np.ones(N)
    for k in kicks:
        i = int(k * SR)
        j = min(N, i + int(0.3 * SR))
        dt_ = t[i:j] - k
        duck[i:j] = np.minimum(duck[i:j], 1 - 0.45 * np.exp(-dt_ / 0.09))

    music = (pad.buf * duck * 1.0 + keys_.buf * 1.0 + pingpong(arp.buf, BEAT * 0.75, fb=0.32, wet=0.28) * duck ** 0.5
             + bass.buf * duck ** 0.7 + drums.buf)
    music = reverb(music, 0.16)
    fx_bus = reverb(fxt.buf, 0.22)

    # Arrangement dynamics: quieter while waiting, lift at the reveal, breathe
    # in "why trust it", peak in "why it matters".
    S = SCENE
    curve_db = [
        (0.0, -5.0), (S['reveal']['start'], -3.0), (S['reveal']['start'] + 1.2, 0.0), (S['what']['start'], -2.5),
        (S['how']['start'] - 0.5, -2.0), (S['how']['start'], 0.0), (S['science']['start'] - 0.6, 0.0),
        (S['science']['start'] + 0.4, -4.0), (S['result']['start'] - 2.5, -4.0), (S['result']['start'], 0.8),
        (S['end']['start'], 0.8), (DUR, 0.0),
    ]
    ts, dbs = zip(*curve_db)
    music *= 10 ** (np.interp(tt(N), ts, dbs) / 20)

    # Gentle fade at the very end.
    tail = int(1.2 * SR)
    fade = np.ones(N)
    fade[-tail:] = np.linspace(1, 0, tail) ** 1.5
    music *= fade
    fx_bus *= fade
    return music, fx_bus


# ---------------------------------------------------------------------------
# Narration

VOICE_DIR = ROOT / 'audio' / 'voice'
VOICE_OVER_BED_DB = 11.0   # voice level above the ducked music under it
MUSIC_DUCK_DB = -9.0
FX_DUCK_DB = -4.0


def load_line(path):
    """Decode a narration line to mono float at the film's sample rate."""
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-af', 'aresample=resampler=soxr',
                          '-ar', str(SR), '-ac', '1', '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype='<f4').astype(np.float64)


def narration():
    """The voice track (mono) and a 0-1 envelope of where it speaks.

    Lines come from audio/voice.py and sit where lines.json places them. Each
    line is levelled to the same speech loudness, then the bus gets a high-pass,
    a little presence and gentle compression."""
    meta = json.loads((VOICE_DIR / 'lines.json').read_text())
    v = np.zeros(N)
    for line in meta['lines']:
        x = load_line(VOICE_DIR / line['file'])
        loud = np.abs(x) > np.max(np.abs(x)) * 0.03
        x = x / (np.sqrt(np.mean(x[loud] ** 2)) + 1e-9) * 0.1
        i = int(round(line['start'] * SR))
        j = min(N, i + len(x))
        v[i:j] += x[: j - i]
    v = hp(v, 90)
    v = v + 0.3 * bp(v, 2600, 6500)
    rms = np.sqrt(np.maximum(lp(v ** 2, 12), 0) + 1e-12)
    thr = 0.09
    v = v * np.where(rms > thr, (thr / rms) ** (1 - 1 / 3), 1.0)
    v = limit(v, 0.1 * 10 ** (10.5 / 20), look=0.002, release=0.06)
    # Speaking envelope: fast attack, slow release, so the bed dips and recovers smoothly.
    on = (lp(np.abs(v), 20) > 0.004).astype(float)
    act = np.zeros(N)
    up, down = 1 - np.exp(-1 / (0.04 * SR)), 1 - np.exp(-1 / (0.35 * SR))
    env = 0.0
    # One-pole follower, solved in closed form over each run of constant input.
    edges = np.flatnonzero(np.diff(np.r_[on[0] + 1, on]))
    edges = np.r_[edges, N]
    for a, b in zip(edges[:-1], edges[1:]):
        target = on[a]
        c = up if target else down
        n = np.arange(1, b - a + 1)
        act[a:b] = target + (env - target) * (1 - c) ** n
        env = act[b - 1]
    return v, act


def limit(x, ceiling, look=0.0015, release=0.08):
    """Look-ahead peak limiter. Peaks are found on a 4x oversampled copy, so the
    ceiling holds between samples too; gain falls before a peak and recovers
    exponentially after it."""
    st = np.atleast_2d(x)
    n = st.shape[1]
    det = np.abs(signal.resample_poly(st, 4, 1, axis=1)).max(axis=0)[: n * 4].reshape(n, 4).max(axis=1)
    g = np.minimum(1.0, ceiling / np.maximum(det, 1e-12))
    w = 2 * int(look * SR) + 1
    g = ndimage.uniform_filter1d(ndimage.minimum_filter1d(g, w), w)
    # Release: gain reduction decays exponentially (a running max of the reduction
    # with exponential forgetting, solved in the log domain).
    d = np.clip(1.0 - g, 0.0, 1.0)
    k = np.arange(n)
    lq = -1.0 / (release * SR)
    with np.errstate(divide='ignore'):
        r = np.exp(np.maximum.accumulate(np.log(d) - k * lq) + k * lq)
    out = st * (1.0 - np.maximum(r, d))
    return out if x.ndim == 2 else out[0]


# K-weighting filters from ITU-R BS.1770 at 48 kHz.
K_SHELF = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
K_HP = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def lufs(x):
    """Integrated loudness (ITU-R BS.1770-4, gated) of a stereo signal."""
    z = signal.lfilter(*K_HP, signal.lfilter(*K_SHELF, x, axis=1), axis=1) ** 2
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    starts = np.arange(0, x.shape[1] - blk + 1, hop)
    cs = np.concatenate([np.zeros((2, 1)), np.cumsum(z, axis=1)], axis=1)
    ms = ((cs[:, starts + blk] - cs[:, starts]) / blk).sum(axis=0)
    lk = -0.691 + 10 * np.log10(ms + 1e-20)
    ms = ms[lk > -70]
    rel = -0.691 + 10 * np.log10(ms.mean()) - 10
    ms = ms[-0.691 + 10 * np.log10(ms) > rel]
    return -0.691 + 10 * np.log10(ms.mean())


def finish(x, target=-14.0, ceiling_db=-2.5):
    """Final master: bus compression, then level to the target loudness under a
    true-peak ceiling, leaving room for the AAC encoder."""
    x = np.stack([hp(ch, 28) for ch in x])
    rms = np.sqrt(np.maximum(lp(np.mean(x ** 2, axis=0), 6), 0) + 1e-12)
    thr = 0.32
    x = x * np.where(rms > thr, (thr / rms) ** 0.25, 1.0)
    ceiling = 10 ** (ceiling_db / 20)
    gain_db = target - lufs(x)
    for _ in range(3):
        y = limit(x * 10 ** (gain_db / 20), ceiling)
        miss = target - lufs(y)
        if abs(miss) < 0.1:
            break
        gain_db += miss
    return y


def master(x):
    """Quick master for the individual stems."""
    x = np.stack([hp(ch, 28) for ch in x])
    # Soft-knee bus compression (RMS follower).
    rms = np.sqrt(np.maximum(lp(np.mean(x ** 2, axis=0), 6), 0) + 1e-12)
    thr = 0.32
    gain = np.where(rms > thr, (thr / rms) ** 0.25, 1.0)
    x = x * gain
    # Peak safety: a smooth limiter.
    peak = np.max(np.abs(x))
    x = x / peak * 0.89
    return np.tanh(x * 1.05) / np.tanh(1.05) * 0.9


def write_wav(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    y = np.clip(x, -1, 1)
    pcm = np.ascontiguousarray(np.round(y.T * 8388607).astype('<i4'))
    raw = pcm.view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(3)
        w.setframerate(SR)
        w.writeframes(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(ROOT / 'build' / 'audio' / 'soundtrack.wav'))
    ap.add_argument('--stems', action='store_true')
    ap.add_argument('--no-voice', action='store_true', help='music and effects only')
    a = ap.parse_args()
    music, fx_bus = compose()
    music = music * 0.8
    voice = None
    if not a.no_voice and (VOICE_DIR / 'lines.json').exists():
        v, act = narration()
        music = music * 10 ** (MUSIC_DUCK_DB * act / 20)
        fx_bus = fx_bus * 10 ** (FX_DUCK_DB * act / 20)
        # Level the voice against the ducked bed where it speaks.
        speaking = act > 0.9
        bed = np.sqrt(np.mean((music[:, speaking] + fx_bus[:, speaking]) ** 2))
        lvl = np.sqrt(np.mean(v[speaking] ** 2))
        v = v * bed / lvl * 10 ** (VOICE_OVER_BED_DB / 20)
        voice = reverb(np.stack([v, v]) * 0.7071, 0.05)
    mix = finish(music + fx_bus + (voice if voice is not None else 0))
    out = pathlib.Path(a.out)
    write_wav(out, mix)
    if a.stems:
        write_wav(out.with_name('stem-music.wav'), master(music))
        write_wav(out.with_name('stem-effects.wav'), master(fx_bus))
        if voice is not None:
            write_wav(out.with_name('stem-voice.wav'), master(voice))
    print(f'Wrote {out} ({DUR:.2f} s, {SR} Hz, 24-bit stereo{", with narration" if voice is not None else ""})')


if __name__ == '__main__':
    main()
