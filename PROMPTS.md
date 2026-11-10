# Prompt Eksekusi Claude Code — NEXA

Cara pakai:
1. Taruh `PRD.md`, `DESIGN.md`, `AGENTS.md`, `CLAUDE.md` di root repo kosong, lalu buka Claude Code di folder itu.
2. Kirim **Prompt 0** sekali. Tunggu rencana, review, lalu setujui.
3. Kirim **Prompt 1 sampai 5** satu per satu. Jangan lanjut ke fase berikutnya sebelum *acceptance criteria* fase itu lulus dan sudah kamu cek sendiri.
4. Kalau ada yang gagal atau melenceng, pakai **Prompt Koreksi** di bagian akhir.

Setiap fase diakhiri satu commit. Kalau waktu habis, hasil fase terakhir yang lulus tetap bisa di-submit.

---

## Prompt 0 — Kickoff & Perencanaan

```
Peranmu: senior software engineer yang memimpin implementasi NEXA dari nol.

KONTEKS
Repo ini berisi empat dokumen yang menjadi kontrak proyek:
- PRD.md     : lingkup, non-tujuan, kebutuhan fungsional (FR-x), risiko, metrik
- AGENTS.md  : sumber kebenaran teknis (stack, struktur repo, model data, alur, batasan keamanan)
- DESIGN.md  : sistem desain UI (token, tipografi, aturan flat)
- CLAUDE.md  : cara kerjamu di repo ini

Deadline submission: 15 November 2026, 23:59 WIB. Prioritas: satu alur demo utuh
yang berfungsi lebih penting daripada banyak fitur setengah jadi.

TUGAS SEKARANG (belum menulis kode aplikasi)
1. Baca keempat dokumen secara lengkap.
2. Rangkum dalam maksimal 10 poin apa yang kamu pahami tentang produk,
   termasuk 11 batasan keamanan di AGENTS.md §2 dengan kata-katamu sendiri.
3. Daftar setiap ambiguitas, kontradiksi antar-dokumen, atau keputusan yang
   belum diputuskan. Untuk tiap item, usulkan default yang masuk akal.
4. Susun rencana implementasi per fase mengikuti AGENTS.md §12 (Fase 1 sampai 5).
   Untuk tiap fase tulis:
   - tujuan
   - file/modul yang dibuat atau diubah
   - FR dari PRD yang dipenuhi
   - acceptance criteria yang bisa diuji
   - risiko teknis + mitigasi
   - estimasi waktu
5. Sebutkan versi dependensi utama yang akan kamu pin, dan cek dulu versi
   terbaru yang tersedia di npm (jangan menebak dari ingatan).

ATURAN
- Jangan menulis kode aplikasi sebelum rencana ini saya setujui.
- Jangan mengubah PRD.md, DESIGN.md, AGENTS.md, atau CLAUDE.md.
- Kalau ada permintaan yang bertentangan dengan AGENTS.md §2, berhenti dan tanya.

Keluaran: satu laporan terstruktur dengan heading per poin di atas.
```

---

## Prompt 1 — Fondasi: Monorepo, Target Lab, Proxy, Deteksi

