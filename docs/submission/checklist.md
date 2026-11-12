# Checklist Submission: Kartika Cyber Hackathon 2026

Deadline: **15 November 2026, 23:59 WIB**. Status per 12 November 2026.

| Item rulebook | Status | Lokasi / catatan |
|---|---|---|
| Link publik (repositori) | ☑ Sudah | <https://github.com/Rafiqalha/nexa> (publik, branch `main`). Seluruh riwayat dipindai sebelum push: tidak ada nilai rahasia `.env`, dan `data/`, `lab/output/`, `apps/desktop/release/` tidak pernah ikut. |
| Thumbnail 1200×630, ≤ 500 KB | ☑ Sudah | [`thumbnail.png`](thumbnail.png): 1200×630, ±175 KB. Logo Simpul, font Geist dan JetBrains Mono, metrik dari `docs/metrics.json`, dan potongan UI dari screenshot Dashboard. Dibuat ulang dengan `node scripts/make-thumbnail.mjs`, yang juga menyalinnya ke `apps/landing/public/og.png`. |
| Screenshot (maks. 5) | ☑ Sudah | [`screenshots/`](screenshots/): 5 JPG 2880×1800 (viewport 1440×900 skala 2, ≤ 500 KB per berkas): Dashboard, Sesi, Linimasa sesi, Aturan, Intelijen. Data dari run lab nyata 11 November (salinan `data/nexa.db`), berlabel "Data simulasi lab". Diambil 12 November dengan `node scripts/capture-screenshots.mjs --base http://localhost:8081/ --demo-login --session <uuid>`; langkahnya ada di kepala skrip. |
| Video demo ≤ 10 menit | ☑ Sudah diunggah | YouTube (publik, bisa dibuka tanpa login): <https://www.youtube.com/watch?v=nwJ-t0En_Hw> (pendek: <https://youtu.be/nwJ-t0En_Hw>); deskripsinya memuat daftar bab dan tautan. Berkas sumber `data/video/nexa-tutorial.mp4` (lokal, diabaikan git): video tutorial 6:14, 1920×1080 30 fps, 6 bab, narasi pria Bahasa Indonesia yang dibuat lokal di GPU dengan Chatterbox (bobot fine-tune `grandhigh/Chatterbox-TTS-Indonesian`, suara bawaan model), subtitle tertanam + `nexa-tutorial.srt`, musik dan efek suara orisinal. Footage dari satu run `lab:attack` nyata 12 November (sesi `dafdcae9`), berlabel "Data simulasi lab". Daftar bab untuk deskripsi YouTube: `data/video/tutorial/youtube-bab.txt`. Naskah dan cara membuat ulang: [`video-naskah.md`](video-naskah.md); riset gaya: [`video-riset.md`](video-riset.md). Versi pertama (`nexa-demo.mp4`, 4:34, suara Edge) sudah digantikan. |
| Slide presentasi | ☑ Sudah (Google Slides, 13 November) | Tautan untuk formulir: <https://docs.google.com/presentation/d/1ZFytmnus3Nx07d3tby3v9yFwH7eItUwQf9IHT8Cfbdk/edit?usp=sharing> (judul "NEXA_Tim Martex"; siapa saja yang memiliki link bisa melihat). Dicek tanpa login 13 November: ekspor PDF publik berisi 14 slide 16:9 yang identik dengan [`slides.pdf`](slides.pdf), dan 9 tautan di slide 12 dan 14 bisa diklik. Isi: judul (Tim Martex), masalah, cara kerja, arsitektur, teknologi, fitur dashboard (3 slide dari `screenshots/`), hasil lab (2 slide), keamanan & etika, cara mencoba (termasuk video YouTube), roadmap, penutup. Tiap slide berupa render penuh dari PDF, dengan teks slide di catatan pembicara, jadi teksnya tidak diedit langsung di Google Slides. Sumber HTML + CSS di [`slides/`](slides/): `node scripts/make-slides.mjs` mencetak PDF (dan menolak angka yang tidak cocok dengan `docs/metrics.json`), lalu `python scripts/make-slides-pptx.py` membuat `.pptx` untuk diimpor ulang ke deck yang sama (File → Impor slide, lalu hapus slide lama) agar tautannya tetap. Angka berlabel "Data simulasi lab"; interogasi tampil sebagai eksperimental (2/11 dibelokkan, 0/11 bocor penuh). PDF yang sama ada di repo sebagai cadangan. |
| Dokumentasi | ☑ Sudah | `README.md`, `docs/architecture.md`, `docs/install.md`, `docs/metrics.md`, `docs/interrogation.md`, `docs/security-audit.md`, `docs/prior-art.md`, `docs/versions.md`. |
| (Opsional) Demo live produksi | ☑ Live | Railway region Singapura, label "Trafik nyata (produksi)". Dashboard <https://nexa-console.up.railway.app> (wajib login, peran Admin/Operator/Analis/Pemantau). Portal demo <https://portal-bayu7.up.railway.app> hanya dijangkau lewat sensor NEXA. Akun pertama (pemilik) memakai `SETUP_TOKEN` dari tab Variables. Setelah itu siapa pun (mis. juri) bisa daftar di <https://nexa-console.up.railway.app/#/daftar> dan langsung masuk sebagai Pemantau. Langkah: `docs/install.md` §11. |
| (Opsional) Installer aplikasi desktop | ☑ Sudah dirilis | [Rilis v0.3.1](https://github.com/Rafiqalha/nexa/releases/tag/v0.3.1) (Latest, 12 November): `NEXA-Dashboard-Setup-0.3.1.exe` (±107 MB, SHA-256 `d1fb892c…c6272`, belum ditandatangani), dilampirkan ke rilis, bukan ke repo. Ikon aplikasi dan installer memakai logo Simpul. Setelah dipasang langsung membuka NEXA live (daftar atau masuk, lalu Dashboard); lolos uji asap (`--smoke-test`) ke dashboard live. Rilis lama: [v0.3.0](https://github.com/Rafiqalha/nexa/releases/tag/v0.3.0) (logo lama), [v0.2.0](https://github.com/Rafiqalha/nexa/releases/tag/v0.2.0) (sensor lokal). Dibangun ulang dengan `pnpm desktop:installer`. |

## Struktur video tutorial (6:14)

1. **Pembuka (0:00–0:25):** cold open saat agen sudah terjebak (kamera ke status Terjebak dan
   penghitung token), lalu judul, salam untuk dewan juri, dan agenda.
2. **01 Masalah (0:25–0:54):** agen AI penyerang murah dan tidak lelah; blokir statis kalah cepat.
3. **02 Cara kerja (0:54–1:59):** kanvas arsitektur beranimasi: 4 sinyal deteksi, ambang skor,
   labirin prosedural tanpa LLM di jalur request, canary, redaksi lalu LLM dengan budget, draf
   aturan Suricata yang menunggu persetujuan operator.
4. **03 Memasang NEXA (1:59–2:40):** prasyarat (Git, Node 20+, pnpm; Docker dan Suricata
   opsional), `pnpm install`, `pnpm env:init`, `pnpm lab:up`, dashboard di port 8081, aplikasi
   desktop Windows.
5. **04 Demo langsung (2:40–5:04):** portal BAYU-7 untuk pengunjung biasa; `pnpm lab:attack`
   dengan panel terminal agen; terdeteksi kurang dari 2 detik dan token terus terbakar; Sesi
   (skor, sinyal, canary), linimasa labirin (robots.txt, honeylink, server MCP umpan), Intelijen
   (pola, dugaan model, budget), Aturan (validasi, Setujui, riwayat keputusan, ekspor), lalu
   Pengguna dan Log audit.
6. **05 Hasil lab (5:04–5:53):** angka dari `docs/metrics.json`: 11/11 terdeteksi (median 1,8
   detik), 2 dari 35 permintaan sampai aplikasi asli (tanpa NEXA 58/58), lebih dari 200 ribu token
   agen per run berbanding ±3 ribu token intel NEXA, 0/14 manusia ditandai, interogasi 2/11 dan
   0/11 dilaporkan apa adanya.
7. **06 Penutup (5:53–6:14):** tautan dashboard live, landing, repositori, dan rilis desktop.

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
