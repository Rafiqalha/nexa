"""Ikon aplikasi desktop NEXA (flat, DESIGN.md): latar --bg, huruf N --text berat 600,
garis aksen sage tipis, dan pita loreng digital (token --camo-*) di dasar ikon, tidak
pernah di belakang huruf. Tanpa gradien, bayangan, atau sudut membulat.

    python apps/desktop/build/make-icon.py

Menghasilkan icon.png (1024 px) dan icon.ico (16-256 px) di folder ini. Deterministik.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SIZE = 1024
BG = "#0c0f0d"
TEXT = "#e8e6dc"
ACCENT = "#a3b18a"
CAMO = ["#161c17", "#1d251d", "#232b22", "#26251e", "#2c3529"]
FONTS = [
    Path("C:/Windows/Fonts/seguisb.ttf"),  # Segoe UI Semibold (600)
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]


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


def draw_icon() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), BG)
    d = ImageDraw.Draw(img)

    # Pita loreng digital: blok piksel grid, hanya di 22% bawah (tidak menyentuh huruf).
    cell = SIZE // 16
    band_top = SIZE - cell * 4
    rnd = mulberry32(7)
    blobs = [(rnd() * 16, rnd() * 4, int(rnd() * len(CAMO))) for _ in range(22)]
    for gy in range(4):
        for gx in range(16):
            nearest = min(blobs, key=lambda b: (b[0] - gx) ** 2 + ((b[1] - gy) * 1.6) ** 2)
            x0, y0 = gx * cell, band_top + gy * cell
            d.rectangle([x0, y0, x0 + cell - 1, y0 + cell - 1], fill=CAMO[nearest[2]])

    # Huruf N (wordmark, berat 600) di tengah area atas.
    font_path = next((f for f in FONTS if f.exists()), None)
    font = ImageFont.truetype(str(font_path), 560) if font_path else ImageFont.load_default()
    box = d.textbbox((0, 0), "N", font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    area_h = band_top - 96
    x = (SIZE - w) // 2 - box[0]
    y = 48 + (area_h - h) // 2 - box[1]
    d.text((x, y), "N", font=font, fill=TEXT)

    # Garis aksen tipis di bawah huruf.
    bar_w, bar_h = int(w * 0.62), 28
    bx = (SIZE - bar_w) // 2
    by = y + box[3] + 40
    d.rectangle([bx, by, bx + bar_w, by + bar_h], fill=ACCENT)
    return img


def main() -> None:
    img = draw_icon()
    img.save(HERE / "icon.png", optimize=True)
    sizes = [(s, s) for s in (16, 24, 32, 48, 64, 128, 256)]
    img.save(HERE / "icon.ico", sizes=sizes)
    print("icon.png & icon.ico ditulis ke", HERE)


if __name__ == "__main__":
    main()
