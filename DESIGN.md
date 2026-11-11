# DESIGN — NEXA

Sistem desain Dashboard NEXA (web dan aplikasi desktop). v0.2 · 11 November 2026

> Acuan: layar **Dashboard** di kanvas desain proyek (di v0.1 bernama "Pos Komando") dan implementasinya di `apps/dashboard`.
> Prinsip satu kalimat: **flat, gelap, tenang — kemewahan datang dari apa yang dibuang.**
> Perubahan v0.2: istilah profesional (§7), ikon di navigasi (§4), loreng hidup (§5), sidebar sticky dan bilah judul desktop kustom (§6), gerak bermakna (§8.6).

---

## 1. Prinsip Desain

1. **Flat sepenuhnya.** Tidak ada bayangan, gradien, glow, blur, glassmorphism, neon, atau efek cahaya apa pun.
2. **Gerak bermakna, tetap flat.** Gerak menandai peristiwa: konten masuk, data baru dari sensor, umpan balik klik, status koneksi. Hanya `transform`, `opacity`, dan warna, lewat keyframe `nx-*` sendiri (§8.6), tanpa easing yang memantul. Gerak berulang hanya untuk titik status sensor, spinner proses, dan loreng di dasar sidebar (§5); tidak ada hujan kode, scanline, atau animasi idle di area konten. Semua gerak wajib berhenti saat `prefers-reduced-motion`.
3. **Tanpa badge & pil.** Status ditandai **warna teks** saja, bukan kapsul berlatar. Titik status sensor selalu didampingi label teks.
4. **Tanpa kartu.** Bagian dipisah oleh **garis 1px** dan **ruang kosong**, bukan kotak berlatar atau border tebal.
5. **Satu aksen.** Hijau sage satu-satunya warna aksen, dipakai hemat: item navigasi aktif, angka biaya NEXA, tombol aksi primer, logo NEXA, titik "Sensor aktif", outline fokus, kilasan data baru (§8.6), dan garis grafik (§8.5). Daftar komponen yang boleh memakai kelas aksen dijaga `apps/dashboard/src/design.test.ts`.
6. **Tipografi membawa hierarki.** Ukuran, berat, dan warna teks — bukan dekorasi — yang membedakan penting vs tidak.
7. **Angka itu produk.** Semua angka memakai font mono dengan angka tabular agar tidak "bergoyang" saat berubah, termasuk selama animasi menghitung naik.
8. **Identitas lewat loreng digital, dosis kecil.** Satu tempat saja, nyaris menyatu dengan latar (lihat §5).
9. **Jujur.** Data contoh selalu berlabel "Data simulasi lab". Klaim di UI harus konsisten dengan PRD (mis. "model-agnostic", bukan "100% lokal" selama demo pakai API).

---

## 2. Warna (Design Tokens)

Palet diturunkan dari deskripsi warna PDL TNI baru (sage green, pola digital). **Bukan kode warna resmi TNI** — ini interpretasi untuk UI.

### 2.1 Permukaan & garis

| Token | Hex | Pemakaian |
|---|---|---|
| `--bg` | `#0C0F0D` | Latar utama aplikasi |
| `--surface` | `#0F130F` | Sidebar / panel samping |
| `--line` | `#232A24` | Garis pemisah bagian (1px) |
| `--line-subtle` | `#1A201B` | Garis antar baris tabel |
| `--line-strong` | `#343D35` | Border tombol sekunder |

### 2.2 Teks

| Token | Hex | Pemakaian |
|---|---|---|
| `--text` | `#E8E6DC` | Teks utama, angka kunci |
| `--text-2` | `#B9BDB0` | Teks sekunder, IP, isi rule |
| `--text-muted` | `#8E9686` | Label, keterangan, metadata |

### 2.3 Aksen & status

| Token | Hex | Pemakaian |
|---|---|---|
| `--accent` | `#A3B18A` | Satu-satunya aksen: nav aktif, biaya NEXA, tombol primer, logo, titik "Sensor aktif", outline fokus, kilasan data baru |
| `--on-accent` | `#0C0F0D` | Teks di atas tombol aksen |
| `--status-trapped` | `#E07A62` | "Terjebak" / ancaman (merah bata redup) |
| `--status-suspect` | `#D9A441` | "Dicurigai" (kuning tanah) |
| `--status-neutral` | `#8E9686` | "Keluar" / tidak aktif |

Status **wajib** juga dibedakan oleh **teks labelnya** ("Terjebak", "Dicurigai", "Keluar"), bukan warna saja — demi buta warna.

