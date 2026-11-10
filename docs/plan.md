# Rencana Implementasi NEXA (Prompt 0)

Disusun 10 November 2026. Deadline submission 15 November 2026, 23:59 WIB.
Dokumen kontrak: `PRD.md`, `AGENTS.md`, `DESIGN.md`, `CLAUDE.md` (tidak diubah).

---

## 1. Pemahaman produk (10 poin)

1. **Apa:** NEXA adalah lapisan deception defensif di belakang reverse proxy. Agen AI otonom tidak diblokir mentah-mentah, tetapi dibelokkan ke labirin umpan prosedural, ditahan, direkam, lalu polanya dijadikan **draf** aturan Suricata yang baru aktif setelah operator menyetujui.
2. **Empat mekanisme:** labirin rekursif + bandit (inti), canary/fake victory (inti), herd immunity lewat draf rule ber-gerbang (inti), interogasi kognitif (eksperimental, dilaporkan apa adanya).
3. **Ekonomi:** penyerang membakar token membaca konten prosedural; biaya NEXA mendekati nol karena jalur jebakan tidak memanggil LLM. Angka ditampilkan sebagai **estimasi** (karakter ÷ rasio karakter-per-token × harga konfigurasi).
4. **Batasan keamanan (AGENTS.md §2) dengan kata saya sendiri, bagian 1:**
   (1) hanya bertahan: tidak ada kode yang menyentuh, memindai, atau mengirim payload ke mesin di luar lab tim;
   (2) jalur request penyerang bebas LLM: deteksi, labirin, canary harus deterministik; LLM hanya pasca-sesi lewat antrean berbudget;
   (3) semua data ke penyedia model wajib disamarkan dulu (IP, hostname, path internal) dan hanya berasal dari sesi jebakan, tidak pernah log server asli.
5. **Batasan keamanan, bagian 2:**
   (4) satu-satunya pintu ke model di sensor adalah `intel/llm.ts`;
   (5) tidak ada deploy rule tanpa record persetujuan operator, dan draf divalidasi `suricata -T` sebelum tampil;
   (6) secret hanya di environment sensor: tidak di repo, log, dashboard, atau bundle Electron;
   (7) agen penyerang lab hanya boleh menyasar target lab lewat jaringan internal, dengan allowlist yang menolak host lain, dan lab tidak ikut build produksi.
6. **Batasan keamanan, bagian 3:**
   (8) agen uji tetap minimal (ReAct + HTTP + baca teks), tanpa exploit, evasion, persistence, atau payload;
   (9) interogasi hanya menyisipkan teks umpan dari file konfigurasi dan mem-parsing balasan, ditandai eksperimental;
   (10) semua konten umpan fiktif, tanpa nama/topologi/data instansi nyata;
   (11) UI jujur: label "Data simulasi lab", tanpa klaim "100% lokal" selama demo memakai API eksternal.
7. **Pengguna:** operator SOC (setujui/tolak rule, pantau kontak), analis (intel lewat MCP read-only), komandan/juri (meteran biaya, waktu tertahan).
8. **Prioritas:** satu alur demo utuh (deteksi → labirin → canary → draf rule → approve → deploy) mengalahkan banyak fitur setengah jadi. Urutan mengikuti AGENTS.md §12.
9. **Desain:** flat total, gelap, satu aksen sage, status = warna teks + label, angka mono tabular, loreng hanya di dasar sidebar, istilah militer Indonesia.
10. **Bukti:** semua angka berasal dari run lab nyata (target dummy + agen uji) dan berlabel simulasi; metrik "dengan vs tanpa NEXA" dibandingkan dengan run baseline langsung ke target.

---

## 2. Ambiguitas, kontradiksi, dan default yang saya ambil

