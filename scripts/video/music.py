"""Latar musik orisinal untuk video demo: pad ambien hangat, disintesis dari nol (tanpa sampel atau
lisensi pihak ketiga). Progresi Am(add9) - Fmaj7 - C(add9) - G6, 8 detik per akor, diulang sampai
durasi yang diminta. Volume akhir dan ducking di bawah narasi diatur compose.mjs.

    python scripts/video/music.py --seconds 280 [--out data/video/audio/bed.wav]
"""

import argparse
import pathlib

import numpy as np
from scipy.io import wavfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
SR = 48000
CHORD = 8.0  # detik per akor
FADE = 2.5  # tumpang-tindih antarakor
PROGRESSION = [  # (akar bas, nada pad) dalam MIDI
    (45, [57, 60, 64, 71]),  # Am(add9): A2 | A3 C4 E4 B4
    (41, [53, 57, 60, 64]),  # Fmaj7:    F2 | F3 A3 C4 E4
    (48, [60, 64, 67, 74]),  # C(add9):  C3 | C4 E4 G4 D5
    (43, [55, 59, 62, 64]),  # G6:       G2 | G3 B3 D4 E4
]
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def pad_voice(f, t, cutoff=750.0):
    """Saw band-limited lewat sintesis aditif dengan peredam lowpass halus (hangat, tanpa aliasing)."""
    out = np.zeros_like(t)
    k_max = int(min(40, 5000 / f))
    for k in range(1, k_max + 1):
        amp = (1.0 / k) / np.sqrt(1 + (k * f / cutoff) ** 2)
        out += amp * np.sin(2 * np.pi * k * f * t + rng.uniform(0, 2 * np.pi))
    return out


def envelope(n_total, n_fade):
    env = np.ones(n_total, dtype=np.float32)
    # Fade daya-sama (sin/cos): akor lama dan baru tidak berlubang -3 dB di tengah transisi.
    ramp = np.sin(np.linspace(0, np.pi / 2, n_fade, dtype=np.float32))
    env[:n_fade] = ramp
    env[-n_fade:] = ramp[::-1]
    return env


def render_loop():
    loop_len = int(CHORD * len(PROGRESSION) * SR)
    loop = np.zeros((loop_len, 2), dtype=np.float32)
    win = int((CHORD + FADE) * SR)
    t = np.arange(win, dtype=np.float32) / SR
    env = envelope(win, int(FADE * SR))
    for i, (root, notes) in enumerate(PROGRESSION):
        chord = np.zeros((win, 2), dtype=np.float32)
        for ch in range(2):
            for note in notes:
                for cents in (-7.0, 0.0, 7.0):
                    detune = cents + (1.5 if ch else -1.5)
                    chord[:, ch] += pad_voice(hz(note) * 2 ** (detune / 1200), t)
            chord[:, ch] += 2.2 * np.sin(2 * np.pi * hz(root) * t)  # sub bas lembut
        chord *= env[:, None]
        start = int((i * CHORD - FADE / 2) * SR)
        idx = (np.arange(win) + start) % loop_len  # ekor akor terakhir membungkus ke awal loop
        np.add.at(loop, idx, chord)
    return loop


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=float, required=True)
    ap.add_argument("--out", default=str(ROOT / "data" / "video" / "audio" / "bed.wav"))
    args = ap.parse_args()
    loop = render_loop()
    n = int(args.seconds * SR)
    reps = int(np.ceil(n / len(loop)))
    bed = np.tile(loop, (reps, 1))[:n]
    t = np.arange(n, dtype=np.float32) / SR
    bed *= (1.0 + 0.12 * np.sin(2 * np.pi * 0.07 * t))[:, None]  # gerak pelan
    rms = float(np.sqrt(np.mean(bed**2)))
    bed *= 10 ** (-20 / 20) / rms  # -20 dBFS RMS
    bed = np.clip(bed, -0.98, 0.98)
    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(out, SR, (bed * 32767).astype(np.int16))
    print({"out": str(out), "seconds": round(args.seconds, 2), "peak": round(float(np.abs(bed).max()), 3)})


if __name__ == "__main__":
    main()
