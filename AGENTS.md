# AGENTS.md — NEXA

Panduan untuk agen coding (dan manusia) yang bekerja di repo ini. Ini **sumber kebenaran teknis**. `CLAUDE.md` merujuk ke sini.

Baca dulu: `PRD.md` (lingkup & batasan) dan `DESIGN.md` (UI). Jika permintaan bertentangan dengan dokumen-dokumen itu, berhenti dan tanyakan.

---

## 1. Ringkasan Proyek

NEXA adalah lapisan **deception defensif** di belakang reverse proxy yang mendeteksi agen AI otonom, membelokkannya ke labirin umpan prosedural, merekam sesinya, lalu menghasilkan **draf** aturan blokir yang **baru aktif setelah disetujui operator**.

Komponen:
- **Sensor** (`apps/sensor`) — Hono: proxy, deteksi, labirin, canary, intel, rules, MCP, API.
- **Dashboard** (`apps/dashboard`) — React web app (Pos Komando).
- **Desktop** (`apps/desktop`) — pembungkus Electron untuk dashboard.
- **Lab** (`lab/`) — target dummy + agen penyerang uji, hanya untuk demo & pengujian.

---

## 2. Batasan Keamanan (WAJIB — jangan dilanggar)

Ini proyek keamanan; kesalahan desain di sini merusak klaim produk. Aturan berikut tidak boleh dilonggarkan tanpa persetujuan eksplisit pemilik proyek.

1. **Pertahanan saja.** Jangan menulis kode yang mengeksekusi, mengambil alih, memindai, atau mengirim payload ke mesin di luar lingkungan tim. Tidak ada hack-back.
2. **Tidak ada LLM di jalur permintaan penyerang.** Labirin, deteksi, dan canary harus deterministik/prosedural. Panggilan LLM hanya di `intel/` dan hanya **pasca-sesi** lewat antrean, dengan batas anggaran harian. (Mencegah Denial of Wallet pada diri sendiri.)
3. **Redaksi sebelum keluar.** Semua data yang dikirim ke penyedia model wajib lewat `intel/redact.ts` (samarkan IP/hostname/path internal). Hanya data **sesi di dalam jebakan**; log server asli **tidak pernah** dikirim.
4. **Satu pintu ke model.** Semua pemanggilan model hanya lewat `intel/llm.ts`. Jangan import SDK model di tempat lain.
5. **Gerbang persetujuan aturan.** Kode tidak boleh men-deploy aturan Suricata/WAF tanpa record persetujuan operator di DB. Validasi `suricata -T` sebelum draf ditampilkan.
6. **Secrets.** `DEEPSEEK_API_KEY` dan secret lain hanya di environment sensor. Jangan pernah commit, log, kirim ke dashboard, atau bundel ke Electron. `.env` ada di `.gitignore`; sediakan `.env.example` tanpa nilai.
7. **Lab terisolasi.** `lab/attacker-agent` hanya boleh menyasar `lab/target-app` lewat jaringan Docker internal. Target di-hardcode/divalidasi ke allowlist lab; tolak host lain. Paket lab tidak ikut build produksi.
8. **Agen penyerang uji tetap minimal.** Cukup loop ReAct sederhana dengan tool HTTP request ke target lab dan baca file. Jangan menambahkan kemampuan eksploitasi nyata, teknik evasion, persistence, atau payload. Tujuannya menguji labirin, bukan membuat alat ofensif.
9. **Interogasi = umpan teks saja.** Modul `interrogate/` hanya menyisipkan teks umpan ke respons honeypot dan mem-parsing balasan. Isi string umpan disimpan di file konfigurasi, bukan di-hardcode, dan modul ini ditandai eksperimental.
10. **Konten labirin aman.** Dokumen/kredensial umpan harus fiktif. Jangan menyalin data, nama sistem, atau topologi asli TNI/instansi mana pun.
11. **Jujur di UI.** Data contoh berlabel "Data simulasi lab". Jangan menambahkan klaim "100% lokal" selama demo memakai API eksternal.

---

## 3. Tech Stack

| Lapisan | Pilihan |
|---|---|
| Runtime | Node 20+ (wajib untuk MCP SDK v2), TypeScript strict |
| Monorepo | pnpm workspaces |
| Sensor/proxy | Hono + `@hono/node-server` |
| Database | SQLite via `better-sqlite3` + Drizzle ORM |
| Realtime | SSE (`streamSSE` Hono) |
| LLM | SDK `openai` dengan `baseURL` dari env (default DeepSeek; bisa diganti Ollama/vLLM on-premise) |
| Rules | Template Suricata + validasi `suricata -T` (Suricata di Docker) |
| MCP | `@modelcontextprotocol/server` v2, pin ≥ 2.2.0 |
| Validasi | zod 4 |
| Dashboard | React + Vite + Tailwind + shadcn/ui + Recharts + Lucide |
| Desktop | Electron via `electron-vite` |
| Font | Geist + JetBrains Mono |
| Test | Vitest |
| Lint/format | Biome |
| Deploy | Docker Compose (sensor, target-app, suricata) |

