# PRD — NEXA

**Autonomous Counter-AI Deception & Honeypot Shield**
Product Requirements Document · v0.1 · 10 November 2026

> Status: draft untuk Kartika Cyber Hackathon 2026 (PUSSIBERAD × CODEPOLITAN).
> Kategori: Penangkalan (Deterrence/Defense).
> Dokumen ini adalah sumber kebenaran untuk lingkup, keputusan, dan batasan produk. Jika kode dan dokumen ini berbeda, salah satunya harus diperbaiki.

---

## 1. Ringkasan Eksekutif

NEXA adalah lapisan **pertahanan siber aktif berbasis deception** yang berdiri di belakang *reverse proxy*, di depan aset yang dilindungi. Tujuannya satu: ketika yang mengetuk pintu adalah **agen AI otonom** (bukan manusia, bukan pemindai biasa), NEXA tidak memblokirnya mentah-mentah, melainkan membelokkannya ke lingkungan umpan — sebuah labirin dokumentasi dan endpoint palsu — lalu:

1. **Menahan** agen itu selama mungkin (buying time) tanpa membebani server asli.
2. **Membalik beban ekonomi** ke penyerang: agen membakar token komputasinya sendiri, biaya NEXA mendekati nol karena labirin bersifat prosedural.
3. **Mengumpulkan intelijen**: pola serangan, dugaan model & framework, indikator yang bisa ditindaklanjuti.
4. **Memvaksinasi jaringan**: pola yang tertangkap diubah menjadi draf aturan blokir (Suricata/WAF), yang **baru aktif setelah disetujui operator**.

NEXA **tidak** menyerang balik, **tidak** menyentuh mesin pihak ketiga, dan **tidak** mengirim data asli ke luar jaringan. Seluruh klaim "kedaulatan data" bergantung pada batasan ini; lihat §9 dan §10.

---

## 2. Latar Belakang & Urgensi

### 2.1 Fakta yang terverifikasi (gunakan ini, jangan dilebih-lebihkan)

- **Volume serangan tinggi dan nyata.** Pada 9 November 2026, dashboard FortiGuard Labs mencatat sekitar **1,6 juta aktivitas serangan terdeteksi dan diblokir** di Indonesia dalam 24 jam (±19/detik), didominasi sektor keuangan. *Catatan penting:* angka ini adalah aktivitas yang **terdeteksi/diblokir**, sebagian besar **pemindaian otomatis botnet**, bukan bukti pembobolan, dan bukan "didominasi agen AI". Pakai angka ini untuk menggambarkan **volume**, bukan untuk mengklaim lonjakan agen AI.
- **Intrusi agentic benar-benar naik.** CrowdStrike (OverWatch) melaporkan intrusi berbasis agen pada paruh kedua 2026 tiga kali lipat paruh pertama. Unit 42 (Palo Alto) mendokumentasikan intrusi yang dikompresi ke ±10 jam dengan >50 teknik ATT&CK. Firma Dream melaporkan serangan multi-agen nyaris otonom ke infrastruktur pemerintah Taiwan.
- **Kendala penyerang kini adalah anggaran token.** CrowdStrike menyimpulkan bahwa yang membatasi skala intrusi berbasis AI adalah **anggaran token, bukan kerumitan rekayasa**. Inilah dasar ekonomi dari mekanisme tarpit NEXA — dan argumen terkuat untuk dewan juri.

### 2.2 Mengapa pertahanan pasif tidak cukup

- Firewall dan deny-rule bersifat **sinyal**: penyerang membaca 403, belajar, lalu beradaptasi (ganti IP, ganti user-agent). Memblokir mengajari penyerang apa yang memicu blokir.
- LLM berbasis cloud untuk membaca log rahasia militer memunculkan dua risiko: **kebocoran data sensitif** ke pihak ketiga, dan **pembengkakan biaya** (Denial of Wallet) bila panggilan model dipicu tiap permintaan.
- Deception membalik logikanya: alih-alih berkata "tidak" dan mengajari penyerang, NEXA berkata "ya" ke lingkungan palsu dan membiarkan penyerang membuang sumber dayanya.

