# CLAUDE.md — NEXA

Instruksi untuk Claude Code di repo ini.

**Sumber kebenaran teknis ada di `AGENTS.md`.** Baca seluruhnya sebelum menulis kode, terutama §2 Batasan Keamanan. File ini hanya menambahkan cara kerja khusus Claude.

Dokumen lain:
- `PRD.md` — lingkup, non-tujuan, risiko, metrik.
- `DESIGN.md` — token warna, tipografi, aturan UI flat.

---

## 1. Konteks dalam satu paragraf

NEXA adalah proyek hackathon (Kartika Cyber Hackathon 2026, kategori Penangkalan) berupa lapisan deception **defensif**: mendeteksi agen AI penyerang di reverse proxy, menahannya di labirin umpan prosedural, merekam sesinya, dan menghasilkan draf aturan blokir yang perlu persetujuan operator. Deadline submission **15 November 2026, 23:59 WIB**. Fungsionalitas demo yang utuh lebih penting daripada jumlah fitur.

---

## 2. Aturan yang paling sering terlupa

Ulangan dari `AGENTS.md` §2 — paling sering dilanggar tanpa sengaja:

- **Jangan panggil LLM di jalur request.** Kalau sedang menulis handler di `detect/`, `labyrinth/`, `canary/`, atau `proxy/`, jangan import `intel/llm.ts`.
- **Semua panggilan model lewat `intel/llm.ts`**, setelah `intel/redact.ts`, dan dicek budget.
- **Tidak ada deploy rule tanpa approval record.**
- **Secrets tidak pernah ke dashboard, Electron, log, atau repo.**
- **Lab hanya menyasar `lab/target-app`.** Agen uji tetap minimal; jangan tambahkan kemampuan eksploitasi, evasion, atau persistence.
- **UI flat.** Tanpa shadow, gradien, glow, denyut, badge, kartu. Lihat `DESIGN.md`.

Kalau sebuah permintaan tampak butuh melanggar salah satu di atas, **berhenti dan tanyakan** pemilik proyek, jangan cari jalan memutar.

---

## 3. Cara kerja

1. **Pahami dulu.** Untuk perubahan non-trivial, baca file terkait dan nyatakan rencana singkat sebelum mengedit.
2. **Perubahan kecil dan bertahap.** Satu modul/fitur per langkah; jalankan test setelahnya.
3. **Ikuti urutan prioritas** di `AGENTS.md` §12. Jangan mengerjakan Electron atau interogasi sebelum demo minimal (labirin + attacker-agent) hidup.
4. **Verifikasi sebelum bilang selesai:**
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```
   Untuk perubahan alur inti, juga jalankan `pnpm lab:up && pnpm lab:attack` dan cek event masuk di DB/dashboard.
5. **Tambahkan test** untuk tiap aturan keamanan yang disentuh (lihat `AGENTS.md` §10, "Regresi keamanan").
6. **Jangan mengubah** `PRD.md`, `DESIGN.md`, `AGENTS.md`, atau file ini kecuali diminta.

---

## 4. Kapan harus bertanya dulu

- Menambah dependensi baru yang besar.
- Mengubah skema DB yang sudah termigrasi.
- Apa pun di `rules/deploy.ts`, `intel/redact.ts`, `intel/llm.ts`, atau `lab/attacker-agent`.
- Mengubah klaim produk yang tampil di UI (mis. teks soal kedaulatan data).
- Menghapus file atau data.

---

## 5. Konvensi cepat

- TypeScript strict, ESM, zod untuk semua input eksternal, tanpa `any`.
- Hono untuk server; Drizzle + better-sqlite3 untuk DB; SSE untuk realtime.
- React + Tailwind + shadcn/ui di dashboard; pakai token dari `apps/dashboard/src/styles/tokens.css`, bukan warna bawaan Tailwind.
- Font: Geist (UI), JetBrains Mono (data, angka tabular). Ikon: Lucide saja.
- Teks UI dalam Bahasa Indonesia dengan istilah militer (Pos Komando, Kontak, Intel, Aturan, Latihan).
- Commit: Conventional Commits.

---

## 6. Tips spesifik repo

- Labirin harus **deterministik per seed**; saat debugging gunakan seed tetap agar hasil bisa direproduksi.
- Estimasi token penyerang = jumlah karakter yang disajikan ÷ rasio karakter-per-token yang dikonfigurasi. Tampilkan sebagai **estimasi**.
- Electron hanya memuat dashboard dan bicara ke API sensor. Jangan pasang `better-sqlite3` di Electron (menghindari rebuild modul native).
- Untuk demo, data di dashboard harus berasal dari run `lab:attack` nyata dan tetap berlabel "Data simulasi lab".
- Interogasi (`interrogate/`) bersifat eksperimental; kerjakan terakhir, dan laporkan tingkat keberhasilan apa adanya.
