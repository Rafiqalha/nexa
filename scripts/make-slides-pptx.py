"""Versi .pptx dari slide submission, untuk diunggah ke Google Slides.

    node scripts/make-slides.mjs            # 1. PDF terverifikasi (docs/submission/slides.pdf)
    python scripts/make-slides-pptx.py      # 2. data/slides/NEXA - Slide Penjelasan Karya - Tim Martex.pptx

Tiap halaman PDF dirender menjadi gambar penuh 2560x1440, jadi tampilan di Google Slides sama
persis dengan PDF yang sudah diperiksa (konversi Google tidak bisa menggeser teks atau mengganti
font). Tautan di PDF (slide "Cara mencoba" dan penutup) dipasang lagi sebagai area klik transparan,
dan teks tiap slide disalin ke catatan pembicara agar tetap bisa dibaca dan dicari.

Unggah hasilnya ke Google Drive, buka dengan Google Slides, lalu File > Simpan sebagai Google Slide.
Nama berkas menjadi judul presentasi. Butuh: pip install python-pptx pymupdf
"""

import re
import sys
from html import unescape
from pathlib import Path

import pymupdf
from lxml import etree
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Emu

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "docs" / "submission" / "slides.pdf"
OUT = ROOT / "data" / "slides" / "NEXA - Slide Penjelasan Karya - Tim Martex.pptx"
WIDTH_PX = 2560
# 16:9 standar PowerPoint/Google Slides (13,333 x 7,5 inci).
SLIDE_W, SLIDE_H = Emu(12192000), Emu(6858000)
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"


def html_sections() -> list[str]:
    html = (ROOT / "docs" / "submission" / "slides" / "slides.html").read_text(encoding="utf-8")
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    return re.split(r'<section class="slide[^"]*">', html)[1:]


def plain(fragment: str) -> str:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", fragment))).strip()


def slide_title(section: str) -> str:
    """Judul slide (h1/h2, atau kalimat utama penutup), untuk teks alt gambar."""
    m = re.search(r"<h[12][^>]*>(.*?)</h[12]>", section, re.S) or re.search(
        r'<div class="hero">\s*<p>(.*?)</p>', section, re.S
    )
    return plain(m.group(1)) if m else ""


def slide_notes(section: str) -> str:
    """Teks slide per paragraf (tanpa footer), untuk catatan pembicara."""
    body = re.sub(r"<footer.*?</footer>", "", section, flags=re.S)
    body = re.sub(r"<svg.*?</svg>", "", body, flags=re.S)
    body = re.sub(r"<small[^>]*>", " ", body)  # "1,8<small>detik" -> "1,8 detik"
    body = re.sub(r"\s+", " ", body)
    body = re.sub(r"</t[dh]>", " · ", body)
    body = re.sub(r"<br\s*/?>|</(p|h1|h2|h3|li|tr|b|a|figcaption|div)>", "\n", body)
    lines = [plain(line).strip(" ·") for line in body.split("\n")]
    return "\n".join(line for line in lines if line)


def link_hotspot(slide, rect: pymupdf.Rect, page_rect: pymupdf.Rect, uri: str) -> None:
    """Persegi transparan penuh (isi alpha 0, tanpa garis) yang membawa hyperlink."""
    sx, sy = SLIDE_W / page_rect.width, SLIDE_H / page_rect.height
    shape = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Emu(round(rect.x0 * sx)),
        Emu(round(rect.y0 * sy)),
        Emu(round(rect.width * sx)),
        Emu(round(rect.height * sy)),
    )
    shape.name = f"Tautan {uri}"
    shape.fill.solid()
    shape.fill.fore_color.rgb = RGBColor(0x0C, 0x0F, 0x0D)
    color = shape.fill._xPr.find(f".//{{{A_NS}}}srgbClr")
    etree.SubElement(color, f"{{{A_NS}}}alpha").set("val", "0")
    shape.line.fill.background()
    shape.shadow.inherit = False
    shape.click_action.hyperlink.address = uri


def main() -> int:
    if not PDF.exists():
        print("docs/submission/slides.pdf belum ada: jalankan node scripts/make-slides.mjs", file=sys.stderr)
        return 1
    doc = pymupdf.open(PDF)
    prs = Presentation()
    prs.slide_width, prs.slide_height = SLIDE_W, SLIDE_H
    props = prs.core_properties
    props.title = "NEXA · Slide Penjelasan Karya · Tim Martex"
    props.author = "Tim Martex"
    props.subject = "Kartika Cyber Hackathon 2026 · Kategori Penangkalan"
    props.language = "id-ID"
    blank = prs.slide_layouts[6]
    sections = html_sections()
    if len(sections) != len(doc):
        print(f"slides.html punya {len(sections)} slide, PDF {len(doc)} halaman: render ulang PDF dulu", file=sys.stderr)
        return 1

    links = 0
    for page in doc:
        slide = prs.slides.add_slide(blank)
        zoom = WIDTH_PX / page.rect.width
        png = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).tobytes("png")
        img = OUT.parent / f".page-{page.number + 1:02d}.png"
        OUT.parent.mkdir(parents=True, exist_ok=True)
        img.write_bytes(png)
        pic = slide.shapes.add_picture(str(img), 0, 0, width=SLIDE_W, height=SLIDE_H)
        img.unlink()
        section = sections[page.number]
        pic.name = f"Slide {page.number + 1}"
        pic._element.nvPicPr.cNvPr.set("descr", slide_title(section))
        for link in page.get_links():
            if link.get("uri"):
                link_hotspot(slide, link["from"], page.rect, link["uri"])
                links += 1
        slide.notes_slide.notes_text_frame.text = slide_notes(section)

    prs.save(OUT)
    size = OUT.stat().st_size
    print(f"{OUT.relative_to(ROOT)}: {len(doc)} slide, {links} tautan, {size / 1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
