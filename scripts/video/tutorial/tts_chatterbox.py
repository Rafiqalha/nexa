"""Narasi video tutorial lewat Chatterbox-TTS-Indonesian (lokal, GPU) + alignment paksa.

- Model: Chatterbox (Resemble AI, MIT) dengan bobot T3 fine-tune Bahasa Indonesia
  grandhigh/Chatterbox-TTS-Indonesian (Apache 2.0), dimuat dari folder lokal.
- Tiap kalimat dibuat beberapa take; take terbaik dipilih otomatis dari skor alignment CTC
  (wav2vec2 Indonesia, indonesian-nlp/wav2vec2-indonesian-javanese-sundanese, Apache 2.0) dan
  kewajaran tempo. Kalimat lalu disambung dengan jeda natural.
- Keluaran per segmen: <out>/<id>.wav + <id>.json berisi alignment per karakter terhadap teks `tts`
  di storyboard (format sama dengan tts.mjs/tts_edge.py), jadi compose tidak perlu tahu mesinnya.

    python tts_chatterbox.py --storyboard storyboard.json [--ref suara.wav] [--only hook,serang]
    python tts_chatterbox.py --sample "teks" --out samples/  (uji cepat beberapa setelan)
"""

import argparse
import json
import os
import pathlib
import re
import sys
import time

import numpy as np
import torch
import torchaudio

ROOT = pathlib.Path(__file__).resolve().parents[3]
MODELS = pathlib.Path("D:/nexa-video-tools/models")
sys.path.insert(0, str(ROOT / "scripts" / "video"))
from pron import spoken  # noqa: E402  (ejaan ulang istilah Inggris + peta posisi karakter)

SR_ALIGN = 16000


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.?!])\s+", text) if s.strip()]


class Aligner:
    def __init__(self, device):
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

        path = MODELS / "w2v-id"
        self.proc = Wav2Vec2Processor.from_pretrained(path)
        self.model = Wav2Vec2ForCTC.from_pretrained(path).to(device).eval()
        self.device = device
        self.vocab = self.proc.tokenizer.get_vocab()
        self.blank = self.proc.tokenizer.pad_token_id
        self.delim = self.vocab.get("|")

    def align(self, wav, sr, text):
        """Waktu (mulai, selesai) per karakter `text`; karakter di luar kosakata diinterpolasi."""
        x = torchaudio.functional.resample(wav, sr, SR_ALIGN)[0]
        inputs = self.proc(x.numpy(), sampling_rate=SR_ALIGN, return_tensors="pt")
        with torch.inference_mode():
            logits = self.model(inputs.input_values.to(self.device)).logits
        emission = torch.log_softmax(logits, dim=-1).cpu()
        norm = text.lower()
        idx, toks = [], []
        for i, ch in enumerate(norm):
            if ch == " " and self.delim is not None:
                if toks and toks[-1] != self.delim:
                    idx.append(i)
                    toks.append(self.delim)
            elif ch in self.vocab:
                idx.append(i)
                toks.append(self.vocab[ch])
        while toks and toks[-1] == self.delim:
            toks.pop()
            idx.pop()
        frames = emission.shape[1]
        sec_per_frame = (x.shape[0] / SR_ALIGN) / frames
        aligned, scores = torchaudio.functional.forced_align(
            emission, torch.tensor([toks], dtype=torch.int32), blank=self.blank
        )
        # Blank model ini [PAD] (id 29), bukan 0 ('|'): wajib diteruskan, kalau tidak waktu bergeser.
        spans = torchaudio.functional.merge_tokens(aligned[0], scores[0].exp(), blank=self.blank)
        starts = [None] * len(text)
        ends = [None] * len(text)
        conf = []
        for span, i in zip(spans, idx):
            starts[i] = span.start * sec_per_frame
            ends[i] = span.end * sec_per_frame
            if toks and span.token != self.delim:
                conf.append(span.score)
        last = 0.0
        for i in range(len(text)):
            if starts[i] is None:
                starts[i] = ends[i] = last
            else:
                last = ends[i]
        return starts, ends, float(np.mean(conf)) if conf else 0.0


def trim(wav, sr, thresh_db=-42, pad=0.06):
    """Buang hening di awal/akhir kalimat, sisakan napas pendek."""
    x = wav[0].numpy()
    frame = int(sr * 0.02)
    energy = np.array([np.sqrt(np.mean(x[i : i + frame] ** 2) + 1e-12) for i in range(0, len(x) - frame, frame)])
    db = 20 * np.log10(energy + 1e-9)
    voiced = np.where(db > max(thresh_db, db.max() - 45))[0]
    if len(voiced) == 0:
        return wav
    a = max(0, voiced[0] * frame - int(pad * sr))
    b = min(len(x), (voiced[-1] + 1) * frame + int(pad * sr))
    return wav[:, a:b]


def load_tts(device):
    from chatterbox.tts import ChatterboxTTS

    return ChatterboxTTS.from_local(MODELS / "chatterbox-id", device)