```
Rencana disetujui. Kerjakan FASE 1.

TUJUAN
Monorepo berjalan, target lab hidup, sensor meneruskan trafik sah dan
mengklasifikasi sesi mencurigakan.

LINGKUP
1. Scaffold monorepo sesuai AGENTS.md §4:
   pnpm workspaces, TypeScript strict, Biome, Vitest, tsconfig base,
   packages/shared, .env.example (AGENTS.md §7), .gitignore (.env, data/, *.db).
2. apps/sensor:
   - config.ts: validasi env dengan zod, gagal saat start bila tidak valid.
   - db/: schema Drizzle untuk tabel di AGENTS.md §5 + migrasi pertama.
   - proxy/: forward trafik "legit" ke UPSTREAM_URL tanpa mengubah respons.
   - detect/: honeylink tersembunyi, analisis timing, skor sesi, klasifikasi
     legit|suspect|agent dengan ambang SUSPECT_SCORE_THRESHOLD.
   - Logging terstruktur JSON tanpa secret.
3. lab/target-app: "portal satuan" fiktif sederhana (beberapa halaman + 1-2 endpoint API).
   Seluruh konten fiktif; jangan meniru sistem nyata.
4. deploy/docker-compose.yml: sensor + target-app di jaringan internal.
5. Script root: dev, test, lint, typecheck, db:migrate, lab:up.

DI LUAR LINGKUP FASE INI
Labirin, canary, LLM, rules, dashboard, Electron.

ACCEPTANCE CRITERIA
- [ ] pnpm typecheck && pnpm lint && pnpm test lulus.
- [ ] pnpm lab:up menyalakan sensor + target-app.
- [ ] Request biasa lewat sensor mendapat respons identik dengan akses langsung ke target-app.
- [ ] Request ke honeylink membuat sesi berstatus suspect/agent tercatat di DB.
- [ ] Unit test: scoring deteksi, validasi config.

PENUTUP
Laporkan: file yang dibuat, hasil tiap acceptance criteria (lulus/gagal + bukti
output perintah), keputusan yang kamu ambil sendiri, dan hal yang perlu saya putuskan.
Lalu commit: "feat: scaffold monorepo, lab target, proxy and detection".
```

---

## Prompt 2 — Labirin, Bandit, dan Agen Uji (demo minimal)

```
Fase 1 lulus. Kerjakan FASE 2. Di akhir fase ini harus ada demo minimal yang hidup.

LINGKUP
1. labyrinth/generator.ts
   - Dokumen Markdown + endpoint palsu prosedural, deterministik per seed sesi.
   - Template di labyrinth/templates/, semuanya fiktif.
   - Setiap halaman berisi tautan lanjutan ke kedalaman berikutnya.
   - TIDAK ada pemanggilan LLM di jalur ini (AGENTS.md §2.2).
2. labyrinth/bandit.ts
   - Epsilon-greedy dengan reward = waktu agen bertahan pada jenis umpan.
   - State disimpan di tabel bandit_arms.
3. Pencatatan events: setiap umpan yang disajikan menyimpan charsServed,
   estTokens, latencyMs.
4. Sensor membelokkan sesi suspect/agent ke labirin.
5. lab/attacker-agent
   - Loop ReAct minimal dengan dua tool: HTTP request dan baca teks respons.
   - Model lewat env (baseURL + key), batas langkah dan batas token dapat dikonfigurasi.
   - WAJIB: allowlist target dari LAB_TARGET_ALLOWLIST; tolak host lain sebelum request.
   - Jangan menambahkan kemampuan eksploitasi, evasion, atau persistence (AGENTS.md §2.7-2.8).
   - Script pnpm lab:attack.

ACCEPTANCE CRITERIA
- [ ] Seed yang sama menghasilkan labirin yang identik (unit test).
- [ ] Bandit memilih arm terbaik setelah N simulasi (unit test).
- [ ] attacker-agent menolak target di luar allowlist (unit test).
- [ ] Test regresi: handler request penyerang tidak meng-import intel/llm.ts.
- [ ] pnpm lab:up && pnpm lab:attack: sesi terklasifikasi agent, masuk labirin,
      events tercatat dengan total estTokens > 0.
- [ ] Semua perintah verifikasi lulus.

PENUTUP
Laporkan hasil satu run lab:attack: kedalaman labirin, durasi, total estTokens,
umpan yang paling sering dipilih bandit. Lalu commit:
"feat(labyrinth): procedural maze, bandit selector and lab attacker agent".
```

---

## Prompt 3 — Dashboard Pos Komando