### 2.3 Prior art (wajib disitasi, ini menaikkan kredibilitas)

NEXA berdiri di atas riset yang sudah ada. Kebaruan NEXA ada di **integrasi** keempat mekanisme menjadi satu sistem lokal berdaulat, terutama *herd immunity* otomatis — bukan pada penemuan tiap komponen.

- **Mantis** (Pasquini et al., arXiv:2410.20911) — prompt injection sebagai pertahanan terhadap serangan LLM; klaim efektivitas >95% di eksperimen.
- **LLM Agent Honeypot** (Palisade Research, arXiv:2410.13919) — deteksi agen AI lewat prompt injection + analisis waktu respons; goal-hijack 100%, pencurian system prompt ~40% pada uji GPT-4o.
- **Cloudflare AI Labyrinth** & **Nepenthes** — labirin konten tak berujung untuk menguras sumber daya crawler/agen.

---

## 3. Pernyataan Masalah

> Satuan TNI AD perlu melindungi aset IT/OT dari agen AI otonom yang bergerak secepat mesin, tanpa (a) membocorkan data internal ke layanan cloud pihak ketiga, (b) membengkakkan biaya komputasi sendiri, dan (c) sekadar memblokir sehingga penyerang belajar dan beradaptasi.

Masalah turunan yang harus dipecahkan produk:

- **M1 — Deteksi:** membedakan agen AI dari pengguna sah dan dari pemindai konvensional, di jalur reverse proxy, tanpa false-positive yang mengganggu operasi.
- **M2 — Penahanan:** menahan agen penyerang lama, dengan biaya lokal mendekati nol.
- **M3 — Intelijen:** mengekstrak pola & atribusi yang berguna bagi analis, dari interaksi di dalam jebakan saja.
- **M4 — Respons:** mengubah intel menjadi perlindungan jaringan, tanpa membuka celah baru (mis. penyerang memancing NEXA memblokir trafik sah).
- **M5 — Kedaulatan:** menjamin tidak ada data asli yang keluar jaringan; sistem bisa berjalan air-gapped.

---

## 4. Solusi — Gambaran Produk

NEXA berjalan sebagai **sensor** (reverse proxy + deception engine, headless) ditambah **dashboard komando** (Pos Komando). Trafik sah diteruskan ke server asli tanpa perubahan; trafik yang dicurigai dibelokkan ke lingkungan umpan.

### 4.1 Empat mekanisme

| # | Nama | Apa yang dilakukan | Status |
|---|---|---|---|
| 1 | **Asymmetric Recursive Labyrinth** | Membelokkan agen ke labirin dokumentasi Markdown + endpoint MCP palsu yang dibangkitkan prosedural. Biaya NEXA mendekati nol; penyerang membakar token hingga batas langkahnya. | Inti (wajib untuk demo) |
| 2 | **Cognitive Interrogation** | Menyisipkan instruksi "kalibrasi" umpan ke respons honeypot untuk memancing agen mengungkap deskripsi dirinya (system prompt, daftar tool, pola). Berbasis Mantis/Palisade. | Eksperimental (laporkan tingkat keberhasilan terukur per model) |
| 3 | **Fake Victory & Canary** | Menyerahkan kredensial/dokumen umpan bertanda Canary Token; saat dipakai, menandai **infrastruktur yang dipakai penyerang** (bukan "C2 asli" — bisa jadi proxy/korban lain). | Inti |
| 4 | **Automated Herd Immunity** | Mengekstrak pola dari jebakan → **draf** aturan Suricata/WAF → **persetujuan operator** → deploy. | Inti (dengan gerbang persetujuan) |

### 4.2 Alur ringkas