### 2.4 Loreng digital (hanya untuk tekstur)

| Token | Hex |
|---|---|
| `--camo-1` | `#161C17` |
| `--camo-2` | `#1D251D` |
| `--camo-3` | `#232B22` |
| `--camo-4` | `#26251E` |
| `--camo-5` | `#2C3529` |

Nada-nada ini sengaja sangat dekat dengan `--bg` agar loreng terbaca sebagai identitas, bukan dekorasi.

### 2.5 Pilihan aksen alternatif (Tweaks)
`#A3B18A` sage (default) · `#C9C2A8` krem · `#8FA896` hijau abu · `#B8A77A` khaki. Hanya satu yang aktif dalam satu waktu.

### 2.6 Implementasi (CSS custom properties + Tailwind)

```css
:root {
  --bg: #0C0F0D; --surface: #0F130F;
  --line: #232A24; --line-subtle: #1A201B; --line-strong: #343D35;
  --text: #E8E6DC; --text-2: #B9BDB0; --text-muted: #8E9686;
  --accent: #A3B18A; --on-accent: #0C0F0D;
  --status-trapped: #E07A62; --status-suspect: #D9A441; --status-neutral: #8E9686;
}
```

Di Tailwind 4, token dipetakan lewat `@theme inline` di `apps/dashboard/src/styles/index.css` (kelas `bg-surface`, `border-line`, `text-fg`, `text-muted`, `text-accent`, `text-status-trapped`, dst.). Palet, bayangan, blur, animasi, dan radius bawaan Tailwind dimatikan (`--color-*: initial`, `--animate-*: initial`, dst.). **Jangan** memakai palet bawaan Tailwind (`green-500`, dsb.) di komponen.

---

## 3. Tipografi

- **UI / judul / label:** **Geist** (400, 500, 600).
- **Data (angka, IP, token, durasi, rule, log):** **JetBrains Mono** (400, 500).
- Aktifkan `font-variant-numeric: tabular-nums` pada semua angka.
- Keduanya gratis, variable font, tersedia di Google Fonts.

### 3.1 Skala

| Peran | Font | Ukuran | Berat | Catatan |
|---|---|---|---|---|
| Angka hero (meteran biaya) | JetBrains Mono | 56px | 500 | `letter-spacing: -0.02em`, `line-height: 1` |
| Judul halaman | Geist | 28px | 500 | `letter-spacing: -0.01em` |
| Angka ringkasan | JetBrains Mono | 28px | 400 | tabular |
| Judul bagian | Geist | 16px | 500 | |
| Teks isi | Geist | 14px | 400 | `line-height: 1.5` |
| Data tabel | JetBrains Mono | 13px | 400 | tabular |
| Label kapital | Geist | 12px | 400 | `uppercase`, `letter-spacing: 0.08em`, `--text-muted` |
| Metadata | JetBrains Mono | 12px | 400 | `--text-muted` |

Berat maksimum 600 (hanya wordmark). Jangan pakai bold 700+ — terlihat murahan di gelap.

---

## 4. Ikonografi

- **Lucide** saja (bawaan shadcn/ui), warna mengikuti teks (`currentColor`), umumnya `--text-muted`. Stroke 1.75 untuk menu, label, dan judul bagian (16/18px); 1.5 untuk ikon judul halaman (28px); 2 untuk ikon di dalam tombol (16px).
- Ikon hanya bila menambah makna. Tiap menu navigasi punya ikon (tabel di §7); judul halaman memakai ikon menunya; judul bagian, label stat, dan label meteran boleh memakai ikon.
- Ikon di samping teks diberi `aria-hidden="true"`. Tombol ikon-saja **wajib** `aria-label`.
- Satu set ikon saja di seluruh aplikasi. Jangan campur Lucide dan Phosphor.
- Logo NEXA (`components/LogoMark.tsx`) adalah SVG flat sendiri, selaras dengan ikon aplikasi desktop: huruf N dalam bingkai `--line-strong` dengan garis bawah aksen.
- **Dilarang** memakai lambang resmi TNI AD/PUSSIBERAD di dalam aplikasi seolah produk resmi. Motif terinspirasi loreng aman; logo institusi tidak.

---

## 5. Loreng Digital — Aturan Pakai

