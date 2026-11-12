# Audit Keamanan Penuh — Cara Kerja NEXA & Jalur Penembusannya

**Lingkup audit:** Sensor NEXA (`:8080`/`:8081`), target-app lab (`:3000`), dan labirin deception.
**Metode:** Black-box lewat HTTP + tinjauan kode pasca-eksploitasi (untuk menjelaskan mekanisme).
**Status:** Flag asli (`nexa{tes_flag}`) diperoleh via SQLi menembus sensor; decoy (`nexa{real_fkag_maybe}`) dikenali.

---

## 0. Catatan Penting soal Flag (konteks lab lokal)

> **Flag dalam uji ini bukan bagian resmi/global dari repo NEXA.** Keduanya adalah **buatan sendiri yang sengaja ditanam secara lokal** oleh pemilik lab saat **sengaja menyiapkan celah XSS dan SQLi** untuk latihan pentest. Secara teknis:
>
> - `nexa{tes_flag}` ditanam di `lab/target-app/src/app.ts` — di tabel `system_config` (`INSERT ... VALUES ('system_flag', 'nexa{tes_flag}')`) dan di-hardcode pada respons panel login. Ini target "flag asli".
> - `nexa{real_fkag_maybe}` ditanam sebagai **umpan** di tiga titik deception sensor: `labyrinth/generator.ts` (field `token_akses`/`token_verifikasi` pada JSON labirin), `labyrinth/templates/credentials.md`, dan banner `fakeVictory()` di `public/handler.ts`.
>
> Nilai-nilai ini **tidak merepresentasikan rahasia produksi** dan hanya ada di working tree lokal (lihat `git diff` pada 5 berkas: `lab/target-app/src/app.ts`, `lab/target-app/src/content.ts`, `apps/sensor/src/labyrinth/generator.ts`, `apps/sensor/src/labyrinth/templates/credentials.md`, `apps/sensor/src/public/handler.ts`). Pada repo bersih, `target-app` tidak memiliki tabel `users`/`system_config` maupun rute `POST /login` yang rentan — vuln SQLi/XSS adalah **penambahan sengaja** untuk skenario latihan ini.

Implikasi untuk pembaca audit: temuan "SQLi" dan "XSS" di bawah adalah **celah yang ditanam dengan sengaja** sebagai sasaran latihan, bukan regresi keamanan yang tidak disadari pada NEXA. Yang menjadi temuan nyata terhadap **NEXA sendiri** adalah pada Bagian 4 (keterbatasan lapisan deception).

---

## 1. Arsitektur NEXA (sebagaimana diamati & dikonfirmasi di kode)

NEXA adalah **lapisan deception defensif** di belakang reverse proxy. Topologi lab:

```
            127.0.0.1:8080 (publik)         127.0.0.1:8081 (admin, localhost-only)
                   │                                   │
            ┌──────┴───────────────────────────────────┴──────┐
            │                 SENSOR (Hono)                    │
            │  detect/ ── score sesi (perilaku)                │
            │  proxy/  ── teruskan trafik "legit"              │
            │  labyrinth/ ── umpan prosedural (seed/sesi)      │
            │  canary/ ── token jebakan + "fake victory"       │
            │  interrogate/ ── umpan prompt-injection (eksp.)  │
            │  intel/, rules/, mcp/, api/ (pasca-sesi)         │
            └───────────────────────┬──────────────────────────┘
                                    │ (hanya untuk sesi legit)
                             target-app :3000
                        "Portal Satuan BAYU-7" (fiktif)
```

- **Dua listener:** publik `:8080` (semua trafik termasuk penyerang) dan admin `:8081` (dashboard React + API, default hanya `127.0.0.1`).
- **Aturan desain (AGENTS.md §2):** tidak ada LLM di jalur permintaan penyerang; labirin & deteksi harus deterministik/prosedural; LLM hanya pasca-sesi via antrean. Audit mengonfirmasi jalur publik (`public/handler.ts`) memang bebas LLM.

### 1.1 Alur keputusan per-permintaan (`public/handler.ts`)
1. `tracker.observe()` menghitung ulang klasifikasi sesi.
2. Jika **`diverted`** (suspect/agent): badan permintaan dibaca terbatas (≤64 KB) **hanya untuk inspeksi canary**, lalu dilayani dari **labirin** — **tidak pernah** diteruskan ke upstream.
3. Jika **`legit`**: badan dibaca kecil untuk inspeksi canary, lalu **diteruskan byte-per-byte** ke `UPSTREAM_URL`.