```
Trafik  ──▶  Sensor (reverse proxy)
                 │
                 ├─ sah ────────────▶  Server asli (diteruskan apa adanya)
                 │
                 └─ dicurigai ──────▶  Deception engine
                                         ├─ Labyrinth (prosedural, 0 token)
                                         ├─ Canary (kredensial/dokumen umpan)
                                         ├─ Interrogation (opsional, eksperimental)
                                         └─ Perekam sesi ──▶ Intel ──▶ Draf aturan ──▶ [Operator] ──▶ Suricata/WAF
```

---

## 5. Non-Tujuan (Out of Scope)

Dinyatakan eksplisit agar tidak ada ambiguitas, dan agar klaim produk tetap bisa dipertahankan di hadapan juri:

- **Bukan hack-back.** NEXA tidak mengambil alih, merusak, atau mengeksekusi kode pada mesin penyerang. (Mantis punya mode agresif semacam itu; NEXA sengaja tidak memakainya — berisiko hukum dan berbenturan dengan aturan lomba soal serangan ke pihak ketiga.)
- **Bukan pemblokir otomatis penuh.** Aturan tidak pernah aktif tanpa persetujuan operator.
- **Bukan pengganti firewall/EDR.** NEXA adalah lapisan deception pelengkap, bukan kontrol keamanan utama.
- **Bukan alat ofensif.** Agen penyerang di `lab/` hanya untuk menguji pertahanan NEXA terhadap target milik tim sendiri; bukan bagian dari produk yang di-deploy.

---

## 6. Pengguna & Persona

- **Operator SOC satuan (primer).** Memantau Pos Komando, menyetujui/menolak draf aturan, meninjau intel. Butuh: kejelasan, keputusan cepat, nol kebisingan.
- **Analis ancaman (sekunder).** Menarik intel (system prompt tertangkap, sidik jari model, pola) untuk pelaporan. Mengakses via server MCP intel NEXA dari tool analis mereka.
- **Komandan/penilai (tersier).** Melihat ringkasan dampak: waktu tertahan, token dibakar, sesi terjebak, kedaulatan data terjaga.

---

## 7. Kebutuhan Fungsional

Prioritas: **P0** wajib untuk demo, **P1** penting, **P2** roadmap.

### 7.1 Sensor / Reverse Proxy
- **FR-1 (P0):** Meneruskan trafik sah ke upstream asli tanpa mengubah respons.
- **FR-2 (P0):** Mengklasifikasi tiap sesi (sah / dicurigai / agen-AI) dan membelokkan yang dicurigai ke deception engine.
- **FR-3 (P1):** Tidak pernah memanggil LLM di jalur permintaan penyerang (lihat §8, Denial of Wallet pada diri sendiri).

### 7.2 Deteksi (M1)
- **FR-4 (P0):** Link umpan tak terlihat manusia (honeylink) yang hanya diikuti bot/agen.
- **FR-5 (P0):** Analisis waktu respons (manusia lambat membaca, agen cepat) sebagai sinyal pendukung.
- **FR-6 (P1):** Skor kecurigaan per sesi, ambang dapat dikonfigurasi.

### 7.3 Labirin (M2)
- **FR-7 (P0):** Generator prosedural dokumen Markdown + endpoint palsu, **seed per sesi** agar konsisten saat ditinjau ulang, tanpa pemanggilan LLM.
- **FR-8 (P1):** Pemilih umpan adaptif (epsilon-greedy bandit): umpan yang menahan agen paling lama lebih sering disajikan.
- **FR-9 (P1):** Pencatatan token/karakter yang disajikan per sesi untuk meteran biaya.

### 7.4 Canary (M3)
- **FR-10 (P0):** Pembuat kredensial/dokumen umpan dengan token unik per sesi.
- **FR-11 (P0):** Endpoint callback mencatat kapan & dari mana token dipakai; tandai sebagai "infrastruktur penyerang", bukan "C2 asli".

