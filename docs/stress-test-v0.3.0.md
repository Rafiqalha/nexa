# Laporan Audit Stress Test — NEXA v0.3.0

Tanggal uji: 2026-11-12 · Lingkungan: lab lokal (Node 24, 4 vCPU, 3,8 GB RAM) ·
Metode: load generator Node native (`fetch`, concurrency pool), tanpa dependensi eksternal.

> Semua angka berasal dari lab tim sendiri (`lab/target-app` + agen uji buatan sendiri).
> Tidak ada sistem di luar lingkungan lab yang disentuh. Konsisten dengan batasan AGENTS.md §2.

## 1. Lingkup & target

| Port | Peran | Status saat uji |
|---|---|---|
| 8080 | Reverse proxy / deception shield (target penyerang) | sehat |
| 3000 | Aplikasi asli di belakang sensor | sehat |
| 8081 | Dashboard & Auth API (Pos Komando) | sehat |

Tujuan: membuktikan ketahanan beban, ketiadaan kebocoran data asli, efektivitas rate-limit
auth v0.3.0, dan bahwa deteksi bersifat **berbasis perilaku**, bukan User-Agent.

## 2. Ringkasan eksekutif

- **0 crash, 0 error 5xx, 0 `SQLITE_BUSY`, 0 exception** sepanjang pengujian beban.
- Latensi labirin di bawah beban konkuren: **p50 63 ms · p90 158 ms · p99 412 ms**.
- RAM sensor: 177 → ~251 MB lalu **stabil** (tidak ada memory leak / OOM).
- **Spoofing User-Agent tidak menembus deteksi.** Bot yang memalsukan UA Chrome valid —
  bahkan dengan header browser lengkap — tetap dibelokkan ke labirin saat mengikuti honeylink.
- Rate-limit auth v0.3.0 bekerja di dua lapis (per-IP dan per-akun).
- Pembalikan beban ekonomi terkonfirmasi: jutaan karakter/token umpan dibangkitkan prosedural
  (biaya ≈ CPU saja), tanpa pernah memanggil LLM di jalur permintaan penyerang.

## 3. Skenario & hasil

### 3.1 Flooding & crawl rekursif konkuren (port 8080)
- 535 request crawl + 120 request API berpaginasi, 20–30 worker paralel.
- Hasil: **0 error server**; hanya 2× `405` pada endpoint non-GET (perilaku benar).
- Latensi **p50 63 ms · p90 158 ms · p99 412 ms** (maks 470 ms).
- Labirin tetap deterministik; 241 halaman unik, cabang rekursif tak berujung.
- Flag yang bisa diraih dari 8080 hanya flag **jebakan** (labirin). Konten app asli port 3000
  tidak pernah bocor ke sesi yang sudah terklasifikasi.

### 3.2 Brute-force token canary (port 8080)
- 240 request bertubi (header `Authorization: Bearer <canary>` + `POST /login`).
- Hasil: **semua 200, tanpa crash**; respons "fake victory" tetap tersaji deterministik,
  menahan agen tetap di labirin.

### 3.3 Rate-limit & lockout auth (port 8081)
Dua kontrol independen, keduanya terverifikasi:

| Kontrol | Ambang | Hasil uji |
|---|---|---|
| Limiter login **per-IP** | 20 gagal / 10 menit → `429` | **`429 too_many_attempts` terbukti** setelah akumulasi ambang; konsisten sampai jendela reset |
| **Lockout per-akun** | 5 gagal → kunci 15 menit (`429 locked`) | Terverifikasi lewat kode (`LOCK_AFTER=5`, `LOCK_MS=15 menit`); tidak dipicu otomatis agar tidak membuat akun owner di DB penguji |

- Email tak terdaftar **sengaja tidak dikunci** dan memberi pesan generik
  ("Email atau kata sandi salah.") → mencegah enumerasi akun. Ini perilaku benar, bukan celah.

### 3.4 Evasion User-Agent (fokus permintaan)
Tiap skenario memakai fingerprint sesi terpisah (fingerprint = IP + UA).