def synth(tts, text, ref, seed, ex, cfg, temp):
    torch.manual_seed(seed)
    np.random.seed(seed)
    wav = tts.generate(text, audio_prompt_path=ref, exaggeration=ex, cfg_weight=cfg, temperature=temp)
    return wav.cpu().float()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--storyboard", default=str(ROOT / "scripts" / "video" / "tutorial" / "storyboard.json"))
    ap.add_argument("--out", default=str(ROOT / "data" / "video" / "tutorial" / "audio"))
    ap.add_argument("--ref", default=None, help="rekaman suara referensi (wav 10-20 dtk)")
    ap.add_argument("--only")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--takes", type=int, default=3)
    ap.add_argument("--exaggeration", type=float, default=0.5)
    ap.add_argument("--cfg", type=float, default=0.45)
    ap.add_argument("--temperature", type=float, default=0.75)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--sample", help="mode uji: satu teks, beberapa setelan")
    ap.add_argument("--realign", action="store_true", help="hitung ulang alignment dari WAV yang ada")
    args = ap.parse_args()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    if args.realign:
        aligner = Aligner(device)
        board = json.loads(pathlib.Path(args.storyboard).read_text(encoding="utf-8"))
        for seg in board["segments"]:
            wav_path, js = out / f"{seg['id']}.wav", out / f"{seg['id']}.json"
            if not wav_path.exists():
                continue
            meta = json.loads(js.read_text(encoding="utf-8"))
            say, pos_map = spoken(seg["tts"])
            wav, sr = torchaudio.load(str(wav_path))
            st, en, conf = aligner.align(wav, sr, say)
            meta["alignment"] = {
                "characters": list(seg["tts"]),
                "character_start_times_seconds": [st[min(pos_map[p], len(say) - 1)] for p in range(len(seg["tts"]))],
                "character_end_times_seconds": [en[min(pos_map[p], len(say) - 1)] for p in range(len(seg["tts"]))],
            }
            js.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + chr(10), encoding="utf-8")
            print(json.dumps({"id": seg["id"], "end": round(max(en), 2), "secs": round(wav.shape[1] / sr, 2), "conf": round(conf, 3)}), flush=True)
        return
    tts = load_tts(device)
    aligner = Aligner(device)
    print(json.dumps({"loaded_s": round(time.time() - t0, 1), "device": device}), flush=True)

    if args.sample:
        say, _ = spoken(args.sample)
        for name, ex, cfg, temp in [("a", 0.5, 0.5, 0.8), ("b", 0.4, 0.4, 0.7), ("c", 0.6, 0.35, 0.75)]:
            wav = trim(synth(tts, say, args.ref, args.seed, ex, cfg, temp), tts.sr)
            _, _, conf = aligner.align(wav, tts.sr, say)
            f = out / f"sample-{name}.wav"
            torchaudio.save(str(f), wav, tts.sr)
            print(json.dumps({"file": str(f), "ex": ex, "cfg": cfg, "temp": temp, "secs": round(wav.shape[1] / tts.sr, 2), "conf": round(conf, 3)}), flush=True)
        return

    board = json.loads(pathlib.Path(args.storyboard).read_text(encoding="utf-8"))
    only = set(args.only.split(",")) if args.only else None
    for seg in board["segments"]:
        if only and seg["id"] not in only:
            continue
        wav_path = out / f"{seg['id']}.wav"
        if wav_path.exists() and not args.force:
            print(json.dumps({"id": seg["id"], "skip": True}), flush=True)
            continue
        text = seg["tts"]
        say, pos_map = spoken(text)
        parts, cursor = [], 0.0
        starts_s = [0.0] * len(say)
        ends_s = [0.0] * len(say)
        offset = 0
        for k, sent in enumerate(sentences(say)):
            at = say.index(sent, offset)
            best = None
            for take in range(args.takes):
                wav = trim(synth(tts, sent, args.ref, args.seed + 101 * k + take, args.exaggeration, args.cfg, args.temperature), tts.sr)
                st, en, conf = aligner.align(wav, tts.sr, sent)
                secs = wav.shape[1] / tts.sr
                cps = len(sent) / max(secs, 0.1)
                # Tempo wajar narasi Indonesia ±11-17 karakter/detik; di luar itu kemungkinan cacat.
                penalty = 0.0 if 10.5 <= cps <= 18 else 0.25
                score = conf - penalty
                if best is None or score > best[0]:
                    best = (score, wav, st, en, conf, cps)
            _, wav, st, en, conf, cps = best
            for i in range(len(sent)):
                starts_s[at + i] = cursor + st[i]
                ends_s[at + i] = cursor + en[i]
            parts.append(wav)
            gap = 0.42 if sent.endswith("?") else 0.3
            cursor += wav.shape[1] / tts.sr
            if k < len(sentences(say)) - 1:
                parts.append(torch.zeros(1, int(gap * tts.sr)))
                cursor += gap
            offset = at + len(sent)
            print(json.dumps({"id": seg["id"], "sent": k, "conf": round(conf, 3), "cps": round(cps, 1)}), flush=True)
        # Celah antar-kalimat (spasi) mewarisi waktu karakter sebelumnya.
        last = 0.0
        for i in range(len(say)):
            if ends_s[i] == 0.0 and starts_s[i] == 0.0 and i > 0:
                starts_s[i] = ends_s[i] = last
            else:
                last = ends_s[i]
        full = torch.cat(parts, dim=1)
        peak = full.abs().max().item()
        if peak > 0:
            full = full * (0.89 / peak)
        torchaudio.save(str(wav_path), full, tts.sr)
        starts = [starts_s[min(pos_map[p], len(say) - 1)] for p in range(len(text))]
        ends = [ends_s[min(pos_map[p], len(say) - 1)] for p in range(len(text))]
        meta = {
            "text": text,
            "spoken": say,
            "model": "chatterbox-tts-indonesian",
            "ref": os.path.basename(args.ref) if args.ref else "bawaan",
            "settings": {"exaggeration": args.exaggeration, "cfg": args.cfg, "temperature": args.temperature, "takes": args.takes},
            "alignment": {"characters": list(text), "character_start_times_seconds": starts, "character_end_times_seconds": ends},
        }
        (out / f"{seg['id']}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(json.dumps({"id": seg["id"], "seconds": round(full.shape[1] / tts.sr, 2)}), flush=True)


if __name__ == "__main__":
    main()