| # | Temuan | Default yang dipakai |
|---|---|---|
| A1 | `pnpm lab:up`: AGENTS §8 bilang "target-app + suricata", Prompt 1 bilang "sensor + target-app". | `lab:up` = `docker compose up -d --build` untuk sensor + target-app (+ suricata mulai Fase 4). Dashboard jalan di host lewat `pnpm dev`, atau disajikan statis oleh port admin sensor setelah build. |
| A2 | FR-1 "respons identik" vs FR-4 honeylink tak terlihat: menyisipkan link ke HTML upstream akan mengubah respons. | Honeylink ditanam di konten upstream (target-app memuat link tersembunyi + `robots.txt` Disallow), sensor mengenali path honeylink dari konfigurasi. Respons sah tetap identik byte demi byte. |
| A3 | `sessions.status` hanya `suspect|trapped|exited`; sesi sah tidak punya status. | Tambah nilai `active` (sesi sah yang sedang diamati). `suspect` = sudah ditandai tapi belum disajikan labirin. |
| A4 | AGENTS §2.4 "satu pintu ke model" vs agen penyerang lab yang juga butuh model. | §2.4 berlaku untuk sensor. Agen lab memakai klien `fetch` minimal ke endpoint OpenAI-compatible (tanpa import SDK), env terpisah `ATTACKER_LLM_*`, tidak pernah memakai key sensor. Ada mode `scripted` (tanpa LLM) untuk CI dan demo offline, berlabel jelas. |
| A5 | `LAB_TARGET_ALLOWLIST=target-app`, padahal agen harus lewat sensor (reverse proxy) dan baseline "tanpa NEXA" harus langsung ke target. | Entri allowlist berbentuk `host` atau `host:port`. Compose: `sensor:8080,target-app:3000`. Lokal: `localhost:8080,localhost:3000`. Host/port lain ditolak sebelum request. |
| A6 | API dashboard dan path upstream bisa bentrok di satu port; API admin tidak boleh terbuka di port jebakan. | Dua listener: port publik `SENSOR_PORT` (proxy, labirin, canary, MCP umpan) dan port admin baru `ADMIN_PORT=8081` (REST, SSE, MCP intel, dashboard statis), bind `127.0.0.1` di host. |
| A7 | `suricata -T` "di container" dari sensor yang juga di container butuh docker socket (anti-pola keamanan). | Sidecar kontrol kecil di container Suricata (Python stdlib, token, jaringan internal) dengan dua perintah tetap: validasi (`suricata -T`) dan reload (`suricatasc -c reload-rules`). Tanpa docker socket. URL default diturunkan dari `SURICATA_CONTAINER`. |
| A8 | `decidedBy` butuh identitas, padahal auth hanya satu `DASHBOARD_TOKEN`. | Operator mengisi nama saat masuk dashboard; nama dicatat sebagai `decidedBy`. Keterbatasan ini didokumentasikan (bukan identitas terautentikasi). |
| A9 | DESIGN menyebut `tailwind.config`, sedangkan Tailwind v4 berbasis CSS. | Token dipetakan lewat `@theme` di CSS, palet bawaan Tailwind dimatikan (`--color-*: initial`) sehingga `green-500` dsb. tidak mungkin dipakai. Ditambah test yang memindai kelas palet bawaan. |
| A10 | shadcn/ui bawaan memakai shadow & radius besar. | Struktur shadcn (`components.json`, `cn`, `components/ui`) dipakai, komponen yang dibutuhkan saja (Button, Table) di-vendor dan disesuaikan ke DESIGN.md. |
| A11 | Router dashboard tidak ditentukan. | Router hash kecil buatan sendiri (4–5 halaman), menghindari dependensi besar. |
| A12 | Harga per token penyerang "harga publik model yang diduga" belum ada angkanya. | Tabel harga di `apps/sensor/config/pricing.json` (Rupiah per 1 juta token) dengan nilai default berlabel **asumsi**; dashboard menyebutnya estimasi. |
| A13 | Kapan sesi "selesai" tidak didefinisikan. | Sesi ditutup setelah idle `SESSION_IDLE_TIMEOUT_MS` (default 60 detik). Identitas sesi = hash(IP + User-Agent), tidak bergantung cookie. |
| A14 | Tabel `rules`/`intel` belum punya kolom pendukung (waktu deploy, sumber, status antrean). | Kolom tambahan: `rules.deployedAt`, `rules.source`, `rules.validationOutput`; `intel.source`, `intel.status`, `intel.tokensUsed`. Kolom wajib AGENTS §5 tetap ada. |
| A15 | Interogasi & metrik "2–3 model" butuh model nyata; belum ada key, Ollama lokal belum punya model. | Semua jalur bisa jalan dengan mode `scripted`. Pengukuran per model dijalankan bila model tersedia (Ollama lokal atau key); bila tidak, dilaporkan "belum diukur", bukan dikarang. |
| A16 | `DEEPSEEK_API_KEY` vs klaim model-agnostic. | Nama variabel dipertahankan. Untuk Ollama/vLLM cukup isi string apa pun; `LLM_BASE_URL` menentukan penyedia. |
| A17 | Server MCP intel: transport tidak ditentukan. | Streamable HTTP di port admin (`/mcp`), bearer `DASHBOARD_TOKEN`, hanya tool baca. MCP umpan di port publik pada path yang diiklankan labirin (aksesnya dihitung sebagai honeylink). |
| A18 | Electron: memuat dashboard dari mana. | Renderer = hasil build dashboard; URL sensor + token diisi saat runtime. Tanpa secret di bundle, tanpa `better-sqlite3`. |
| A19 | Biaya NEXA "≈ 0" padahal intel LLM pasca-sesi memakai token. | Meteran menampilkan biaya NEXA nyata = token intel × harga model NEXA (0 bila model lokal). Jujur, tetap mendekati nol. |
| A20 | TypeScript terbaru adalah 7.0 (compiler native). | Pin 7.0.2 untuk `tsc --noEmit`; bila ada inkompatibilitas tooling, turun ke 6.0.3 dan dicatat. |