- Bentuk: blok piksel persegi (grid 10px, 32×16 sel), dibangkitkan prosedural dan deterministik (seed tetap) sebagai SVG.
- **Hanya satu lokasi:** dasar sidebar (160px tinggi), disembunyikan di layar sempit. Opsional: layar kosong (empty state) dan splash Electron.
- **Dilarang** di belakang teks, tabel, angka, atau grafik — kamuflase memang dirancang mengganggu keterbacaan.
- `aria-hidden="true"` karena dekoratif.
- **Loreng hidup** (sejak v0.2). Semua nada tetap dari `--camo-*` dan `--line-strong`, tanpa glow:
  - sel tersusun bertahap dari pojok kiri atas saat tampil (`nx-camo-in`, ±1,3 detik total);
  - ±22% sel berganti nada sangat pelan (`nx-camo-blink`, siklus 5–11 detik, fase acak);
  - satu garis pindai redup (opasitas 0,35) menyapu tiap 9 detik (`nx-scan`);
  - sel yang dilewati kursor menyala `--line-strong`, lalu memudar ±1 detik (jejak).
- Saat `prefers-reduced-motion`, loreng tampil statis.

---

## 6. Tata Letak

- Sidebar kiri fleksibel (`flex: 1 1 220px`), konten `flex: 999 1 560px; min-width: 0`. Di layar sempit sidebar menumpuk di atas.
- Mulai `md` (≥768px) sidebar **sticky**: setinggi jendela dikurangi bilah judul dan tidak ikut tergulir. Isinya dari atas: logo + wordmark, menu berikon dengan indikator aktif, operator + tombol Keluar, loreng.
- Dashboard: panel kanan "Aturan menunggu persetujuan" **sticky** mulai `lg` (≥1024px) dan bergulir sendiri bila lebih tinggi dari jendela.
- Padding konten: `40px 48px 56px`. Jarak antar blok besar: `48px`. Jarak antar kolom: `56px`.
- Grid ringkasan: `repeat(auto-fit, minmax(180px, 1fr))`, gap 32px.
- Tabel lebar dibungkus `overflow-x: auto`; `min-width: 560px`.
- Radius: **2px** (tombol, logo). Elemen lain 0, kecuali titik status dan riak klik yang bulat. Tidak ada sudut membulat besar.
- Spacing kelipatan 4px (4, 8, 12, 16, 24, 32, 40, 48, 56).
- Scrollbar tipis berwarna `--line-strong` di atas latar transparan, bukan scrollbar bawaan sistem.

### 6.1 Bilah judul aplikasi desktop

- Bilah judul bawaan Windows disembunyikan (`titleBarStyle: 'hidden'` + `titleBarOverlay` berlatar `--bg`, simbol `--text-2`). Tombol jendela (minimize, maximize, close) tetap digambar sistem di kanan.
- Dashboard menggambar bilah 40px sendiri bila Window Controls Overlay aktif: logo · NEXA / nama halaman · titik status · jam WIB, dengan garis bawah `--line`. Di browser biasa bilah ini tidak tampil.
- Seluruh bilah bisa diseret untuk memindahkan jendela (`app-region: drag`). Elemen interaktif yang kelak ditaruh di bilah wajib diberi `app-no-drag`.
- Konten dan elemen sticky diberi offset `--titlebar-h` (0 di browser).
- Judul jendela: "NEXA — <nama halaman>". Halaman "Sensor tidak terjangkau" milik Electron memakai bilah seret yang sama.
- Tinggi 40px harus sama di `TITLEBAR_HEIGHT` dashboard (`lib/windowControls.ts`) dan desktop (`apps/desktop/src/main/security.ts`).

---

## 7. Layar

Label berbahasa Indonesia dengan istilah profesional yang lazim di produk keamanan. Label menu, judul halaman, dan ikon hanya didefinisikan di `apps/dashboard/src/lib/nav.ts`. Istilah militer v0.1 (Pos Komando, Kontak, Intel) tidak dipakai lagi.

| Menu | Judul halaman | Ikon (Lucide) | Rute | Nama v0.1 |
|---|---|---|---|---|
| Dashboard | Dashboard | `LayoutDashboard` | `#/` | Pos Komando |
| Sesi | Sesi terdeteksi; detail: Linimasa sesi | `Radar` | `#/sesi`, `#/sesi/<id>` | Kontak |
| Intelijen | Intelijen ancaman | `BrainCircuit` | `#/intel` | Intel |
| Aturan | Aturan deteksi | `ShieldCheck` | `#/aturan` | Aturan |

Rute lama `#/kontak` tetap diterima sebagai alias `#/sesi` agar tautan lama tidak putus.

