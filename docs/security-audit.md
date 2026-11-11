# Audit Batasan Keamanan (AGENTS.md §2)

Diaudit 11 November 2026 (Fase 6). Untuk tiap batasan: di mana ditegakkan, test yang
menjaganya, dan perbaikan dari audit ini. Semua test berjalan di `pnpm test`.

| # | Batasan | Ditegakkan di | Bukti test | Status |
|---|---|---|---|---|
| 1 | **Pertahanan saja, tanpa hack-back** | Proxy hanya meneruskan ke `UPSTREAM_URL` (`apps/sensor/src/proxy/forward.ts`). Labirin, canary, interogasi, dan MCP umpan hanya **menjawab** request; tidak ada kode yang membuka koneksi ke alamat penyerang. Canary hanya mencatat pemakaian. | `apps/sensor/test/security-guardrails.test.ts` (§2.1: koneksi keluar di sensor hanya dari `proxy/forward.ts`, `rules/suricata.ts`, `intel/llm.ts`; dashboard dan desktop hanya `fetch('/api/…')`) | Ditegakkan; test baru |
| 2 | **Tanpa LLM di jalur request** | `public/handler.ts`, `detect/`, `labyrinth/`, `canary/`, `proxy/`, `interrogate/`, `mcp/decoy.ts` prosedural; LLM hanya di antrean pasca-sesi `intel/queue.ts` + budget harian | `apps/sensor/test/no-llm-in-request-path.test.ts` (graf import, termasuk MCP umpan dan interogasi); `apps/sensor/src/intel/intel.test.ts` (budget) | Ditegakkan |
| 3 | **Redaksi sebelum keluar; hanya data sesi jebakan** | `intel/redact.ts` (tipe `RedactedText` wajib di `intel/llm.ts`), `intel/dossier.ts` (hanya event sesi itu), antrean menolak sesi `legit` | `apps/sensor/src/intel/intel.test.ts` (payload tersamarkan; dosir hanya sesi itu); `apps/sensor/test/intel-scope.test.ts` (sesi sah tidak pernah memicu LLM; isi payload hanya dari sesi agen) | Ditegakkan; test baru |
| 4 | **Satu pintu ke model** | SDK `openai` hanya di-import `intel/llm.ts` | `no-llm-in-request-path.test.ts` ("SDK model hanya di-import oleh intel/llm.ts", "hanya intel/queue.ts … memakai intel/llm.ts"); `security-guardrails.test.ts` §2.1 | Ditegakkan |
| 5 | **Gerbang persetujuan rule + validasi sebelum tampil** | `rules/deploy.ts` (`ApprovalRequiredError`, `assertDeployable`: wajib `decidedBy`+`decidedAt` dan `syntaxValid === true`); `rules/service.ts`; **baru:** `api/queries.ts` `REVIEWABLE_RULE` + `api/stream.ts` menyembunyikan draf yang belum lolos `suricata -T` dari API, SSE, dan MCP intel | `apps/sensor/src/rules/rules.test.ts` (regresi deploy); `apps/sensor/test/canary-rules.integration.test.ts` (Setujui → deploy, Tolak → tidak pernah ditulis); `apps/sensor/test/rules-visibility.test.ts` (baru) | **Diperbaiki**: sebelumnya draf "Belum divalidasi" tampil (tombol Setujui nonaktif). Kini tidak tampil sampai tervalidasi; dashboard hanya menampilkan jumlah draf yang masih divalidasi. |
| 6 | **Secret hanya di environment sensor** | `.env` di `.gitignore`; `.env.example` tanpa nilai; logger menyamarkan kunci secret; dashboard tidak pernah menerima secret; Electron tanpa `.env`/secret (`envDir` = `apps/desktop`); `pnpm token` menyalin token ke clipboard tanpa mencetaknya | `apps/sensor/src/logger.test.ts`; `security-guardrails.test.ts` §2.6 (`.env` tidak terlacak, `.env.example` kosong, tidak ada pola API key di berkas terlacak); `apps/desktop/src/main/security.test.ts` (tanpa nama secret di kode maupun bundel); `lab/attacker-agent/src/allowlist.test.ts` (agen hanya membaca kunci `ATTACKER_*`) | Ditegakkan; test baru |
| 7 | **Lab terisolasi** | `lab/attacker-agent/src/allowlist.ts` (`LAB_TARGET_ALLOWLIST`, ditolak sebelum request); compose: jaringan `lab` `internal: true`; build produksi tidak memuat `lab/` | `allowlist.test.ts` (host luar ditolak sebelum fetch, redirect tidak diikuti); `security-guardrails.test.ts` (build root tanpa `lab`, image sensor hanya menyalin manifest lab) | Ditegakkan |
| 8 | **Agen uji tetap minimal** | Dua tool saja (`http_request`, `read_response`), metode GET/POST/HEAD, header penyamaran dibuang | `allowlist.test.ts`; `security-guardrails.test.ts` §2.7–2.8 (hanya dua tool; tanpa `child_process`/socket mentah/`eval`; `fetch` hanya di tool HTTP dan klien model) | Ditegakkan; test baru |
| 9 | **Interogasi = umpan teks saja** | Teks umpan, alias field, dan jawaban di `apps/sensor/config/interrogation.json`; ditandai eksperimental di UI | `apps/sensor/src/interrogate/interrogate.test.ts` (teks umpan tidak di-hardcode); `apps/sensor/test/interrogate.integration.test.ts`; graf import tanpa LLM | Ditegakkan |
| 10 | **Konten labirin fiktif** | `labyrinth/vocab.ts` (nama fiktif, domain `.test`, IP TEST-NET RFC 5737) | `apps/sensor/src/labyrinth/generator.test.ts` (IP TEST-NET); `security-guardrails.test.ts` §2.10 (tanpa domain/instansi asli, IP hanya TEST-NET, semua arm + JSON + robots) | Ditegakkan; test baru |
| 11 | **Jujur di UI** | Label "Data simulasi lab" di `PageHeader` (semua halaman) dan layar login; biaya ditulis "estimasi"; interogasi ditandai eksperimental; tanpa klaim "100% lokal" | `security-guardrails.test.ts` §2.11 (setiap halaman memakai `PageHeader`/`LAB_LABEL`; tanpa klaim 100% lokal); `apps/dashboard/src/design.test.ts` | Ditegakkan; test baru |

