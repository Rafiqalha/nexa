"""Ejaan ulang istilah Inggris untuk mesin suara Bahasa Indonesia, plus peta posisi karakter.

Naskah, subtitle, dan cue tetap memakai ejaan asli; hanya teks yang dikirim ke mesin suara yang
dieja ulang, lalu waktu per karakter dipetakan kembali ke teks asli lewat `pos_map`.
"""

import re

PRON = {
    "NEXA": "Neksa",
    "BAYU": "Bayu",
    "deception": "disepsyen",
    "reverse": "rivers",
    "proxy": "proksi",
    "user": "yuser",
    "agent": "ejen",
    "header": "heder",
    "browser": "brauser",
    "honeylink": "hanilingk",
    "canary": "keneri",
    "seed": "sid",
    "framework": "fremwork",
    "budget": "bajet",
    "dashboard": "desbor",
    "Dashboard": "Desbor",
    "DeepSeek": "Dipsik",
    "signature": "signecer",
    "tool": "tul",
    "Suricata": "Surikata",
    "live": "laif",
    "run": "ran",
}
WORD = re.compile(r"[A-Za-z]+")


def spoken(text):
    """Teks untuk mesin suara + peta posisi karakter asli -> posisi di teks lisan."""
    out = []
    pos_map = [0] * (len(text) + 1)
    last = 0
    q = 0
    for m in WORD.finditer(text):
        a, b = m.span()
        for p in range(last, a):  # celah (spasi, tanda baca, angka) sama persis
            pos_map[p] = q
            out.append(text[p])
            q += 1
        word = PRON.get(m.group(0), m.group(0))
        for k in range(a, b):  # karakter dalam kata dipetakan proporsional
            pos_map[k] = q + (k - a) * len(word) // (b - a)
        out.append(word)
        q += len(word)
        last = b
    for p in range(last, len(text)):
        pos_map[p] = q
        out.append(text[p])
        q += 1
    pos_map[len(text)] = q
    return "".join(out), pos_map
