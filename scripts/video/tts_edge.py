"""Narasi gratis lewat suara neural Microsoft Edge (bawaan: id-ID-ArdiNeural, pria) untuk video demo.

Dipakai karena akun ElevenLabs free tidak boleh memakai suara Voice Library maupun Voice Design lewat
API. Keluaran sama persis dengan tts.mjs: data/video/audio/<segmen>.mp3 + .json berisi alignment per
karakter terhadap teks `tts` di segments.json, jadi compose.mjs tidak perlu tahu sumber suaranya.

Istilah Inggris dieja ulang (PRON) hanya untuk mesin suara agar dibaca seperti lazimnya orang
Indonesia di bidang TI; naskah, subtitle, dan cue tetap memakai ejaan aslinya.

    python scripts/video/tts_edge.py [--voice id-ID-ArdiNeural] [--rate=-4%] [--only s03,s05] [--force]
"""

import argparse
import asyncio
import json
import pathlib
import re
import sys

import edge_tts

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from pron import spoken  # noqa: E402


async def synth(text, voice, rate, pitch, mp3_path):
    com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    words = []
    with open(mp3_path, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                a = chunk["offset"] / 1e7
                words.append((a, a + chunk["duration"] / 1e7, chunk["text"]))
    return words


def char_times(text, words):
    """Waktu mulai/selesai per karakter teks lisan dari batas kata Edge."""
    n = len(text)
    starts = [None] * n
    ends = [None] * n
    pos = 0
    for a, b, w in words:
        i = text.find(w, pos)
        if i < 0:
            m = re.search(re.escape(w), text[pos:], re.I)
            if not m:
                continue
            i = pos + m.start()
        span = len(w)
        for k in range(span):
            starts[i + k] = a + (b - a) * k / span
            ends[i + k] = a + (b - a) * (k + 1) / span
        pos = i + span
    last = 0.0
    for k in range(n):
        if starts[k] is None:
            starts[k] = ends[k] = last
        else:
            last = ends[k]
    return starts, ends


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="id-ID-ArdiNeural")
    ap.add_argument("--rate", default="-4%")
    ap.add_argument("--pitch", default="+0Hz")
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--out", default=str(ROOT / "data" / "video" / "audio"))
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    cfg = json.loads((ROOT / "scripts" / "video" / "segments.json").read_text(encoding="utf-8"))
    only = set(args.only.split(",")) if args.only else None
    total = 0.0
    for seg in cfg["segments"]:
        if only and seg["id"] not in only:
            continue
        mp3 = out / f"{seg['id']}.mp3"
        if mp3.exists() and not args.force:
            print(json.dumps({"id": seg["id"], "skip": "sudah ada"}))
            continue
        text = seg["tts"]
        say, pos_map = spoken(text)
        words = await synth(say, args.voice, args.rate, args.pitch, mp3)
        s_starts, s_ends = char_times(say, words)
        starts = [s_starts[min(pos_map[p], len(say) - 1)] for p in range(len(text))]
        ends = [s_ends[min(pos_map[p], len(say) - 1)] for p in range(len(text))]
        alignment = {
            "characters": list(text),
            "character_start_times_seconds": starts,
            "character_end_times_seconds": ends,
        }
        meta = {
            "text": text,
            "spoken": say,
            "model": "edge-tts",
            "voice": args.voice,
            "rate": args.rate,
            "alignment": alignment,
        }
        (out / f"{seg['id']}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        end = max(ends) if ends else 0.0
        total += end
        print(json.dumps({"id": seg["id"], "seconds": round(end, 2), "words": len(words)}))
    print(json.dumps({"total_speech_seconds": round(total, 1)}))


if __name__ == "__main__":
    asyncio.run(main())