**Jangan menambah dependensi besar** tanpa alasan tertulis di PR. Library kecil untuk hal sepele (bandit, seed RNG kecuali `seedrandom`) ditulis sendiri.

---

## 4. Struktur Repo

```
nexa/
├── apps/
│   ├── sensor/
│   │   └── src/
│   │       ├── index.ts            # bootstrap Hono, mount router
│   │       ├── config.ts           # baca & validasi env (zod)
│   │       ├── proxy/              # forward trafik sah ke upstream
│   │       ├── detect/             # honeylink, timing, scoring sesi
│   │       ├── labyrinth/
│   │       │   ├── generator.ts    # dokumen & endpoint prosedural (seed per sesi)
│   │       │   ├── templates/      # template Markdown umpan (fiktif)
│   │       │   └── bandit.ts       # epsilon-greedy pemilih umpan
│   │       ├── interrogate/        # EKSPERIMENTAL: sisip umpan teks + parse balasan
│   │       ├── canary/             # pembuat token + endpoint callback
│   │       ├── intel/
│   │       │   ├── llm.ts          # SATU-SATUNYA pintu ke model
│   │       │   ├── redact.ts       # penyamaran sebelum kirim
│   │       │   ├── queue.ts        # antrean pasca-sesi + budget harian
│   │       │   └── summarize.ts    # ringkasan, dugaan model, draf rule
│   │       ├── rules/
│   │       │   ├── generate.ts     # pola -> draf rule Suricata
│   │       │   ├── validate.ts     # suricata -T
│   │       │   └── deploy.ts       # hanya jika ada approval record
│   │       ├── mcp/
│   │       │   ├── decoy.ts        # server MCP umpan (bagian labirin)
│   │       │   └── intel.ts        # server MCP asli untuk analis
│   │       ├── api/                # REST + SSE untuk dashboard (auth wajib)
│   │       └── db/
│   │           ├── schema.ts       # Drizzle schema
│   │           └── migrations/
│   ├── dashboard/
│   │   └── src/
│   │       ├── pages/              # PosKomando, Kontak, Intel, Aturan
│   │       ├── components/         # CostMeter, SessionTimeline, RuleItem, ...
│   │       ├── lib/                # klien API, hook SSE
│   │       └── styles/tokens.css   # token dari DESIGN.md
│   └── desktop/
│       └── src/main.ts             # Electron: load dashboard, tanpa akses DB
├── packages/
│   └── shared/                     # tipe + skema zod bersama
├── lab/
│   ├── target-app/                 # "portal satuan" fiktif
│   └── attacker-agent/             # agen uji minimal, HANYA ke target-app
├── deploy/
│   ├── docker-compose.yml
│   └── suricata/                   # config + rules hasil approve
├── docs/                           # arsitektur, instalasi, prior art
├── PRD.md  DESIGN.md  AGENTS.md  CLAUDE.md
├── .env.example
├── pnpm-workspace.yaml
├── biome.json
└── README.md
```

---

## 5. Model Data (Drizzle, ringkas)

- **sessions** — `id`, `firstSeenAt`, `lastSeenAt`, `sourceIp` (tersamarkan saat diekspor), `userAgent`, `classification` (`legit|suspect|agent`), `score`, `status` (`suspect|trapped|exited`), `labyrinthSeed`.
- **events** — `id`, `sessionId`, `ts`, `kind` (`request|bait_served|honeylink_hit|canary_issued|canary_triggered|interrogation_reply`), `path`, `charsServed`, `estTokens`, `latencyMs`, `meta` (JSON).
- **canaries** — `id`, `sessionId`, `token`, `kind` (`credential|document|api_key`), `issuedAt`, `triggeredAt`, `triggerIp`.
- **bandit_arms** — `armId` (jenis umpan), `pulls`, `totalHoldMs`, `meanReward`.
- **intel** — `id`, `sessionId`, `summary`, `suspectedModel`, `confidence`, `capturedPrompt` (eksperimental), `createdAt`.
- **rules** — `id`, `sessionId`, `body`, `syntaxValid`, `status` (`draft|approved|rejected|deployed`), `decidedBy`, `decidedAt`.
- **llm_budget** — `date`, `tokensUsed`, `limit`.

Semua skema input/output API divalidasi zod di `packages/shared`.

---

## 6. Alur Inti

