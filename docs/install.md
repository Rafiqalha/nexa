# Instalasi: dari clone sampai demo

Dua jalur menjalankan lab: **Docker Compose** (direkomendasikan bila Docker tersedia) atau
**mode lokal** (proses Node langsung di host, Suricata opsional lewat WSL). `pnpm lab:up`
memilih otomatis: Docker bila engine hidup, selain itu mode lokal.

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

Membuat `.env` dari `.env.example` tanpa menimpa nilai yang sudah ada. `DASHBOARD_TOKEN` dan
`SURICATA_CONTROL_TOKEN` diisi acak; nilainya tidak pernah dicetak. Isi bila perlu:

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

Token login = `DASHBOARD_TOKEN`. Salin tanpa menampilkannya:

```bash
pnpm token
```

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

## Masalah umum

| Gejala | Penyebab / solusi |
|---|---|
| "Token ditolak oleh sensor" | Nilai yang ditempel tidak sama dengan `DASHBOARD_TOKEN`. Pakai `pnpm token`. |
| "Terlalu banyak token salah" | 20 token salah dalam semenit; tunggu 1 menit. |
| Desktop menampilkan "Sensor tidak terjangkau" | Sensor belum jalan (`pnpm lab:up`). Jendela mencoba lagi tiap 5 detik. |
| `pnpm lab:up` memakai mode lokal padahal Docker terpasang | Engine Docker tidak merespons (`docker info`). Mode lokal tetap bisa dipakai. |