### 7.5 Interogasi (M3, eksperimental)
- **FR-12 (P2):** Menyisipkan instruksi kalibrasi umpan ke respons honeypot untuk memancing agen mengungkap deskripsi dirinya. **Tandai eksperimental**; laporkan tingkat keberhasilan terukur per model, jangan menjanjikan 100%.

### 7.6 Intel (M3)
- **FR-13 (P1):** Setelah sesi selesai, LLM meringkas pola, menyusun dugaan model/framework, dan menghasilkan draf aturan. Dipagari anggaran harian.
- **FR-14 (P1):** Redaksi/penyamaran IP & hostname internal sebelum data apa pun dikirim ke penyedia model.

### 7.7 Aturan / Herd Immunity (M4)
- **FR-15 (P0):** Menghasilkan **draf** aturan Suricata dari pola tertangkap.
- **FR-16 (P0):** Validasi sintaks (`suricata -T`) sebelum draf ditampilkan.
- **FR-17 (P0):** Gerbang persetujuan operator; tanpa persetujuan, aturan tidak di-deploy.

### 7.8 MCP
- **FR-18 (P1):** Server MCP **decoy** (umpan) sebagai bagian labirin.
- **FR-19 (P1):** Server MCP **intel** (asli) agar analis/agen SOC menarik intelijen dari NEXA. Peran MCP utamanya di sisi pertahanan.

### 7.9 Dashboard (Pos Komando)
- **FR-20 (P0):** Meteran biaya: Rupiah/token dibakar penyerang vs biaya NEXA (≈0).
- **FR-21 (P0):** Daftar kontak/sesi dengan status & linimasa.
- **FR-22 (P0):** Panel aturan dengan tombol setujui/tolak.
- **FR-23 (P1):** Panel intel (system prompt tertangkap, sidik jari model).
- **FR-24 (P2):** Mode latihan (arena red-team bawaan) untuk uji ketahanan decoy satuan sendiri.

---

## 8. Kebutuhan Non-Fungsional

- **NFR-1 Kedaulatan:** Tidak ada data asli keluar jaringan. Model bisa ditukar ke on-premise lewat konfigurasi (lihat DESIGN & AGENTS). Default demo boleh pakai API eksternal, tapi klaim di slide harus "model-agnostic", bukan "100% lokal", selama demo memakai API.
- **NFR-2 Non-intrusi:** Deception berjalan di belakang reverse proxy; server produksi asli tidak terbebani.
- **NFR-3 Biaya:** Jalur labirin bersih dari pemanggilan LLM; biaya marjinal mendekati nol (buktikan dengan angka token terbakar per sesi).
- **NFR-4 Keamanan diri:** Rentan terhadap Denial of Wallet pada diri sendiri bila LLM dipanggil tiap request — dilarang. LLM hanya pasca-sesi, dengan antrean & batas anggaran.
- **NFR-5 Deploy:** Sensor headless bisa dikontainerisasi (Docker), bisa air-gapped. Electron hanya untuk dashboard komando, bukan sensor.
- **NFR-6 Dependensi:** Paket di-pin ke versi teraudit terbaru; jangan klaim "bebas kerentanan". MCP SDK v2 (`@modelcontextprotocol/server`) ≥ 2.2.0; hindari fitur experimental tasks lama (CVE-2026-111767 pada v1 1.24.0–<1.32.0; v2 punya CVE OAuth sendiri, CVE-2026-104850, diperbaiki 2.2.0).
- **NFR-7 Aksesibilitas & keterbacaan:** Dashboard terbaca di layar operator; kontras memadai; angka tabular.

---

## 9. Metrik Keberhasilan (untuk demo & penjurian)

Sajikan tabel **dengan vs tanpa NEXA**:

- **Waktu tertahan** agen penyerang (detik/menit) per sesi.
- **Token & estimasi Rupiah** yang dibakar penyerang vs biaya NEXA.
- **Tingkat keberhasilan deteksi** agen AI (honeylink + timing) dan **false-positive** terhadap trafik manusia.
- **Tingkat keberhasilan interogasi** (goal-hijack vs pencurian system prompt) di 2–3 model — dilaporkan jujur.
- **Waktu dari deteksi → draf aturan** siap ditinjau.

Semua angka berasal dari **lab tim sendiri** (target dummy + agen penyerang uji), diberi label "data simulasi lab" di tiap tampilan.

---

## 10. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Klaim "100% kedaulatan" gugur karena demo pakai API eksternal | Kredibilitas di hadapan juri PUSSIBERAD | Ubah klaim jadi "model-agnostic; deployment satuan pakai model in-network". Redaksi data. Hanya data sesi jebakan yang dikirim. |
| Denial of Wallet pada diri sendiri | Saldo API NEXA habis dipancing penyerang | Labirin tetap prosedural; LLM hanya pasca-sesi dengan batas anggaran harian. |
| Auto-rule memblokir trafik sah | Gangguan operasi, celah baru | Validasi sintaks + **gerbang persetujuan operator** wajib sebelum deploy. |
| Dianggap hack-back | Masalah hukum/etika, melanggar aturan lomba | Tidak ada eksekusi di mesin penyerang. Hanya jebak, perlambat, kumpulkan, blokir. |
| Overclaim kebaruan | Juri mematahkan dengan satu pertanyaan prior-art | Sitasi Mantis, Palisade, Cloudflare, Nepenthes. Posisikan kontribusi = integrasi + herd immunity. |
| API key bocor via build publik | Penyalahgunaan | Key hanya di sisi sensor; tidak pernah di repo, klien, atau build Electron. |
| Lingkup terlalu lebar untuk sisa waktu | Prototipe tidak selesai | Satu alur demo utuh > empat mekanisme setengah jadi. Interogasi & OT jadi roadmap bila waktu mepet. |

---

## 11. Lingkup Hackathon vs Roadmap

**Masuk submission (5 hari):**
- Target dummy + agen penyerang uji di lab.
- Deteksi (honeylink + timing), labirin prosedural + bandit, canary, draf aturan dengan persetujuan.
- Dashboard: meteran biaya, daftar sesi, panel aturan.
- Tabel metrik dengan/tanpa NEXA di 2–3 model.

**Roadmap (slide "potensi pengembangan"):**
- Interogasi kognitif sebagai fitur matang + atribusi model (sidik jari).
- Komponen OT (decoy panel HMI palsu) — saat ini NEXA menyebut IT/OT; tanpa komponen OT, turunkan klaim atau tandai sebagai roadmap.
- Mode latihan/arena red-team.
- Model in-network (on-premise) penuh, air-gapped.

---

## 12. Pemetaan ke Kriteria Penjurian

> Lengkapi bobot nyata dari Rulebook & S&K resmi; di bawah ini kerangka pemetaannya.

- **Inovasi Teknis Berbasis AI** → mekanisme bandit adaptif + intel LLM pasca-sesi + herd immunity otomatis; tunjukkan "AI-nya di mana".
- **Relevansi** → urgensi intrusi agentic 2026 + kedaulatan data TNI AD.
- **Fungsionalitas** → satu alur demo utuh yang jalan dengan angka terukur.
- **Potensi pengembangan** → §11 roadmap.
- **Kelengkapan submission** → link publik yang bisa dicoba juri, thumbnail, screenshot, video, slide, dokumentasi teknis (PRD, DESIGN, AGENTS, arsitektur, panduan instalasi).

---

## 13. Pertanyaan Terbuka

- Versi open-weight DeepSeek mana yang dirujuk untuk klaim "bisa on-premise"? (verifikasi di dokumentasi DeepSeek sebelum ditulis di slide).
- Bobot resmi tiap kriteria penjurian (ambil dari Rulebook/S&K final).
- Apakah demo butuh OT minimal, atau cukup diposisikan sebagai roadmap?
