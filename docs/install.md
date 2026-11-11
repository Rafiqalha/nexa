# Instalasi: dari clone sampai demo

Dua jalur menjalankan lab: **Docker Compose** (direkomendasikan bila Docker tersedia) atau
**mode lokal** (proses Node langsung di host, Suricata opsional lewat WSL). `pnpm lab:up`
memilih otomatis: Docker bila engine hidup, selain itu mode lokal. Deploy produksi (Railway)
ada di [§11](#11-produksi-di-railway).

## 1. Prasyarat

| Kebutuhan | Versi | Catatan |
|---|---|---|
| Git | apa saja | |
| Node.js | ≥ 20 (diuji 24.19) | |
| pnpm | 12.18.0 | `npm install -g pnpm@12.18.0` atau `corepack enable` |
| Docker Desktop / Engine + Compose v2 | opsional | jalur Docker (sensor, target, Suricata sidecar) |
| WSL (Debian/Kali) | opsional | Suricata tanpa Docker di Windows |
| API key DeepSeek | opsional | tanpa key: intel heuristik + agen uji mode skrip |

## 2. Clone dan pasang dependensi

```bash
git clone https://github.com/Rafiqalha/nexa.git
cd nexa
pnpm install
```

## 3. Siapkan `.env`

```bash
pnpm env:init
```

Membuat `.env` dari `.env.example` tanpa menimpa nilai yang sudah ada. `SETUP_TOKEN`,
`AUTH_SECRET`, `DASHBOARD_TOKEN`, dan `SURICATA_CONTROL_TOKEN` diisi acak; nilainya tidak pernah
dicetak. Isi bila perlu:

- `DEEPSEEK_API_KEY`: intel pasca-sesi lewat model (tanpa key, intel dibuat heuristik).
- `ATTACKER_LLM_API_KEY`: agen uji berbasis LLM (tanpa key, agen berjalan dalam mode skrip).
  Key ini **terpisah** dari key sensor.
- `LLM_BASE_URL` / `LLM_MODEL`: endpoint OpenAI-compatible lain (Ollama/vLLM on-prem).

`.env` tidak pernah di-commit dan tidak pernah dikirim ke dashboard atau aplikasi desktop.

## 4a. Jalur Docker Compose

```bash
pnpm lab:up
```

Menjalankan `docker compose -f deploy/docker-compose.yml up -d --build`:

- `target-app` di jaringan `lab` (internal, tanpa akses keluar).
- `sensor` dengan port `127.0.0.1:8080` (publik/proxy) dan `127.0.0.1:8081` (admin + dashboard).
  Image ini membangun dashboard sendiri.
- `suricata` sidecar (validasi `suricata -T`, deploy + reload rule lewat API kontrol ber-token).

Agen uji ada di profil `attack` dan dijalankan oleh `pnpm lab:attack`.

## 4b. Jalur lokal (tanpa Docker)

```bash
pnpm build
pnpm lab:up
```

`pnpm build` membangun dashboard (`apps/dashboard/dist`) yang disajikan port admin. Lab lokal
menjalankan target (`:3000`) dan sensor (`:8080`, `:8081`) sebagai proses Node; PID ada di
`data/lab-local.json`, log di `data/lab-logs/`.

**Suricata di WSL (opsional, Windows):** jalankan di dalam distro WSL (tanpa root):

```bash
bash deploy/suricata/setup-wsl.sh
```

Lalu set di `.env`:

```
SURICATA_RUNNER=exec
SURICATA_EXEC=wsl.exe -d <distro> -- bash /home/<user>/nexa-suricata/nexa-suricata.sh
```

Tanpa Suricata (`SURICATA_RUNNER=none`), draf rule tetap dibuat tetapi tidak ditampilkan
sampai tervalidasi (AGENTS.md §2.5). Dashboard menampilkan jumlah draf yang masih divalidasi.

## 5. Buka Dashboard

- Browser: <http://127.0.0.1:8081>
- Aplikasi desktop: `pnpm desktop`, atau pasang installer (langkah 8).

Pertama kali dibuka, dashboard meminta **token penyiapan** untuk membuat akun pemilik (peran
Admin). Token penyiapan adalah `SETUP_TOKEN`; di lab, bila kosong, dipakai `DASHBOARD_TOKEN`.
Salin tanpa menampilkannya:

```bash
pnpm token
```

Setelah itu masuk dengan email dan kata sandi. Pengguna lain ditambahkan lewat menu
**Pengguna** dengan tautan undangan sekali pakai yang berlaku 72 jam. Perintah
`pnpm token -- service` menyalin `DASHBOARD_TOKEN`, yaitu token layanan (bearer, setara Admin)
untuk skrip lab.

## 6. Jalankan serangan uji

```bash
pnpm lab:attack
pnpm lab:attack -- --model deepseek-v4-pro
pnpm lab:attack -- --baseline
pnpm lab:attack -- --scripted
```

`--baseline` menyerang aplikasi langsung (tanpa NEXA) sebagai pembanding. `--scripted` adalah
agen deterministik tanpa model. Laporan run ada di `lab/output/`. Ringkasan sesi terakhir:

```bash
node scripts/lab-report.mjs
```

Sekitar 60 detik setelah request terakhir agen, sesi ditutup. Draf rule muncul di halaman
**Aturan** setelah lolos `suricata -T`. Setujui atau Tolak sebagai operator; deploy hanya
terjadi setelah persetujuan.

## 7. Demo satu perintah

```bash
pnpm demo
pnpm demo -- --desktop --wait 15
```

Menyiapkan `.env`, membangun dashboard, menyalakan lab, menunggu sensor sehat, lalu
menjalankan `lab:attack`. Setelah itu skrip menunggu draf aturan siap ditinjau.

## 8. Installer desktop (Windows)

Installer siap pakai ada di [rilis GitHub](https://github.com/Rafiqalha/nexa/releases/latest)
(SHA-256 tercantum di catatan rilis). Untuk membangunnya sendiri:

```bash
pnpm desktop:installer
```

Hasilnya `apps/desktop/release/NEXA-Dashboard-Setup-<versi>.exe`: per pengguna, tanpa admin.
Installer belum ditandatangani, jadi SmartScreen meminta konfirmasi ("More info" → "Run
anyway"). Untuk sensor di mesin lain, tambahkan `--sensor-url=http://<host>:8081/` di target
shortcut.

## 9. Metrik lab

```bash
pnpm lab:human
pnpm lab:human -- --fast --seed 37
pnpm lab:metrics
pnpm lab:interrogation
```

`lab:human` menyimulasikan pengunjung manusia untuk mengukur false-positive. `lab:metrics`
menulis `docs/metrics.md` dan `metrics.json`. `lab:interrogation` menulis
`docs/interrogation-results.json`.

## 10. Verifikasi dan berhenti

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm lab:down
```

## 11. Produksi di Railway

Mode produksi (`NEXA_MODE=production`) membuka port admin ke internet lewat HTTPS dengan login
akun penuh. Di mode ini label data menjadi "Trafik nyata (produksi)". Topologi demo live:

| Service Railway | Dibangun dari | Jaringan |
|---|---|---|
| `sensor` | `deploy/railway/sensor.Dockerfile` (sensor + dashboard + Suricata 7) | Domain dashboard → port 8081, domain portal → port 8080, volume `/data` |
| `portal` | `lab/target-app/Dockerfile` (portal fiktif BAYU-7) | Hanya privat: `portal.railway.internal:3000`, tanpa domain publik |

Agen uji (`lab/attacker-agent`) tidak pernah di-deploy. Portal hanya bisa dijangkau lewat
sensor, sehingga setiap pengunjung melewati deteksi NEXA.

Variabel service `sensor` (bukan secret):

| Variabel | Nilai |
|---|---|
| `NEXA_MODE` | `production` |
| `SENSOR_HOST`, `ADMIN_HOST` | `::` |
| `SENSOR_PORT`, `ADMIN_PORT` | `8080`, `8081` |
| `PORT` | `8081` (healthcheck Railway ke `/healthz` memakai `PORT`) |
| `TRUST_PROXY`, `CLIENT_IP_HEADER` | `true`, `x-real-ip` |
| `UPSTREAM_URL` | `http://portal.railway.internal:3000` |
| `DASHBOARD_ORIGIN` | `https://<domain dashboard>` |
| `DATABASE_PATH`, `SURICATA_RULES_DIR` | `/data/nexa.db`, `/data/rules` |
| `SURICATA_RUNNER`, `SURICATA_EXEC` | `exec`, `bash /opt/nexa/nexa-suricata.sh` |

Variabel service `portal`: `HOST=::` dan `PORT=3000`. Healthcheck service `sensor` di
`/healthz`, service `portal` di `/`.

`X-Real-IP` diisi edge Railway dengan IP klien. Uji pasca-deploy mengirim `X-Real-IP` dan
`X-Forwarded-For` palsu yang berbeda-beda: ketiga request tetap tercatat sebagai satu sesi
dengan IP asli pengirim.

Secret diisi sendiri di tab **Variables** service `sensor`, tidak pernah di repo:

- `SETUP_TOKEN` (wajib untuk penyiapan, minimal 16 karakter acak): dipakai sekali untuk
  membuat akun pemilik. Setelah ada akun, penyiapan ditutup dan variabel ini boleh dihapus.
- `DEEPSEEK_API_KEY` (opsional): intel pasca-sesi lewat model. Tanpa key, intel dibuat
  heuristik.
- `AUTH_SECRET` tidak perlu diisi. Sensor membuatnya sekali di `/data/auth-secret` (izin 0600)
  dan menyimpannya di volume.

Deploy dari checkout lokal dengan Railway CLI, atau hubungkan repo GitHub ke tiap service:

```bash
railway up --service portal --environment production
```

```bash
railway up --service sensor --environment production
```

Image sensor menjalankan entrypoint sebagai root hanya untuk menyiapkan `/data`, lalu turun ke
user `node`. Suricata berjalan di container yang sama dalam mode unix-socket tanpa capture
trafik, sama seperti di lab. Ia memvalidasi draf (`suricata -T`) dan memuat aturan yang sudah
disetujui. Karena tidak berada di jalur paket, penegakan di jaringan organisasi dilakukan
dengan mengekspor aturan (halaman **Aturan** → Ekspor) ke IDS/IPS milik organisasi.

Setelah deploy, buka domain dashboard, tempel `SETUP_TOKEN`, lalu buat akun pemilik. Mode
produksi memakai cookie `__Host-nexa_session` (Secure, HttpOnly, SameSite=Strict), menolak
permintaan lintas-origin yang mengubah data, dan mengirim HSTS. `DASHBOARD_TOKEN` (bearer
statis) sebaiknya tidak di-set di produksi.

## Masalah umum

| Gejala | Penyebab / solusi |
|---|---|
| "Token penyiapan salah." | Nilai yang ditempel bukan `SETUP_TOKEN`. Pakai `pnpm token` (lab) atau salin dari tab Variables (Railway). |
| "SETUP_TOKEN belum di-set di environment sensor." | Mode produksi tidak memakai `DASHBOARD_TOKEN` sebagai token penyiapan. Isi `SETUP_TOKEN`, lalu deploy ulang. |
| "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit." | Akun terkunci setelah 5 kali salah kata sandi. Tunggu 15 menit atau minta Admin membuat tautan reset. |
| "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." | Batas per IP, misalnya 20 login gagal per 10 menit. Tunggu sebentar. |
| Desktop menampilkan "Sensor tidak terjangkau" | Sensor belum jalan (`pnpm lab:up`). Jendela mencoba lagi tiap 5 detik. |
| `pnpm lab:up` memakai mode lokal padahal Docker terpasang | Engine Docker tidak merespons (`docker info`). Mode lokal tetap bisa dipakai. |