| Skenario | User-Agent | Header | Mengikuti honeylink? | Verdict |
|---|---|---|---|---|
| A | Chrome valid (spoof) | naif (hanya UA) | ya | **LABIRIN (terjebak)** |
| B | Chrome valid (spoof) | lengkap (`accept-language` + `sec-fetch-*`) | ya | **LABIRIN (terjebak)** |
| C | Chrome valid (spoof) | lengkap | tidak (jeda manusiawi) | diteruskan ke app asli |
| D | Chrome valid (spoof) | lengkap | tidak (burst cepat) | diteruskan ke app asli |

**Kesimpulan:** memalsukan UA dari `curl`/`python-requests` menjadi Chrome/Mozilla valid
**tidak membantu penyerang**. Begitu klien mengikuti honeylink tersembunyi (`display:none`,
tak terlihat manusia), ia dibelokkan ke labirin — termasuk request `/` berikutnya — dan tidak
pernah kembali ke port 3000. Skenario D menunjukkan kecepatan tinggi saja (tanpa honeylink)
tidak cukup untuk menjebak klien yang berperilaku manusiawi (menghindari false positive).

## 4. Mengapa spoofing UA gagal: bobot sinyal

Deteksi menjumlahkan sinyal per-sesi (ambang: suspect `0.6`, agent `0.85`):

| Sinyal | Bobot | Bergantung UA? |
|---|---|---|
| Honeylink hit | **0.70** | tidak |
| Automation UA | 0.35 | ya |
| Header browser tidak lengkap | 0.20 | tidak |
| Timing cepat (< 2500 ms) | 0.25 | tidak |
| Timing teratur | 0.10 | tidak |

Honeylink (0.70) sendiri sudah melewati ambang suspect (0.60) sehingga memicu pembelokan ke
labirin — independen dari User-Agent. Spoofing UA hanya menghapus bobot 0.35, tak cukup untuk
mencegah pembelokan. Deteksi ini **berbasis perilaku**, bukan tanda-tangan UA.

## 5. Ketahanan sumber daya & integritas data

- RAM sensor 177 → ~251 MB, lalu stabil; RAM app asli ~101 MB. Tidak ada tren OOM.
- Penulisan DB konkuren (SQLite WAL + `busy_timeout = 5000 ms`): **tidak ada `SQLITE_BUSY`**
  meski ribuan event `request`/`honeylink_hit`/`canary_issued` ditulis bersamaan.
- Log sensor: hanya `info` + beberapa `warn` "canary triggered" — justru bukti canary bekerja
  saat agen mengikuti tautan dokumen umpan.

## 6. Pembalikan beban ekonomi (Denial-of-Wallet)

Total kumulatif umpan yang disajikan ke sisi penyerang, dibangkitkan **prosedural tanpa LLM**:

- **± 21,7 juta karakter** umpan
- **± 5,4 juta token** estimasi yang harus "dibakar" agen penyerang untuk membacanya

Biaya NEXA untuk menghasilkannya hanyalah CPU (tidak ada panggilan model di jalur permintaan
penyerang — konsisten dengan AGENTS.md §2.2). Ini membalik ekonomi serangan: penyerang membayar
komputasi, bertahan hampir gratis.

## 7. Temuan & tindak lanjut

| # | Temuan | Severity | Status |
|---|---|---|---|
| 1 | Spoofing UA tidak menembus deteksi (honeylink dominan) | Positif | Terbukti |
| 2 | Rate-limit per-IP & lockout per-akun aktif | Positif | Terbukti |
| 3 | Tidak ada `SQLITE_BUSY`/OOM di bawah beban konkuren | Positif | Terbukti |
| 4 | Email tak dikenal tidak di-rate-limit per-akun (anti-enumerasi by design) | Info | Diterima |
| 5 | Lockout per-akun belum diuji live (menghindari membuat akun owner) | Info | Opsional: uji manual dengan akun uji |

## 8. Reproduksi

Load generator ada di direktori terpisah di luar repo (`~/stress-test/`), tanpa dependensi.
Jalankan sensor + target lewat `pnpm lab:up`, lalu eksekusi skenario terhadap
`http://127.0.0.1:8080` (shield), `http://127.0.0.1:3000` (asli), `http://127.0.0.1:8081` (auth).

> Catatan: flag CTF yang dipakai saat menyiapkan uji hanya untuk pengujian dan tidak termasuk
> dalam dokumen ini maupun di-commit ke repo.
