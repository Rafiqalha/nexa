"""Penyunting footage video tutorial NEXA (gaya Screen Studio, tetap flat sesuai DESIGN.md).

Membaca satu job JSON per segmen footage lalu menulis MP4 1920x1080 30 fps:
- peta waktu (time map): footage diputar, ditahan, atau dipercepat agar momen kunci jatuh tepat
  pada kata yang diucapkan narasi;
- kamera: zoom/geser halus ke kotak elemen yang direkam recorder (piksel tangkapan 2880x1620,
  jadi teks tetap tajam saat di-zoom);
- sorotan (spotlight): area di luar elemen diredupkan, garis aksen 2 px, label kecil;
- bingkai: footage di atas latar --bg dengan garis --line-strong, pita atas (bab + konteks);
- picture-in-picture (panel terminal agen).

    python scripts/video/tutorial/compositor.py job.json [job2.json ...]
"""

import json
import math
import subprocess
import sys
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONTS = "D:/LOMBA/Kartika Cyber/Nexa/data/video/fonts"
BG = (13, 15, 12)  # BGR dari #0c0f0d
LINE = (53, 61, 52)  # #343d35
ACCENT = (138, 177, 163)  # #a3b18a
TEXT = (220, 230, 232)  # #e8e6dc
MUTED = (134, 150, 142)  # #8e9686
SURFACE = (15, 19, 15)  # #0f130f


def ease(k):
    k = min(1.0, max(0.0, k))
    return 4 * k * k * k if k < 0.5 else 1 - (-2 * k + 2) ** 3 / 2


def smooth(t, a, b, fade=0.3):
    """Opasitas 0..1 untuk rentang [a, b] dengan fade masuk/keluar."""
    if t < a or t > b:
        return 0.0
    return min(1.0, (t - a) / fade, (b - t) / fade)


class Reader:
    """Pembaca frame berdasarkan waktu; maju berurutan, membuka ulang bila mundur."""

    def __init__(self, path):
        self.path = path
        self.cap = cv2.VideoCapture(path)
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 30
        self.count = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.idx = -1
        self.frame = None

    def at(self, t):
        want = max(0, min(self.count - 1, int(round(t * self.fps))))
        if want == self.idx and self.frame is not None:
            return self.frame
        if want < self.idx or want - self.idx > 90:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, want)
            self.idx = want - 1
        while self.idx < want:
            ok, fr = self.cap.read()
            if not ok:
                break
            self.idx += 1
            self.frame = fr
        return self.frame


def interp_timemap(tm, t):
    if t <= tm[0][0]:
        return tm[0][1]
    for (a, sa), (b, sb) in zip(tm, tm[1:]):
        if a <= t <= b:
            return sa + (sb - sa) * ((t - a) / (b - a) if b > a else 0)
    return tm[-1][1]


def fit_rect(rect, src_w, src_h, aspect, pad=1.0, min_w=None):
    """Kotak kamera: rasio keluaran, diberi ruang, dibatasi di dalam sumber."""
    x, y, w, h = rect
    cx, cy = x + w / 2, y + h / 2
    w, h = w * pad, h * pad
    if w / h < aspect:
        w = h * aspect
    else:
        h = w / aspect
    if min_w:
        w = max(w, min_w)
        h = w / aspect
    if w > src_w:
        w, h = src_w, src_w / aspect
    if h > src_h:
        h, w = src_h, src_h * aspect
    cx = min(max(cx, w / 2), src_w - w / 2)
    cy = min(max(cy, h / 2), src_h - h / 2)
    return cx, cy, w


def camera_at(keys, t):
    """keys: [{t, d, cx, cy, w}] — gerak dimulai di t selama d detik; di antaranya diam."""
    cur = keys[0]
    state = (cur["cx"], cur["cy"], cur["w"])
    for k in keys[1:]:
        if t < k["t"]:
            break
        e = ease((t - k["t"]) / max(k["d"], 1e-6))
        a = state
        b = (k["cx"], k["cy"], k["w"])
        # Zoom diinterpolasi di ruang log agar kecepatan zoom terasa rata.
        w = math.exp(math.log(a[2]) + (math.log(b[2]) - math.log(a[2])) * e)
        state = (a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, w)
    return state