```
Fase 2 lulus. Kerjakan FASE 3.

LINGKUP
1. apps/sensor/api: REST + SSE untuk dashboard, auth via DASHBOARD_TOKEN.
   Validasi semua respons dengan skema zod di packages/shared.
2. apps/dashboard: React + Vite + Tailwind + shadcn/ui + Lucide.
   - styles/tokens.css dari DESIGN.md §2.6, petakan ke Tailwind.
   - Font Geist + JetBrains Mono, tabular-nums untuk semua angka.
   - Halaman Pos Komando sesuai DESIGN.md §7.1:
     header, meteran biaya (penyerang vs NEXA), ringkasan 4 angka,
     tabel kontak aktif, panel aturan (boleh kosong dulu).
   - Halaman Kontak: daftar sesi + linimasa satu sesi (DESIGN.md §7.2).
   - Update realtime via SSE.
   - Label "Data simulasi lab" di header.
3. Estimasi biaya = estTokens x harga per token dari konfigurasi; tampil sebagai estimasi.

ATURAN DESAIN (DESIGN.md §1 dan §10)
Flat total: tanpa shadow, gradien, glow, blur, denyut, badge/pil, kartu berlatar.
Satu aksen saja. Status ditandai warna teks + label. Loreng hanya di dasar sidebar.

ACCEPTANCE CRITERIA
- [ ] Saat pnpm lab:attack berjalan, angka di Pos Komando berubah realtime tanpa reload.
- [ ] Linimasa sesi menampilkan urutan langkah agen dan token per langkah.
- [ ] Tidak ada warna bawaan Tailwind (green-500 dsb.) di komponen; hanya token.
- [ ] Layout tidak overflow horizontal di lebar 390px.
- [ ] API menolak request tanpa token.
- [ ] Semua perintah verifikasi lulus.

PENUTUP
Ambil screenshot Pos Komando dan linimasa saat lab:attack berjalan,
laporkan pelanggaran DESIGN.md yang kamu temukan dan perbaiki. Commit:
"feat(dashboard): command post with live cost meter and session timeline".
```

---

## Prompt 4 — Canary dan Aturan dengan Gerbang Persetujuan

```
Fase 3 lulus. Kerjakan FASE 4.

LINGKUP
1. canary/
   - Kredensial/dokumen umpan fiktif dengan token unik per sesi, disisipkan ke labirin.
   - Endpoint callback mencatat triggeredAt + triggerIp.
   - Label di UI: "infrastruktur yang dipakai penyerang", bukan "C2 asli".
2. rules/
   - generate.ts: pola sesi -> draf rule Suricata (template, bukan LLM, untuk fase ini).
   - validate.ts: jalankan suricata -T di container; simpan syntaxValid.
   - deploy.ts: tulis ke SURICATA_RULES_DIR + reload, HANYA jika status approved
     dan ada decidedBy + decidedAt.
3. Tambahkan container Suricata ke docker-compose.
4. Dashboard: panel Aturan dengan Setujui/Tolak (DESIGN.md §8.4), halaman Aturan
   dengan riwayat keputusan.

ACCEPTANCE CRITERIA
- [ ] Canary yang dipakai agent tercatat dan tampil di linimasa sesi.
- [ ] Draf rule muncul otomatis setelah sesi selesai, dengan status validasi.
- [ ] Test regresi: deploy.ts menolak rule tanpa approval record.
- [ ] Setujui -> rule masuk ke folder Suricata dan Suricata reload tanpa error.
- [ ] Tolak -> rule tidak pernah ditulis.
- [ ] Semua perintah verifikasi lulus.

PENUTUP
Laporkan satu siklus end-to-end: deteksi -> labirin -> canary -> draf rule ->
approve -> deploy, dengan timestamp tiap langkah. Commit:
"feat(rules): canary tokens and operator-gated suricata rule pipeline".
```

---

## Prompt 5 — Intel LLM, MCP, Interogasi, Electron

