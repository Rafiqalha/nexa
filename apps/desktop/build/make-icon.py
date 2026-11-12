"""Ikon aplikasi desktop NEXA (flat, DESIGN.md): latar --bg, logo "Simpul" berwarna --text, dan
pita loreng digital (token --camo-*) di dasar ikon, tidak pernah di belakang logo. Ukuran kecil
(16-48 px) hanya memuat logo agar tetap terbaca di taskbar. Tanpa gradien, bayangan, atau sudut
membulat.

    python apps/desktop/build/make-icon.py

Menghasilkan icon.png (1024 px) dan icon.ico (16-256 px) di folder ini. Deterministik.
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SIZE = 1024
SS = 4  # supersampling: digambar 4x lalu diperkecil agar tepi halus
BG = "#0c0f0d"
TEXT = "#e8e6dc"
CAMO = ["#161c17", "#1d251d", "#232b22", "#26251e", "#2c3529"]

# Geometri logo di grid 64, sama dengan LogoMark.tsx dan docs/brand/logo/: huruf N
# BL -> TL -> BR -> TR yang ditutup kembali ke titik awal (Z), garis 8, sambungan bevel.
XL, XR, YT, YB, W = 13.0, 51.0, 10.625, 53.375, 8.0
MARK_H = 48.065  # tinggi tanda (ujung pancung atas ke bawah) dalam unit grid


def mulberry32(seed: int):
    state = seed & 0xFFFFFFFF

    def rnd() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rnd


def mark_shapes():
    """Tepi luar (10 titik) dan dua lubang segitiga dari goresan berbevel, dalam unit grid."""
    h = W / 2
    length = math.hypot(XR - XL, YB - YT)
    s, c = (XR - XL) / length, (YB - YT) / length  # sin & cos sudut diagonal dari vertikal
    outer = [
        (XL - h, YT), (XL + h * c, YT - h * s),  # pancungan kiri atas
        (32, 32 - h / s),  # takik atas
        (XR - h * c, YT - h * s), (XR + h, YT),  # pancungan kanan atas
        (XR + h, YB), (XR - h * c, YB + h * s),  # pancungan kanan bawah
        (32, 32 + h / s),  # takik bawah
        (XL + h * c, YB + h * s), (XL - h, YB),  # pancungan kiri bawah
    ]
    dy = h * (1 + c) / s
    holes = [
        [(XL + h, YT + dy), (32 - h / c, 32), (XL + h, YB - dy)],
        [(XR - h, YT + dy), (32 + h / c, 32), (XR - h, YB - dy)],
    ]
    return outer, holes


def draw_mark(d: ImageDraw.ImageDraw, cx: float, cy: float, k: float) -> None:
    """Gambar logo berpusat di (cx, cy) dengan skala k piksel per unit grid."""
    outer, holes = mark_shapes()

    def tf(pts):
        return [(cx + (x - 32) * k, cy + (y - 32) * k) for x, y in pts]

    d.polygon(tf(outer), fill=TEXT)
    for hole in holes:
        d.polygon(tf(hole), fill=BG)


def draw_icon() -> Image.Image:
    big = SIZE * SS
    img = Image.new("RGB", (big, big), BG)
    d = ImageDraw.Draw(img)

    # Pita loreng digital: blok piksel grid, hanya di 25% bawah (tidak menyentuh logo).
    cell = big // 16
    band_top = big - cell * 4
    rnd = mulberry32(7)
    blobs = [(rnd() * 16, rnd() * 4, int(rnd() * len(CAMO))) for _ in range(22)]
    for gy in range(4):
        for gx in range(16):
            nearest = min(blobs, key=lambda b: (b[0] - gx) ** 2 + ((b[1] - gy) * 1.6) ** 2)
            x0, y0 = gx * cell, band_top + gy * cell
            d.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=CAMO[nearest[2]])

    # Logo di tengah area atas pita, setinggi 57% area itu.
    draw_mark(d, big / 2, band_top / 2, band_top * 0.57 / MARK_H)
    return img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def draw_small(px: int) -> Image.Image:
    """Ikon kecil: hanya logo setinggi 80% ikon, digambar 16x lalu diperkecil."""
    big = px * 16
    img = Image.new("RGB", (big, big), BG)
    draw_mark(ImageDraw.Draw(img), big / 2, big / 2, big * 0.8 / MARK_H)
    return img.resize((px, px), Image.Resampling.LANCZOS)


def main() -> None:
    img = draw_icon()
    img.save(HERE / "icon.png", optimize=True)
    sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    # Tiap ukuran diberikan eksplisit: Pillow mengisi ukuran yang kosong dari gambar tambahan
    # terakhir, bukan dari gambar dasar.
    frames = [draw_small(s) for s in (16, 24, 32, 48)]
    frames += [img.resize((s, s), Image.Resampling.LANCZOS) for s in (64, 128, 256)]
    img.save(HERE / "icon.ico", sizes=sizes, append_images=frames)
    print("icon.png & icon.ico ditulis ke", HERE)


if __name__ == "__main__":
    main()
