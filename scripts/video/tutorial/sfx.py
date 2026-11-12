"""Efek suara orisinal (disintesis, tanpa sampel pihak ketiga) untuk video tutorial.

- click.wav: ketukan lembut 35 ms (derau terfilter + transien) untuk klik di footage.
- whoosh.wav: sapuan 0,7 dtk (derau bandpass yang frekuensinya naik-turun) untuk kartu bab.

    python sfx.py <folder-keluaran>
"""

import pathlib
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 48000
rng = np.random.default_rng(11)


def save(path, x, peak=0.7):
    x = x / (np.abs(x).max() + 1e-9) * peak
    stereo = np.stack([x, x], axis=1)
    wavfile.write(path, SR, (stereo * 32767).astype(np.int16))


def click():
    n = int(0.035 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    sos = butter(2, [1800, 6500], btype="bandpass", fs=SR, output="sos")
    body = sosfilt(sos, noise) * np.exp(-t / 0.006)
    tone = np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.004) * 0.6
    return body + tone


def whoosh():
    dur = 0.7
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # Beberapa pita derau tetap, dicampur dengan bobot yang bergeser (pusat naik lalu turun):
    # terdengar seperti sapuan tanpa klik akibat filter berganti di tengah sinyal.
    centers = [450, 800, 1400, 2400, 3800]
    bands = [sosfilt(butter(2, [c * 0.7, c * 1.4], btype="bandpass", fs=SR, output="sos"), noise) for c in centers]
    center = np.log(450) + (np.log(3200) - np.log(450)) * np.sin(np.pi * t / dur) ** 1.4
    out = np.zeros(n)
    for c, b in zip(centers, bands):
        out += b * np.exp(-((np.log(c) - center) ** 2) / (2 * 0.35**2))
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    return out * env


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    save(out / "click.wav", click(), 0.6)
    save(out / "whoosh.wav", whoosh(), 0.5)
    print({"out": str(out)})