---

## 3. Rencana per fase

### Fase 1 — Fondasi: monorepo, target lab, proxy, deteksi
- **Tujuan:** monorepo jalan; target lab hidup; sensor meneruskan trafik sah apa adanya dan mengklasifikasi sesi mencurigakan.
- **File:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`, `vitest.config.ts`, `.env.example`, `.gitignore`; `packages/shared` (skema zod); `apps/sensor/src/{index,config,logger}.ts`, `db/{schema,client,migrate}.ts` + `db/migrations`, `proxy/forward.ts`, `detect/{signals,score,session}.ts`; `lab/target-app`; `deploy/docker-compose.yml`, Dockerfile sensor & target.
- **FR:** FR-1, FR-2, FR-4, FR-5, FR-6 (FR-3 dijaga lewat struktur).
- **Acceptance:** typecheck/lint/test lulus; `pnpm lab:up` menyalakan sensor + target; respons via sensor identik dengan akses langsung (status, header konten, body byte-per-byte); hit honeylink membuat sesi `agent` di DB; unit test scoring + config.
- **Risiko:** kompresi/stream membuat respons beda (mitigasi: proxy raw `node:http`, tanpa dekompresi); `better-sqlite3` native di Windows/Docker (mitigasi: prebuilt binary, `onlyBuiltDependencies`); Docker Desktop belum jalan (mitigasi: mode lokal tanpa Docker untuk dev).
- **Estimasi:** 4–5 jam.

### Fase 2 — Labirin, bandit, agen uji (demo minimal)
- **Tujuan:** sesi suspect/agent dibelokkan ke labirin prosedural deterministik; bandit memilih jenis umpan; agen uji lab terjebak dan token tercatat.
- **File:** `labyrinth/{generator,bandit,prng,handler}.ts`, `labyrinth/templates/*.md`; `lab/attacker-agent/src/{agent,allowlist,tools,model-client,scripted}.ts`.
- **FR:** FR-7, FR-8, FR-9, FR-3 (test regresi).
- **Acceptance:** seed sama → labirin identik; bandit konvergen ke arm terbaik; allowlist menolak host lain; handler penyerang tidak meng-import `intel/llm.ts`; `lab:up && lab:attack` → sesi `agent`, `trapped`, events dengan total `estTokens > 0`.
- **Risiko:** model lokal lambat sehingga sesi terpotong idle timeout (mitigasi: timeout dapat dikonfigurasi, mode scripted); agen terlalu "pintar" dan berhenti cepat (mitigasi: halaman umpan selalu punya tautan lanjutan + bandit).
- **Estimasi:** 5–6 jam.

### Fase 3 — Dashboard Pos Komando
- **Tujuan:** Pos Komando realtime: meteran biaya, ringkasan, kontak aktif, panel aturan; halaman Kontak + linimasa.
- **File:** `apps/sensor/src/api/{router,auth,sse,queries}.ts`, `packages/shared/src/api.ts`; `apps/dashboard` (Vite, `styles/tokens.css`, `pages/*`, `components/*`, `lib/{api,sse,router,format}.ts`).
- **FR:** FR-20, FR-21, FR-22 (panel), FR-9 (tampilan).
- **Acceptance:** angka berubah realtime saat `lab:attack`; linimasa menampilkan langkah + token per langkah; tanpa warna bawaan Tailwind; tidak overflow di 390px; API menolak request tanpa token; verifikasi lulus.
- **Risiko:** pelanggaran DESIGN.md tak sengaja (mitigasi: palet bawaan dimatikan + test pemindai); SSE + auth header (mitigasi: klien SSE berbasis `fetch`, token tidak di URL).
- **Estimasi:** 5–6 jam.

### Fase 4 — Canary dan aturan dengan gerbang persetujuan
- **Tujuan:** canary per sesi + callback; draf rule Suricata otomatis pasca-sesi, divalidasi `suricata -T`, deploy hanya setelah approval.
- **File:** `canary/{issue,detect}.ts`; `rules/{generate,validate,deploy,escape}.ts`; `deploy/suricata/{Dockerfile,control.py,rules/}`; dashboard `pages/Aturan.tsx`, `components/RuleItem.tsx`.
- **FR:** FR-10, FR-11, FR-15, FR-16, FR-17, FR-22.
- **Acceptance:** canary terpakai tercatat dan tampil di linimasa; draf muncul otomatis + status validasi; `deploy.ts` menolak tanpa approval (test); Setujui → file rule + reload Suricata sukses; Tolak → tidak pernah ditulis.
- **Risiko:** escaping konten rule (mitigasi: encoder `|XX|` + test); reload Suricata di Docker Desktop (mitigasi: sidecar kontrol, uji manual end-to-end).
- **Estimasi:** 4–5 jam.

### Fase 5 — Intel LLM, MCP, interogasi, Electron
- **5A** `intel/{llm,redact,queue,summarize}.ts`, halaman Intel. FR-13, FR-14, FR-23. Test redaksi + budget guard. Tanpa model → ringkasan heuristik berlabel.
- **5B** `mcp/{intel,decoy}.ts`. FR-18, FR-19. Test klien MCP `listTools` + `callTool`; server intel tanpa tool tulis.
- **5C** `interrogate/` + `config/interrogation.json`. FR-12. Diukur di 2–3 model bila tersedia, dilaporkan apa adanya.
- **5D** `apps/desktop` (electron-vite). NFR-5.
- **Risiko:** API SDK MCP v2 berubah (mitigasi: baca tipe paket terpasang, test integrasi); biaya model (mitigasi: budget harian + antrean pasca-sesi).
- **Estimasi:** 6–8 jam.

### Fase 6 — Hardening & paket submission
- Audit 11 batasan §2 dengan bukti file + test, `pnpm audit`, `docs/{architecture,install,prior-art,versions}.md`, README, script demo, tabel metrik dari 3 run, checklist submission.
- **Estimasi:** 3–4 jam.

---

## 4. Versi dependensi (dicek di npm 10 Nov 2026, di-pin persis)

| Paket | Versi |
|---|---|
| pnpm | 12.18.0 (`packageManager`) |
| Node | ≥ 20 (lokal 24.19.0, Docker `node:24-bookworm-slim`) |
| typescript | 7.0.2 (cadangan 6.0.3) |
| @biomejs/biome | 2.6.6 |
| vitest | 5.1.0 |
| tsx | 4.23.15 |
| hono / @hono/node-server | 4.13.17 / 2.1.6 |
| better-sqlite3 / @types/better-sqlite3 | 13.0.3 / 9.6.0 |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 (bukan 1.0 beta) |
| zod | 4.6.7 |
| openai | 7.55.0 (hanya di `intel/llm.ts`) |
| @modelcontextprotocol/server / client | 2.4.0 / 2.4.0 (≥ 2.2.0, NFR-6) |
| react / react-dom | 19.3.1 |
| vite / @vitejs/plugin-react | 8.3.7 / 6.3.0 |
| tailwindcss / @tailwindcss/vite | 4.3.5 |
| lucide-react | 1.70.0 (1.71.0 dirilis < 24 jam, ditahan kebijakan umur rilis pnpm) |
| clsx / tailwind-merge / class-variance-authority / @radix-ui/react-slot | 2.1.1 / 3.7.0 / 0.7.1 / 1.5.0 |
| @fontsource-variable/geist / jetbrains-mono | 5.3.0 / 5.3.0 (self-hosted, aman air-gapped) |
| recharts | 3.10.1 (hanya bila dipakai) |
| electron / electron-vite | 45.2.3 / 6.0.0 |
| @types/node | 24.19.2 (cocok runtime Node 24) |