### 1.2 Mesin deteksi (`detect/`)
- **Fingerprint sesi** = `sha256(IP + "\n" + User-Agent)` (`tracker.ts`). Ganti UA = sesi baru.
- **Klasifikasi monoton naik** dalam satu sesi (`escalate()`); skor hanya naik (`Math.max`).
- **Reset sesi** setelah idle **60 dtk** (`SESSION_IDLE_TIMEOUT_MS`, default).
- **Bobot skor** (`score.ts`):

  | Sinyal | Bobot | Catatan |
  |---|---:|---|
  | `honeylink` | 0.70 | hit path umpan tersembunyi (`/arsip-internal/`) — sinyal terkuat |
  | `automation_ua` | 0.35 | UA curl/python/go/axios/headless/bot/dll. atau kosong |
  | `missing_browser_headers` | 0.20 | tanpa `Accept-Language` nyata atau tanpa `Sec-Fetch-Site` |
  | `fast_timing` | 0.25 | ≥3 request dokumen, median interval < 2500 ms |
  | `regular_timing` | 0.10 | interval terlalu teratur (CV < 0.35) |

  Ambang: `suspect` ≥ **0.60**, `agent` ≥ 0.85.

### 1.3 Labirin & canary
- **Konten prosedural per-seed** (`labyrinth/generator.ts`): dokumen/laporan insiden, JSON ter-paginasi, config palsu — deterministik agar bisa di-replay. Pemilihan jenis umpan via bandit epsilon-greedy.
- **Canary** (`canary/`): token unik disematkan di umpan; jika token dipakai kembali oleh penyerang, memicu **"fake victory"** (`fakeVictory()`): banner "Autentikasi berhasil" + tautan panel-admin palsu agar agen terus menggali.
- **Interogasi (eksperimental, `interrogate/`):** menyisipkan umpan teks yang memancing agen LLM mengirim system prompt/tool-nya ke `POST /arsip-internal/kalibrasi`, lalu mem-parse balasannya. Teks-only, tanpa LLM.

---

## 2. Permukaan Serangan yang Teramati

| Endpoint (`:8080`) | Perilaku untuk sesi legit | Perilaku untuk sesi diverted |
|---|---|---|
| `/`, `/pengumuman`, `/dokumen`, `/dokumen/:slug` | halaman portal asli (proxied) | tetap bisa jadi umpan jika sesi sudah trapped |
| `/search?q=` | **reflected ke upstream (rentan XSS & SQLi)** | laporan insiden umpan |
| `POST /login` | **diteruskan ke upstream (rentan SQLi)** | umpan |
| `/api/status` | JSON sehat upstream | JSON labirin 27 halaman penuh flag palsu |
| `/arsip-internal/*` | honeylink (0.70) → menjebak | labirin + jebakan kalibrasi |
| `/robots.txt`, `/sitemap.xml` | daftar path umpan | umpan |
| `:8081/` `/api/*` | dashboard; `/api/*` butuh `DASHBOARD_TOKEN` (401 tanpa token) | — |

---

## 3. Temuan Eksploitasi (celah yang sengaja ditanam)

### 3.1 [KRITIS] SQL Injection — `POST /login` (auth bypass + UNION exfil)
- **Lokasi:** `lab/target-app/src/app.ts` → `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'` (interpolasi string mentah).
- **Dampak:** auth bypass (`admin'-- -`) dan pembacaan seluruh DB via `UNION SELECT`.
- **Bukti:** dump `users`, `documents`, `system_config`; eksfiltrasi `system_flag = nexa{tes_flag}`; kredensial `admin:bayu7_admin_pass2026`.
- **PoC (via :8080):**
  ```
  POST /login
  username=zzz' UNION SELECT 1,(SELECT config_val FROM system_config WHERE config_key='system_flag'),3-- -
  password=x
  ```

### 3.2 [KRITIS] SQL Injection — `GET /search` dan `GET /api/search`
- **Lokasi:** `app.ts` → `... WHERE judul LIKE '%${q}%' OR isi LIKE '%${q}%'`.
- **Dampak:** injeksi berbasis GET (lebih "stealthy" dari POST), `UNION`/error-based memungkinkan. Juga bisa dipakai untuk eksfiltrasi flag yang sama.

### 3.3 [TINGGI] Reflected XSS — `GET /search`
- **Lokasi:** `app.ts` baris reflektor `<p>Hasil pencarian untuk: ${q}</p>` — `q` **tidak di-escape** (hanya atribut `value="..."` yang disanitasi `&quot;`).
- **PoC:** `?q=<script>alert(document.domain)</script>` → tereksekusi di konteks halaman.

### 3.4 [SEDANG] Kredensial plaintext
- `users.password` disimpan sebagai teks biasa (`bayu7_admin_pass2026`). Tidak ada hashing.

> Sekali lagi: 3.1–3.4 adalah **celah latihan yang ditanam sengaja** di `lab/target-app` (lihat Bagian 0), bukan cacat bawaan NEXA.

---

## 4. Temuan terhadap NEXA Sendiri (keterbatasan lapisan deception)

Ini temuan yang **relevan untuk hardening produk**, independen dari flag lab.

### 4.1 [DESAIN] Deception bukan pencegahan — payload diteruskan utuh
Sensor **tidak menginspeksi payload serangan** pada jalur teruskan; badan hanya dibaca untuk canary. Maka **begitu sesi dinilai `legit`, SQLi/XSS/RCE apa pun diantar langsung ke upstream.** NEXA memang didesain sebagai deteksi+deception (bukan WAF), tetapi ini perlu dinyatakan eksplisit: **NEXA tidak melindungi upstream yang rentan.**

