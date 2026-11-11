# Checklist Submission: Kartika Cyber Hackathon 2026

Deadline: **15 November 2026, 23:59 WIB**. Status per 11 November 2026.

| Item rulebook | Status | Lokasi / catatan |
|---|---|---|
| Link publik (repositori) | ☐ **Belum** | Repo belum punya remote. Tim perlu membuat repo publik (mis. GitHub), lalu `git push`. Pastikan `.env`, `data/`, `lab/output/`, `apps/desktop/release/` tidak ikut (sudah di `.gitignore`). |
| Thumbnail 1200×630, ≤ 500 KB | ☑ Sudah | [`thumbnail.png`](thumbnail.png): 1200×630, 40 KB. Dibuat ulang dengan `python scripts/make-thumbnail.py` dari `docs/metrics.json`. |
| Screenshot (maks. 5) | ☑ Sudah | [`screenshots/`](screenshots/): 5 JPG 1440 px (Pos Komando, Kontak, Linimasa, Aturan, Intel), diambil dengan `node scripts/capture-screenshots.mjs`. |
| Video demo ≤ 10 menit | ☐ **Belum** | Perlu direkam tim. Urutan yang disarankan ada di bawah. |
| Slide presentasi | ☐ **Belum** | Perlu dibuat tim. Bahan: README, `docs/architecture.md`, `docs/metrics.md`, `docs/prior-art.md`. |
| Dokumentasi | ☑ Sudah | `README.md`, `docs/architecture.md`, `docs/install.md`, `docs/metrics.md`, `docs/interrogation.md`, `docs/security-audit.md`, `docs/prior-art.md`, `docs/versions.md`. |
| (Opsional) Installer aplikasi desktop | ☑ Sudah dibangun | `pnpm desktop:installer` → `apps/desktop/release/NEXA-Pos-Komando-Setup-0.1.0.exe` (±107 MB, belum ditandatangani). Lampirkan ke rilis GitHub, bukan ke repo. |

## Urutan video yang disarankan (± 8 menit)

1. **Masalah (0:00–0:45):** agen AI penyerang murah dan tidak lelah; blokir statis kalah cepat.
2. **Arsitektur (0:45–1:45):** diagram `docs/architecture.md`, tekankan batas aman (tanpa LLM di
   jalur request, tanpa hack-back, deploy hanya dengan persetujuan).
3. **Demo langsung (1:45–5:30):** `pnpm demo -- --desktop --wait 15`.
   - Pos Komando: biaya penyerang naik secara langsung (SSE).
   - Kontak → linimasa: honeylink, umpan, canary dipakai, MCP umpan, balasan interogasi.
   - Aturan: draf tervalidasi `suricata -T`, tekan Setujui → aktif di Suricata.
   - Intel: ringkasan pasca-sesi (data disamarkan, budget harian).
4. **Hasil lab (5:30–7:00):** tabel `docs/metrics.md` dengan vs tanpa NEXA, false-positive 0/14,
   interogasi 2/10 dan 0/10 dilaporkan jujur.
5. **Prior art dan kontribusi (7:00–8:00):** `docs/prior-art.md`.

Semua tampilan memuat label "Data simulasi lab". Jangan menyebut "100% lokal" karena demo
memakai API DeepSeek.

## Sisa risiko (lihat juga `docs/security-audit.md`)

- Jalur Docker belum diverifikasi di mesin pengembang (Docker Desktop rusak); demo memakai mode
  lokal ditambah Suricata 8.0.6 di WSL.
- Dockerfile ketiga image sudah lengkap manifest-nya (dijaga test), tetapi build image belum
  diuji karena Docker tidak tersedia di mesin pengembang.
- Installer belum ditandatangani (peringatan SmartScreen).
- Sampel metrik kecil (3–6 run per kondisi); angka adalah median lab, bukan jaminan lapangan.
