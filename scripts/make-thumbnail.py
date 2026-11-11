"""Thumbnail submission 1200x630 (<= 500 KB), UI flat sesuai DESIGN.md.

    python scripts/make-thumbnail.py

Angka diambil dari docs/metrics.json (data simulasi lab). Loreng digital hanya di pita
bawah, tidak pernah di belakang teks. Tanpa gradien atau bayangan.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "submission" / "thumbnail.png"
W, H = 1200, 630
BG, TEXT, TEXT2, MUTED, LINE, ACCENT = "#0c0f0d", "#e8e6dc", "#b9bdb0", "#8e9686", "#232a24", "#a3b18a"
CAMO = ["#161c17", "#1d251d", "#232b22", "#26251e", "#2c3529"]
FONT_DIR = Path("C:/Windows/Fonts")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in (FONT_DIR / name, Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


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


def metrics() -> dict:
    data = json.loads((ROOT / "docs" / "metrics.json").read_text(encoding="utf-8"))
    nexa = [r for r in data["nexaRuns"] if r["model"] == "deepseek-flash"]
    base = [r for r in data["baselineRuns"] if r["model"] == "deepseek-flash"]
    med = lambda xs: sorted(xs)[len(xs) // 2]
    human = data["human"]
    total_h = human["normal"]["total"] + human["fast"]["total"]
    flagged_h = human["normal"]["flagged"] + human["fast"]["flagged"]
    return {
        "detected": f"{sum(1 for r in data['nexaRuns'] if r['detected'])}/{len(data['nexaRuns'])}",
        "upstream": f"{med([r['upstreamRequests'] for r in nexa])} dari {med([r['requests'] for r in nexa])}",
        "baseline_req": med([r["requests"] for r in base]),
        "human": f"{flagged_h}/{total_h}",
    }


def main() -> None:
    m = metrics()
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Pita loreng digital di dasar (grid 10 px x 3), tanpa teks di atasnya.
    cell, rows = 20, 3
    top = H - cell * rows
    rnd = mulberry32(11)
    blobs = [(rnd() * (W / cell), rnd() * rows, int(rnd() * len(CAMO))) for _ in range(40)]
    for gy in range(rows):
        for gx in range(W // cell):
            near = min(blobs, key=lambda b: (b[0] - gx) ** 2 + ((b[1] - gy) * 2.2) ** 2)
            d.rectangle([gx * cell, top + gy * cell, gx * cell + cell - 1, top + gy * cell + cell - 1], fill=CAMO[near[2]])

    x = 72
    d.text((x, 64), "N E X A", font=font("seguisb.ttf", 64), fill=TEXT)
    d.rectangle([x, 156, x + 120, 161], fill=ACCENT)
    d.text((x, 184), "Deception defensif untuk agen AI penyerang", font=font("seguisb.ttf", 36), fill=TEXT)
    d.text(
        (x, 236),
        "Deteksi di reverse proxy · labirin umpan prosedural · canary · draf rule Suricata dengan persetujuan operator",
        font=font("segoeui.ttf", 20),
        fill=TEXT2,
    )

    # Tiga metrik lab (angka mono besar, label kecil di bawah), dipisah garis tipis.
    d.line([x, 300, W - 72, 300], fill=LINE, width=1)
    cols = [
        (m["detected"], "agen AI terdeteksi & dijebak"),
        (m["upstream"], f"permintaan agen sampai ke aplikasi asli (tanpa NEXA: {m['baseline_req']})"),
        (m["human"], "pengunjung manusia (simulasi) ditandai"),
    ]
    col_w = (W - 2 * x) // 3
    for i, (value, label) in enumerate(cols):
        cx = x + i * col_w
        d.text((cx, 330), value, font=font("consola.ttf", 58), fill=TEXT)
        words, line, lines = label.split(), "", []
        for wd in words:
            trial = f"{line} {wd}".strip()
            if d.textlength(trial, font=font("segoeui.ttf", 18)) > col_w - 32:
                lines.append(line)
                line = wd
            else:
                line = trial
        lines.append(line)
        for j, ln in enumerate(lines):
            d.text((cx, 410 + j * 24), ln, font=font("segoeui.ttf", 18), fill=MUTED)
    d.line([x, 486, W - 72, 486], fill=LINE, width=1)

    meta = font("consola.ttf", 17)
    d.text((x, 506), "Kartika Cyber Hackathon 2026 · Penangkalan", font=meta, fill=MUTED)
    label = "Data simulasi lab"
    d.text((W - 72 - d.textlength(label, font=meta), 506), label, font=meta, fill=MUTED)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    size = OUT.stat().st_size
    assert size <= 500_000, f"thumbnail {size} byte > 500 KB"
    print(f"{OUT.relative_to(ROOT)}: {W}x{H}, {size} byte")


if __name__ == "__main__":
    main()