def render_view(src, cx, cy, cw, out_w, out_h):
    """Potong area kamera lalu skala dengan INTER_AREA (turun) / CUBIC (naik), presisi subpiksel."""
    ch = cw * out_h / out_w
    s = out_w / cw
    x0, y0 = cx - cw / 2, cy - ch / 2
    ix0, iy0 = max(0, int(math.floor(x0)) - 2), max(0, int(math.floor(y0)) - 2)
    ix1 = min(src.shape[1], int(math.ceil(x0 + cw)) + 2)
    iy1 = min(src.shape[0], int(math.ceil(y0 + ch)) + 2)
    region = src[iy0:iy1, ix0:ix1]
    rw, rh = max(1, int(round((ix1 - ix0) * s))), max(1, int(round((iy1 - iy0) * s)))
    interp = cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC
    scaled = cv2.resize(region, (rw, rh), interpolation=interp)
    sx, sy = rw / (ix1 - ix0), rh / (iy1 - iy0)
    dx, dy = -(x0 - ix0) * sx, -(y0 - iy0) * sy
    m = np.float32([[1, 0, dx], [0, 1, dy]])
    view = cv2.warpAffine(scaled, m, (out_w, out_h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return view, (x0, y0, s)


@lru_cache(maxsize=64)
def font(name, size):
    return ImageFont.truetype(f"{FONTS}/{name}", size)


@lru_cache(maxsize=128)
def label_image(text, size=22, mono=True):
    """Label sorotan: pelat --surface, bilah aksen kiri, teks --text (RGBA numpy)."""
    f = font("JetBrainsMono-Medium.ttf" if mono else "Geist-Medium.ttf", size)
    l, t, r, b = f.getbbox(text)
    pad_x, pad_y = 14, 9
    w, h = (r - l) + pad_x * 2 + 4, (b - t) + pad_y * 2
    img = Image.new("RGBA", (w, h), (15, 19, 15, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 3, h], fill=(163, 177, 138, 255))
    d.rectangle([0, 0, w - 1, h - 1], outline=(52, 61, 53, 255))
    d.text((pad_x + 4 - l, pad_y - t), text, font=f, fill=(232, 230, 220, 255))
    arr = np.array(img)
    return arr[:, :, [2, 1, 0, 3]]  # RGBA -> BGRA


def blend(dst, img_bgra, x, y, alpha=1.0):
    h, w = img_bgra.shape[:2]
    x, y = int(round(x)), int(round(y))
    if x >= dst.shape[1] or y >= dst.shape[0] or x + w <= 0 or y + h <= 0:
        return
    sx0, sy0 = max(0, -x), max(0, -y)
    dx0, dy0 = max(0, x), max(0, y)
    dx1, dy1 = min(dst.shape[1], x + w), min(dst.shape[0], y + h)
    src = img_bgra[sy0 : sy0 + (dy1 - dy0), sx0 : sx0 + (dx1 - dx0)]
    a = (src[:, :, 3:4].astype(np.float32) / 255.0) * alpha
    roi = dst[dy0:dy1, dx0:dx1].astype(np.float32)
    dst[dy0:dy1, dx0:dx1] = (roi * (1 - a) + src[:, :, :3].astype(np.float32) * a).astype(np.uint8)


def draw_spot(view, rect_out, a, label=None, dim=0.55):
    """Redupkan area di luar kotak, garis aksen 2 px, label di atas/bawah kotak."""
    if a <= 0:
        return
    x, y, w, h = rect_out
    H, W = view.shape[:2]
    x0, y0 = int(max(0, x - 6)), int(max(0, y - 6))
    x1, y1 = int(min(W, x + w + 6)), int(min(H, y + h + 6))
    inside = view[y0:y1, x0:x1].copy()
    cv2.convertScaleAbs(view, view, alpha=1 - dim * a)  # redupkan seluruh bidang (SIMD, cepat)
    view[y0:y1, x0:x1] = inside
    # Garis aksen: warna dicampur ke latar gelap sesuai opasitas (setara fade tanpa salinan penuh).
    col = tuple(int(c * a + b * (1 - a)) for c, b in zip(ACCENT, BG))
    cv2.rectangle(view, (x0, y0), (x1, y1), col, 2, cv2.LINE_AA)
    if label:
        img = label_image(label)
        lx = min(max(8, x0), W - img.shape[1] - 8)
        ly = y0 - img.shape[0] - 10
        if ly < 8:
            ly = y1 + 10
        blend(view, img, lx, ly, a)


def render_job(job):
    W, H = 1920, 1080
    fps = job.get("fps", 30)
    frames = job["frames"]
    frame = job.get("frame") or {"x": 0, "y": 0, "w": W, "h": H}
    fw, fh = frame["w"], frame["h"]
    reader = Reader(job["src"])
    src_h, src_w = reader.at(0).shape[:2]
    aspect = fw / fh
    keys = []
    for k in job.get("camera") or [{"t": 0, "d": 0, "rect": [0, 0, src_w, src_h]}]:
        cx, cy, cw = fit_rect(k["rect"], src_w, src_h, aspect, k.get("pad", 1.0), k.get("min_w"))
        keys.append({"t": k["t"], "d": k.get("d", 0.9), "cx": cx, "cy": cy, "w": cw})
    tm = job.get("timemap") or [[0, 0], [frames / fps, frames / fps]]
    band = cv2.imread(job["band"], cv2.IMREAD_UNCHANGED) if job.get("band") else None
    pip = job.get("pip")
    pip_reader = Reader(pip["src"]) if pip else None
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}",
         "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "14",
         "-pix_fmt", "yuv420p", job["out"]],
        stdin=subprocess.PIPE,
    )
    base = np.zeros((H, W, 3), np.uint8)
    base[:] = BG
    if job.get("frame"):
        cv2.rectangle(base, (frame["x"] - 1, frame["y"] - 1), (frame["x"] + fw, frame["y"] + fh), LINE, 1)
    if band is not None:
        blend(base, band, 0, 0)  # pita statis di luar bingkai: cukup sekali
        band = None
    for i in range(frames):
        t = i / fps
        src = reader.at(interp_timemap(tm, t))
        cx, cy, cw = camera_at(keys, t)
        view, (ox, oy, s) = render_view(src, cx, cy, cw, fw, fh)
        for sp in job.get("spots", []):
            a = smooth(t, sp["from"], sp["to"], sp.get("fade", 0.35))
            if a > 0:
                rx, ry, rw, rh = sp["rect"]
                draw_spot(view, ((rx - ox) * s, (ry - oy) * s, rw * s, rh * s), a, sp.get("label"), sp.get("dim", 0.55))
        canvas = base.copy()
        canvas[frame["y"] : frame["y"] + fh, frame["x"] : frame["x"] + fw] = view
        if band is not None:
            blend(canvas, band, 0, 0)
        if pip_reader is not None:
            pf = pip_reader.at(t)
            if pf is not None:
                pw = pip["w"]
                ph = int(round(pf.shape[0] * pw / pf.shape[1]))
                small = cv2.resize(pf, (pw, ph), interpolation=cv2.INTER_AREA)
                pa = smooth(t, pip.get("from", 0), pip.get("to", 1e9), 0.4)
                if pa > 0:
                    roi = canvas[pip["y"] : pip["y"] + ph, pip["x"] : pip["x"] + pw]
                    canvas[pip["y"] : pip["y"] + ph, pip["x"] : pip["x"] + pw] = cv2.addWeighted(small, pa, roi, 1 - pa, 0)
        for lb in job.get("labels", []):
            a = smooth(t, lb["from"], lb["to"], lb.get("fade", 0.35))
            if a > 0:
                blend(canvas, label_image(lb["text"], lb.get("size", 22), lb.get("mono", True)), lb["x"], lb["y"], a)
        ff.stdin.write(canvas.tobytes())
    ff.stdin.close()
    ff.wait()
    print(json.dumps({"out": job["out"], "frames": frames}), flush=True)


if __name__ == "__main__":
    for path in sys.argv[1:]:
        with open(path, encoding="utf-8") as fh:
            spec = json.load(fh)
        for job in spec if isinstance(spec, list) else [spec]:
            render_job(job)