### 7.1 Dashboard (utama)
1. **Header:** ikon + judul + metadata mono: titik status + "Sensor aktif" / waktu WIB / "Data simulasi lab".
2. **Meteran biaya:** dua kolom dipisah garis vertikal — "Biaya dibakar penyerang" (Rp + token, estimasi batas bawah) vs "Biaya NEXA" (warna aksen). Ini momen paling diingat di demo.
3. **Ringkasan:** Sesi terjebak · Rata-rata tertahan · Kedalaman maksimum · Aturan menunggu.
4. **Sesi aktif** (tabel) + **Aturan menunggu persetujuan** (panel kanan sticky, dengan Setujui/Tolak), berdampingan; menumpuk di layar sempit.

### 7.2 Sesi
Daftar **Sesi terdeteksi**; klik sesi → **Linimasa sesi**: langkah agen di dalam labirin, umpan yang disajikan, token per langkah, canary yang dipakai, dan draf aturan dari sesi itu. Layar demo kedua yang paling berguna.

### 7.3 Intelijen
**Intelijen ancaman** per sesi jebakan: pola serangan, dugaan model/framework dengan tingkat keyakinan, dan tangkapan interogasi (system prompt/tool, dilabel "eksperimental").

### 7.4 Aturan
**Aturan deteksi**: draf yang **menunggu persetujuan** (sudah lolos validasi sintaks `suricata -T`, dengan Setujui/Tolak) dan **riwayat keputusan** (siapa & kapan).

### 7.5 Latihan (roadmap)
Arena red-team bawaan untuk skor ketahanan decoy satuan.

### 7.6 Masuk
Logo, judul "Masuk ke Dashboard", kolom "Token API sensor" dan "Nama operator". Token salah: pesan galat bergetar sekali (`nx-shake`). Saat memeriksa, tombol menampilkan spinner (`nx-spin`).

---

## 8. Komponen

### 8.1 Tombol
- **Primer:** latar `--accent`, teks `--on-accent`, tanpa border, radius 2px, tinggi ≥44px, padding horizontal 16px, Geist 13px/500.
- **Sekunder:** latar transparan, teks `--text`, border 1px `--line-strong`.
- Hover: ubah warna latar/border sedikit (±1 langkah kecerahan; primer sedikit lebih terang, sekunder berlatar `--line-subtle`). Tanpa bayangan.
- Tekan: tombol mengecil ke 97% dan riak berwarna teks tombol menyebar dari titik klik lalu memudar (`nx-ripple`, 560 ms). Tanpa riak saat `disabled` atau `prefers-reduced-motion`.
- Proses: spinner (`nx-spin`) menggantikan ikon tombol, label tetap terbaca.
- Focus: outline 2px `--accent` offset 2px (wajib terlihat untuk keyboard).

### 8.2 Tabel
- Header: `--text-muted`, berat 400, garis bawah `--line`.
- Baris: garis bawah `--line-subtle`, padding vertikal 14px.
- Angka rata kanan; teks rata kiri. Status = warna teks.
- Tanpa zebra striping. Hover baris: latar `--line-subtle` (netral, bukan warna aksen/status).
- Baris masuk berurutan (`nx-row`); baris yang diperbarui sensor berkilas sekali (`nx-flash`). Lihat §8.6.

### 8.3 Stat / meteran
- Label kapital kecil `--text-muted` di atas (boleh dengan ikon Lucide 16px), angka mono besar, metadata kecil di bawah. Tanpa sparkline dekoratif.
- Angka menghitung naik saat pertama tampil (`useCountUp`, 900 ms, ease-out) dan berdetak sekali (`nx-tick`) setiap kali nilainya berubah lewat SSE.

### 8.4 Blok rule
- Isi rule dalam JetBrains Mono 12px `--text-2`, `overflow-wrap: anywhere`.
- Baris bawah: sumber sesi + status validasi (kiri), Setujui (ikon centang yang tergambar, `nx-draw`) / Tolak (kanan).
- Setelah keputusan operator, blok berkilas sekali (`nx-flash`).

### 8.5 Grafik (Recharts)
- Belum ada grafik di v0.2; aturan ini untuk grafik berikutnya.
- Garis 1.5px warna `--accent`; grid sangat redup (`--line-subtle`) atau tanpa grid.
- Tanpa area fill bergradien, tanpa dot di tiap titik.
- Matikan animasi bawaan Recharts (`isAnimationActive={false}`): animasi JS tidak ikut berhenti oleh `prefers-reduced-motion`.

### 8.6 Gerak

