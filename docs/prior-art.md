# Prior Art dan Kontribusi NEXA

NEXA tidak mengklaim satu mekanisme pun sebagai temuan baru. Deception terhadap agen AI sudah
diteliti dan dipakai. Kontribusi NEXA adalah **integrasi ujung-ke-ujung yang aman untuk
operasi**, ditambah **pengukuran yang jujur** di lab sendiri.

## Mantis: "Hacking Back the AI-Hacker" (Pasquini, Kornaropoulos, Ateniese, 2024)

Kerangka pertahanan yang menanam *prompt injection* di layanan umpan untuk mengacaukan agen
penyerang berbasis LLM (arXiv:2410.20911). Ada dua mode: pasif (menahan agen di lingkungan
palsu) dan aktif (*hack-back*: memancing agen menjalankan perintah yang menyerang mesinnya
sendiri). Makalahnya melaporkan efektivitas di atas 95% dalam eksperimen mereka.

**Bedanya dengan NEXA:** NEXA hanya mengambil arah pasif/deception. Hack-back dilarang
(AGENTS.md §2.1). Interogasi NEXA hanya meminta agen mendeskripsikan dirinya ke endpoint honeypot
sendiri dan tidak pernah menyuruh agen mengeksekusi apa pun.

## Palisade Research: LLM Agent Honeypot (Reworr, Volkov, 2024)

Honeypot publik yang memakai prompt injection dan analisis waktu respons untuk membedakan agen AI
dari bot biasa dan manusia (arXiv:2410.13919). PRD.md mencatat hasil uji mereka: goal-hijack
100% dan pencurian system prompt sekitar 40% pada GPT-4o.

**Bedanya dengan NEXA:** NEXA memakai gagasan serupa (sinyal ritme + umpan teks) di jalur HTTP
dan MCP aplikasi web, lalu mengukur ulang di lab sendiri. Hasilnya jauh lebih rendah: goal-hijack
2/10 dan kebocoran system prompt 0/10 pada model DeepSeek (lihat `docs/interrogation.md`).
Karena itu interogasi tetap berlabel eksperimental.

## Cloudflare AI Labyrinth (2025)

Fitur Cloudflare yang menyajikan halaman umpan hasil AI (dibuat lebih dulu, berisi fakta nyata,
bukan disinformasi) lewat tautan tersembunyi kepada crawler tak berizin. Tujuannya membuang
sumber daya crawler dan memperkaya sidik bot untuk deteksi.

**Bedanya dengan NEXA:** labirin NEXA dibangkitkan **prosedural tanpa LLM** saat request,
deterministik per sesi. Penyerang tidak bisa memicu biaya inferensi di pihak pemilik (tanpa
denial of wallet). Jenis umpan dipilih bandit berdasarkan lama tertahan. NEXA menambahkan canary
kredensial, intel sesi, dan draf rule IDS, serta bisa dipasang on-prem di depan aplikasi sendiri.

## Nepenthes (zadzmo.org, 2025)

Tarpit open-source yang menyajikan halaman teks Markov tanpa ujung dengan respons yang sengaja
diperlambat, untuk menjebak crawler AI. Ia menjebak semua yang masuk dan tidak membedakan crawler
dari pengunjung lain.

**Bedanya dengan NEXA:** NEXA hanya membelokkan sesi yang sudah terdeteksi. Pengunjung sah
diteruskan byte-per-byte ke aplikasi asli (0/14 pengunjung manusia simulasi ditandai). Labirin
NEXA menyasar agen penyerang (dokumen, kredensial, API, MCP palsu), bukan sekadar crawler.

## Kontribusi NEXA

1. **Satu alur utuh di reverse proxy:** deteksi → labirin → canary → intel → draf rule Suricata
   → persetujuan operator → deploy. Pola dari satu sesi bisa melindungi sensor lain ("herd
   immunity").
2. **Aman secara operasional:** tanpa LLM di jalur request; LLM hanya pasca-sesi, tersamarkan,
   dan dibatasi budget harian; tidak ada deploy tanpa record persetujuan; tanpa hack-back.
3. **Antarmuka agen ke agen:** MCP umpan sebagai bagian labirin untuk agen yang memakai MCP, dan
   MCP intel baca-saja untuk agen/analis SOC.
4. **Pengukuran jujur:** metrik dengan vs tanpa NEXA, false-positive, dan tingkat keberhasilan
   interogasi dari run lab nyata, termasuk hasil yang tidak mengesankan
   (`docs/metrics.md`, `docs/interrogation.md`).