## Perbaikan dari audit ini

1. **§2.5:** draf rule yang belum selesai divalidasi `suricata -T` tidak lagi dikirim ke
   dashboard, SSE, maupun MCP intel. Overview kini memuat `rulesValidating` sehingga operator
   tahu ada draf yang masih divalidasi.
2. **Auth dashboard:** request tanpa token tidak lagi dihitung sebagai percobaan gagal. Sebelumnya
   layar login bisa mengunci operator sah (lihat `apps/sensor/src/api/auth.test.ts`).
3. **Test regresi lintas repo** untuk §2.1, §2.3, §2.6, §2.7–2.8, §2.10, §2.11.

## Risiko yang belum tertutup

- **Jalur Docker belum terverifikasi di mesin ini.** Docker Desktop rusak (soket AF_UNIX tidak
  dapat diakses), sehingga image dan compose hanya divalidasi lewat `docker compose config`. Lab
  dijalankan dalam mode lokal: proses Node ditambah Suricata 8.0.6 di WSL.
- Ketiga Dockerfile (sensor, target, agen uji) kini menyalin manifest semua paket workspace untuk
  `--frozen-lockfile`. Perubahan di `lab/attacker-agent` sudah disetujui pemilik proyek, dan
  `apps/sensor/test/docker-manifests.test.ts` menjaganya. Build image tetap belum diuji karena
  Docker tidak tersedia (lihat butir pertama).
- Installer desktop **belum ditandatangani**, sehingga Windows SmartScreen memperingatkan saat
  pertama dijalankan.
- Port admin terikat ke `127.0.0.1`. Bila dibuka ke jaringan, pasang TLS di depannya; token
  dashboard berbentuk bearer statis.
- Deteksi berbasis sinyal (UA, header, ritme, honeylink). Agen yang meniru browser penuh dan tidak
  menyentuh honeylink tidak tertangkap oleh sinyal lain. Pengunjung manusia yang mengklik sangat
  cepat mencapai skor 0,35 (ambang curiga 0,6).
- Dua temuan `pnpm audit` *moderate* di alat build pengembangan (lihat `docs/versions.md`).