Semua keyframe ada di `apps/dashboard/src/styles/index.css` dan berawalan `nx-`. Animasi bawaan Tailwind (`animate-*`) dimatikan; `design.test.ts` menolak keyframe tanpa awalan `nx-`, bayangan, blur, dan gradien.

| Gerak | Durasi | Dipakai untuk |
|---|---|---|
| `nx-fade-up` (`.nx-page`) | 340 ms | Konten halaman saat pindah rute |
| `nx-row-in` (`.nx-row`) | 300 ms + 28 ms per indeks (maks. 16) | Baris tabel, linimasa, stat ringkasan, entri intelijen |
| `nx-flash` | 1400 ms | Baris sesi yang diperbarui sensor, blok rule setelah keputusan (latar aksen 14% → transparan) |
| `nx-tick` | 420 ms | Angka yang berubah; nama halaman di bilah judul |
| `nx-ripple` | 560 ms | Klik tombol |
| `nx-shake` | 420 ms | Pesan galat login |
| `nx-draw` | 420 ms | Ikon centang "Setujui" tergambar |
| `nx-spin` | 900 ms, berulang | Spinner proses |
| `nx-live` | 1800 ms, berulang | Cincin titik status sensor (diam saat terputus) |
| `nx-camo-in`, `nx-camo-blink`, `nx-scan` | lihat §5 | Loreng hidup |
| Indikator menu aktif | 300 ms (transisi) | Garis aksen 2px meluncur ke menu aktif |
| `useCountUp` | 900 ms (JS) | Angka meteran biaya dan ringkasan |

Aturan:
- Hanya `transform`, `opacity`, dan warna (latar, `fill`, `stroke-dashoffset`). Tanpa `box-shadow`, `filter: blur`, atau gradien.
- Easing `cubic-bezier(0.2, 0.7, 0.2, 1)` atau `ease-out`, tanpa overshoot. Transisi hover 150–300 ms.
- Gerak sekali jalan untuk peristiwa (masuk, berubah, klik). Gerak berulang hanya yang disebut di §1 prinsip 2.
- Gerak bukan satu-satunya pembawa informasi: data baru tetap terbaca dari angka dan teksnya.
- `prefers-reduced-motion: reduce` → semua `animation` dan `transition` menjadi `none`; hook JS (`useCountUp`, riak tombol) langsung ke nilai akhir.
- Gerak baru: tambahkan keyframe `nx-*` dan kelasnya di `@layer components`, lalu catat di tabel ini.

---

## 9. Aksesibilitas

- Kontras teks ≥4.5:1 (termasuk label abu kecil). Verifikasi `--text-muted` di atas `--bg`.
- Elemen interaktif nyata (`<button>`, `<a href>`, `<input>` + `<label>`), bukan div berklik.
- Target sentuh ≥44px.
- Status tidak mengandalkan warna saja (selalu ada teks). Titik status dan ikon di samping teks diberi `aria-hidden`.
- Hormati `prefers-reduced-motion`: semua gerak CSS dan JS berhenti (§8.6).

---

## 10. Do & Don't

| ✅ Lakukan | ❌ Jangan |
|---|---|
| Garis 1px + ruang kosong | Kartu berlatar, shadow, border tebal |
| Satu aksen sage | Banyak warna aksen, neon, glow |
| Status via warna teks + label; titik status sensor selalu berlabel | Badge/pil berlatar, titik status tanpa label |
| Angka mono tabular | Angka proporsional yang bergoyang |
| Gerak singkat yang menandai peristiwa (masuk, data baru, klik) | Animasi idle di area konten, hujan kode, efek neon |
| Loreng di dasar sidebar saja | Loreng di belakang konten |
| Label "Data simulasi lab" | Angka contoh tanpa label |
| Istilah profesional: Dashboard, Sesi, Intelijen, Aturan | Istilah lama (Pos Komando, Kontak) atau jargon generik "Overview", "Insights" |
| Hijau sage (beda dari tim lain yang ikut merah-hitam poster) | Ikut merah-hitam poster lomba |

---

## 11. Aset Submission

- **Thumbnail:** 1200×630, ≤500KB — pakai crop meteran biaya di atas latar `--bg`.
- **Screenshot:** maksimal 5 — Dashboard, Sesi, Linimasa sesi, Aturan, Intelijen (`docs/submission/screenshots/`, dibuat ulang dengan `node scripts/capture-screenshots.mjs`). Diagram arsitektur ada di `docs/architecture.md`.
- Semua screenshot memakai data lab nyata hasil uji tim, berlabel simulasi.