### 4.2 [BYPASS] Klasifikasi berbasis perilaku mudah dihindari
- Satu permintaan `curl` = skor 0.55 → **di bawah ambang** → diteruskan. Payload serangan tunggal lolos tanpa trik.
- Header seperti browser (`User-Agent` wajar + `Accept-Language` + `Sec-Fetch-Site`) → `automation_ua` & `missing_browser_headers` = 0 → skor **0.0**, bahkan untuk alat otomatis.
- **Low-and-slow:** jeda > `fast_timing` menghilangkan 0.25; menghindari `/arsip-internal/*` menghilangkan 0.70. Penyerang sabar tak pernah tersentuh labirin.
- **Reset per 60 dtk + fingerprint per-UA:** sesi "trapped" dilupakan; rotasi UA memberi sesi bersih tiap saat.

### 4.3 [DESAIN] Honeylink adalah satu-satunya sinyal "keras"
Hanya `honeylink` (0.70) yang sendirian melewati ambang. Sinyal lain bersifat pendukung dan, by design, tidak menandai satu permintaan tunggal. Artinya penyerang yang hanya menghindari path umpan sudah memangkas sebagian besar deteksi.

### 4.4 [INFO] Jebakan prompt-injection efektif tapi bergantung kepatuhan agen
Perangkap `/arsip-internal/kalibrasi` hanya berhasil bila agen penyerang **menuruti** instruksi di konten. Terhadap agen yang memperlakukan konten target sebagai data tak tepercaya, perangkap ini gagal (dalam uji ini ditolak). Nilainya tetap: sebagai *tripwire* dan telemetri, bukan pertahanan yang bisa diandalkan.

### 4.5 [INFO] Upstream terjangkau langsung di lab lokal
Di `lab:local`, `target-app` terikat `0.0.0.0:3000` sehingga bisa diakses langsung, melewati sensor sepenuhnya. Di Docker Compose produksi, `target-app` berada di jaringan `internal` dan **tidak** dipublikasikan — jadi ini keterbatasan setup lokal, bukan cacat deploy. Tetap disarankan mengikat `target-app` ke `127.0.0.1` saat `lab:local`.

---

## 5. Rekomendasi Hardening

**Untuk postur produk NEXA**
1. **Nyatakan batasan dengan jelas** di README/PRD: NEXA = deteksi+deception, **bukan** pengganti WAF/patching. Upstream tetap harus aman.
2. **Opsi mode "inline guard"** (opsional, non-default): inspeksi payload ringan (pola SQLi/XSS umum) pada jalur teruskan untuk *men-divert* permintaan berisi payload berbahaya ke labirin alih-alih meneruskannya — menutup 4.1/4.2 untuk kelas serangan jelas.
3. **Perkuat sinyal perilaku:** tambahkan sinyal berbasis isi (mis. permintaan dengan karakteristik injeksi) ke `score.ts`, bukan hanya UA/timing/honeylink, agar satu permintaan jahat tak otomatis `legit`.
4. **Fingerprint lebih tahan rotasi UA:** gabungkan sinyal jaringan/TLS/urutan header, bukan hanya `IP+UA`, agar ganti-UA tidak mereset status.
5. **Pertimbangkan "sticky trap" lintas-sesi per-IP** dengan peluruhan lambat, alih-alih reset keras 60 dtk, untuk penyerang low-and-slow (seimbangkan dengan risiko false-positive ke pengguna NAT).

**Untuk lab/target (jika ingin menutup celah latihan)**
6. Gunakan **query berparameter** di `POST /login`, `/search`, `/api/search`.
7. **Escape output** pada reflektor `/search` (`q`), bukan hanya atribut `value`.
8. **Hash kata sandi** (mis. scrypt/argon2) alih-alih plaintext.
9. Ikat `target-app` ke loopback saat `lab:local`.

---

## 6. Ringkasan Artefak

| Item | Nilai |
|---|---|
| Flag asli (upstream, via SQLi) | `nexa{tes_flag}` |
| Flag decoy (labirin sensor) | `nexa{real_fkag_maybe}` |
| Kredensial bocor | `admin:bayu7_admin_pass2026` |
| Tabel sensitif ter-dump | `users`, `documents`, `system_config` |
| Ambang deteksi / reset sesi | suspect 0.60 · agent 0.85 · idle 60 dtk |
| Berkas celah yang ditanam (git diff) | `lab/target-app/src/app.ts`, `lab/target-app/src/content.ts`, `apps/sensor/src/labyrinth/generator.ts`, `apps/sensor/src/labyrinth/templates/credentials.md`, `apps/sensor/src/public/handler.ts` |

> Narasi langkah-demi-langkah penembusan ada di `01-laporan-penembusan-honeypot.md`.
