"""Kompatibilitas: thumbnail submission kini dibuat oleh scripts/make-thumbnail.mjs.

Versi baru dirender dari HTML oleh Electron dengan font brand (Geist, JetBrains Mono), logo
Simpul, dan potongan UI dashboard. Skrip ini hanya meneruskan ke sana agar perintah lama tidak
menimpa thumbnail dengan desain lama.

    python scripts/make-thumbnail.py   # sama dengan: node scripts/make-thumbnail.mjs
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    sys.exit(subprocess.call(["node", str(ROOT / "scripts" / "make-thumbnail.mjs")], cwd=ROOT))