1. Request masuk → `detect/` menghitung skor (honeylink, timing, heuristik header).
2. `legit` → `proxy/` meneruskan ke upstream apa adanya.
3. `suspect/agent` → `labyrinth/` menyajikan konten prosedural (seed per sesi), `bandit.ts` memilih jenis umpan, `canary/` menyisipkan token unik. Tiap langkah dicatat ke `events` (karakter & estimasi token).
4. Sesi berakhir (timeout/keluar) → `intel/queue.ts` mengantre ringkasan, **cek budget** → `redact.ts` → `llm.ts` → simpan `intel` + draf `rules`.
5. `rules/validate.ts` menjalankan `suricata -T`; hasil ditampilkan di dashboard.
6. Operator klik **Setujui** → record approval → `rules/deploy.ts` menulis ke `deploy/suricata/` dan memuat ulang Suricata.
7. Semua perubahan didorong ke dashboard via SSE.

**Estimasi biaya penyerang** = `estTokens` × harga publik per-token model yang diduga (konfigurasi), ditampilkan sebagai estimasi, bukan angka pasti.

---

## 7. Konfigurasi (`.env.example`)

```
# Sensor
SENSOR_PORT=8080
UPSTREAM_URL=http://target-app:3000
DATABASE_PATH=./data/nexa.db
DASHBOARD_TOKEN=            # auth API dashboard

# Model (model-agnostic; ganti baseURL untuk on-premise)
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=
DEEPSEEK_API_KEY=
LLM_DAILY_TOKEN_BUDGET=200000

# Deteksi
SUSPECT_SCORE_THRESHOLD=0.6

# Rules
SURICATA_RULES_DIR=./deploy/suricata/rules
SURICATA_CONTAINER=suricata

# Lab (hanya dev)
LAB_TARGET_ALLOWLIST=target-app
```

`config.ts` wajib gagal saat start bila env wajib tidak ada atau tidak valid.

---

## 8. Perintah

```bash
pnpm install
pnpm dev                 # sensor + dashboard (watch)
pnpm --filter sensor dev
pnpm --filter dashboard dev
pnpm --filter desktop dev
pnpm db:migrate          # drizzle migrations
pnpm test                # vitest semua paket
pnpm lint                # biome check
pnpm format              # biome format --write
pnpm typecheck           # tsc --noEmit di semua paket
pnpm lab:up              # docker compose up target-app + suricata
pnpm lab:attack          # jalankan attacker-agent ke target-app lab
pnpm build               # build produksi (tanpa lab/)
```

Sebelum menyatakan pekerjaan selesai: `pnpm typecheck && pnpm lint && pnpm test` harus lulus.

---

## 9. Konvensi Kode

- TypeScript `strict`, tanpa `any` (pakai `unknown` + zod). ESM.
- Nama file `kebab-case.ts`; komponen React `PascalCase.tsx`; fungsi `camelCase`.
- Modul sensor mengekspor fungsi murni sebisa mungkin; I/O (DB, network) di tepi.
- Error: lempar error bertipe; handler Hono mengubahnya ke respons JSON konsisten. Jangan bocorkan stack trace ke klien.
- Logging terstruktur (JSON). **Jangan log secret** atau isi kredensial umpan secara lengkap.
- Labirin harus deterministik untuk seed yang sama (penting untuk replay & pengujian).
- UI mengikuti `DESIGN.md` secara ketat: token warna, Geist/JetBrains Mono, tanpa shadow/gradien/glow/animasi dekoratif/badge.

---

## 10. Pengujian

- **Unit:** generator labirin (determinisme seed), bandit (konvergensi), redact (tidak ada IP/hostname internal lolos), rules generate/validate, budget guard.
- **Integrasi:** jalankan `lab:up` + `lab:attack`, pastikan: sesi terklasifikasi `agent`, labirin tersaji, canary tercatat, draf rule muncul dan **tidak** ter-deploy tanpa approval.
- **Regresi keamanan (wajib ada test):**
  - Tidak ada pemanggilan `llm.ts` dalam penanganan request penyerang.
  - `deploy.ts` menolak rule tanpa approval.
  - Payload ke model tidak mengandung data hasil redaksi yang seharusnya hilang.
  - `attacker-agent` menolak target di luar allowlist.

---

## 11. Git & PR

- Branch: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
- Commit: Conventional Commits (`feat(labyrinth): add epsilon-greedy bandit`).
- PR kecil dan fokus; deskripsikan dampak terhadap batasan §2 bila menyentuh `intel/`, `rules/`, `interrogate/`, atau `lab/`.
- Jangan commit `.env`, file DB, atau output lab.

---

## 12. Prioritas Pengerjaan (deadline 15 Nov 2026, 23:59 WIB)

1. `lab/target-app` + `proxy/` + `detect/` dasar.
2. `labyrinth/` + `bandit.ts` + `lab/attacker-agent` → demo minimal hidup.
3. Dashboard: Pos Komando, SSE, meteran biaya.
4. `canary/` + `rules/` dengan gerbang persetujuan.
5. `intel/` (LLM pasca-sesi), `mcp/intel.ts`, `interrogate/` (eksperimental), lalu pembungkus Electron.

Jika waktu habis, yang di-submit harus tetap sistem utuh yang berfungsi. Pangkas fitur, bukan kualitas demo.
