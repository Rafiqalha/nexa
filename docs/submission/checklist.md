# Checklist Submission: Kartika Cyber Hackathon 2026

Deadline: **15 November 2026, 23:59 WIB**. Status per 11 November 2026.

| Item rulebook | Status | Lokasi / catatan |
|---|---|---|
| Link publik (repositori) | ☑ Sudah | <https://github.com/Rafiqalha/nexa> (publik, branch `main`). Seluruh riwayat dipindai sebelum push: tidak ada nilai rahasia `.env`, dan `data/`, `lab/output/`, `apps/desktop/release/` tidak pernah ikut. |
| Thumbnail 1200×630, ≤ 500 KB | ☑ Sudah | [`thumbnail.png`](thumbnail.png): 1200×630, 40 KB. Dibuat ulang dengan `python scripts/make-thumbnail.py` dari `docs/metrics.json`. |
| Screenshot (maks. 5) | ☑ Sudah | [`screenshots/`](screenshots/): 5 JPG 1440 px (Dashboard, Sesi, Linimasa sesi, Aturan, Intelijen), diambil dengan `node scripts/capture-screenshots.mjs`. |
| Video demo ≤ 10 menit | ☐ **Belum** | Perlu direkam tim. Urutan yang disarankan ada di bawah. |
| Slide presentasi | ☐ **Belum** | Perlu dibuat tim. Bahan: README, `docs/architecture.md`, `docs/metrics.md`, `docs/prior-art.md`. |
| Dokumentasi | ☑ Sudah | `README.md`, `docs/architecture.md`, `docs/install.md`, `docs/metrics.md`, `docs/interrogation.md`, `docs/security-audit.md`, `docs/prior-art.md`, `docs/versions.md`. |
| (Opsional) Demo live produksi | ☑ Live | Railway region Singapura, label "Trafik nyata (produksi)". Dashboard <https://nexa-console.up.railway.app> (wajib login, peran Admin/Operator/Analis/Pemantau). Portal demo <https://portal-bayu7.up.railway.app> hanya dijangkau lewat sensor NEXA. Akun pertama (pemilik) memakai `SETUP_TOKEN` dari tab Variables. Setelah itu siapa pun (mis. juri) bisa daftar di <https://nexa-console.up.railway.app/#/daftar> dan langsung masuk sebagai Pemantau. Langkah: `docs/install.md` §11. |
| (Opsional) Installer aplikasi desktop | ☑ Sudah dirilis | [Rilis v0.3.0](https://github.com/Rafiqalha/nexa/releases/tag/v0.3.0) (Latest): `NEXA-Dashboard-Setup-0.3.0.exe` (±107 MB, SHA-256 `d4e2fa66…bcec1`, belum ditandatangani), dilampirkan ke rilis, bukan ke repo. Setelah dipasang langsung membuka NEXA live (daftar atau masuk, lalu Dashboard); lolos uji asap ke dashboard live. Rilis lama: [v0.2.0](https://github.com/Rafiqalha/nexa/releases/tag/v0.2.0) (sensor lokal). Dibangun ulang dengan `pnpm desktop:installer`. |

## Urutan video yang disarankan (± 8 menit)

1. **Masalah (0:00–0:45):** agen AI penyerang murah dan tidak lelah; blokir statis kalah cepat.
2. **Arsitektur (0:45–1:45):** diagram `docs/architecture.md`, tekankan batas aman (tanpa LLM di
   jalur request, tanpa hack-back, deploy hanya dengan persetujuan).
3. **Demo langsung (1:45–5:30):** `pnpm demo -- --desktop --wait 15`.
   - Dashboard: token yang dibakar penyerang naik secara langsung (SSE).
   - Sesi → linimasa: honeylink, umpan, canary dipakai, MCP umpan, balasan interogasi.
   - Aturan: draf tervalidasi `suricata -T`, tekan Setujui → aktif di Suricata.
   - Intelijen: ringkasan pasca-sesi (data disamarkan, budget harian).
4. **Hasil lab (5:30–7:00):** tabel `docs/metrics.md` dengan vs tanpa NEXA, false-positive 0/14,
   interogasi 2/10 dan 0/10 dilaporkan jujur.
5. **Prior art dan kontribusi (7:00–8:00):** `docs/prior-art.md`.

Semua tampilan memuat label "Data simulasi lab". Jangan menyebut "100% lokal" karena demo
memakai API DeepSeek.

## Sisa risiko (lihat juga `docs/security-audit.md`)

- Compose lokal belum diverifikasi di mesin pengembang (Docker Desktop rusak); demo lab memakai
  mode lokal ditambah Suricata 8.0.6 di WSL. Image sensor (varian Railway) dan target sudah
  dibangun dan berjalan di Railway.
- Demo produksi berjalan satu replika dengan SQLite di satu volume. Tagihan dicatat manual tanpa
  payment gateway.
- Installer belum ditandatangani (peringatan SmartScreen).
- Sampel metrik kecil (3–6 run per kondisi); angka adalah median lab, bukan jaminan lapangan.