```
Fase 4 lulus. Kerjakan FASE 5. Kerjakan sub-tugas berurutan; commit per sub-tugas
supaya kalau waktu habis, bagian yang sudah jadi tetap aman.

5A. intel/ (pasca-sesi)
- llm.ts: satu-satunya pintu ke model, baseURL + model + key dari env.
- redact.ts: samarkan IP, hostname, dan path internal sebelum kirim.
- queue.ts: antrean pasca-sesi + budget harian (tabel llm_budget); tolak saat lewat batas.
- summarize.ts: ringkasan pola, dugaan model + confidence, draf rule tambahan.
Acceptance:
- [ ] Test: payload ke model tidak mengandung data yang seharusnya tersamarkan.
- [ ] Test: queue berhenti saat budget habis.
- [ ] Halaman Intel menampilkan hasil per sesi.
Commit: "feat(intel): post-session LLM summaries with redaction and budget".

5B. mcp/
- intel.ts: server MCP (@modelcontextprotocol/server v2, >=2.2.0) yang mengekspos
  tool baca-saja untuk analis: daftar sesi, intel per sesi, draf rule.
- decoy.ts: endpoint MCP umpan sebagai bagian labirin; tool-nya hanya mengembalikan
  konten prosedural fiktif.
Acceptance:
- [ ] Klien MCP bisa listTools dan memanggil tool intel.
- [ ] Server intel tidak punya tool yang menulis atau men-deploy apa pun.
Commit: "feat(mcp): read-only intel server and decoy endpoint".

5C. interrogate/ (EKSPERIMENTAL)
- Sisipkan teks umpan dari file konfigurasi ke respons labirin, parse balasan agen,
  simpan ke intel.capturedPrompt.
- Tandai eksperimental di UI.
- Ukur tingkat keberhasilan terhadap attacker-agent lab di 2-3 model dan laporkan
  angka apa adanya.
Commit: "feat(interrogate): experimental decoy calibration prompts".

5D. apps/desktop
- Electron via electron-vite yang memuat dashboard dan bicara ke API sensor.
- Tanpa akses DB, tanpa secret di bundle.
Commit: "feat(desktop): electron shell for command post".

PENUTUP
Jalankan seluruh verifikasi dan satu run lab:attack penuh. Laporkan tabel metrik
dengan vs tanpa NEXA (PRD.md §9) dari data nyata lab.
```

---

## Prompt 6 — Hardening & Paket Submission

```
Semua fase selesai. Siapkan rilis untuk submission.

1. Audit terhadap AGENTS.md §2: untuk tiap 11 batasan, tunjukkan bukti
   (file + test) bahwa batasan itu ditegakkan. Perbaiki yang belum.
2. Jalankan pnpm audit; pin dependensi; catat versi di docs/.
3. docs/:
   - architecture.md dengan diagram alur (Mermaid).
   - install.md: langkah dari clone sampai demo jalan, termasuk docker compose.
   - prior-art.md: Mantis, Palisade LLM Agent Honeypot, Cloudflare AI Labyrinth,
     Nepenthes, dan apa kontribusi NEXA di atasnya.
4. README.md: ringkasan, screenshot, cara menjalankan, link ke docs/.
5. Satu script demo yang menyalakan semuanya dan menjalankan lab:attack.
6. Hasilkan tabel metrik final (PRD.md §9) dari 3 run lab.
7. Checklist kelengkapan submission dari rulebook: link publik, thumbnail
   1200x630 <=500KB, maksimal 5 screenshot, video <=10 menit, slide, dokumentasi.
   Tandai mana yang sudah dan belum.

Jangan menambah fitur baru di fase ini. Laporkan sisa risiko yang belum tertutup.
```

---

## Prompt Koreksi (pakai kapan saja)

```
Berhenti. Ada masalah: <jelaskan apa yang salah, sertakan output error atau screenshot>.

1. Diagnosis akar masalahnya sebelum mengubah kode. Jelaskan dalam 3-5 kalimat.
2. Usulkan perbaikan paling kecil yang menyelesaikannya.
3. Tunggu persetujuan saya, lalu terapkan.
4. Tambahkan test yang akan gagal kalau masalah ini muncul lagi.
5. Jalankan pnpm typecheck && pnpm lint && pnpm test dan tunjukkan hasilnya.
```

## Prompt Cek Status (kalau sesi terputus)

```
Baca ulang CLAUDE.md dan AGENTS.md. Lalu periksa git log, struktur repo, dan
hasil pnpm typecheck && pnpm lint && pnpm test.
Laporkan: fase mana yang sudah selesai sesuai acceptance criteria, apa yang
setengah jadi, dan langkah berikutnya. Jangan mengubah apa pun dulu.
```
