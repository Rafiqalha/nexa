# DESIGN — NEXA

Sistem desain dashboard komando NEXA (Pos Komando). v0.1 · 10 November 2026

> Mockup acuan: layar **Pos Komando** di kanvas desain proyek.
> Prinsip satu kalimat: **flat, gelap, tenang — kemewahan datang dari apa yang dibuang.**

---

## 1. Prinsip Desain

1. **Flat sepenuhnya.** Tidak ada bayangan, gradien, glow, blur, glassmorphism, neon, atau efek cahaya apa pun.
2. **Tanpa gerak dekoratif.** Tidak ada denyut, kedip, scanline, hujan kode, atau animasi idle. Gerak hanya boleh untuk perubahan state yang dipicu pengguna (≤150 ms, tanpa easing bouncy), dan wajib dimatikan saat `prefers-reduced-motion`.
3. **Tanpa badge & pil.** Status ditandai **warna teks** saja, bukan kapsul berlatar.
4. **Tanpa kartu.** Bagian dipisah oleh **garis 1px** dan **ruang kosong**, bukan kotak berlatar atau border tebal.
5. **Satu aksen.** Hijau sage hanya untuk tiga hal: item navigasi aktif, angka biaya NEXA, tombol aksi primer.
6. **Tipografi membawa hierarki.** Ukuran, berat, dan warna teks — bukan dekorasi — yang membedakan penting vs tidak.
7. **Angka itu produk.** Semua angka memakai font mono dengan angka tabular agar tidak "bergoyang" saat berubah.
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
| `--accent` | `#A3B18A` | Satu-satunya aksen: nav aktif, biaya NEXA, tombol primer |
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

Di `tailwind.config`, petakan token ini ke `theme.extend.colors` (mis. `bg`, `surface`, `line`, `accent`, `status.trapped`). **Jangan** memakai palet bawaan Tailwind (`green-500`, dsb.) di komponen.

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

- **Lucide** (bawaan shadcn/ui). Stroke 1.5px, ukuran 16/20px, warna mengikuti teks (`currentColor`).
- Ikon hanya bila menambah makna. Navigasi boleh tanpa ikon (mockup tidak memakai ikon di nav).
- Tombol ikon-saja **wajib** `aria-label`.
- Satu set ikon saja di seluruh aplikasi. Jangan campur Lucide dan Phosphor.
- **Dilarang** memakai lambang resmi TNI AD/PUSSIBERAD di dalam aplikasi seolah produk resmi. Motif terinspirasi loreng aman; logo institusi tidak.

---

## 5. Loreng Digital — Aturan Pakai

- Bentuk: blok piksel persegi panjang (grid 10px), dibangkitkan prosedural sebagai SVG.
- **Hanya satu lokasi:** dasar sidebar (±160px tinggi). Opsional: layar kosong (empty state) dan splash Electron.
- **Dilarang** di belakang teks, tabel, angka, atau grafik — kamuflase memang dirancang mengganggu keterbacaan.
- `aria-hidden="true"` karena dekoratif.
- Tidak beranimasi ("menyusun diri" saat load **tidak** dipakai, sesuai prinsip flat).

---

## 6. Tata Letak

- Sidebar kiri fleksibel (`flex: 1 1 220px`), konten `flex: 999 1 560px; min-width: 0`. Di layar sempit sidebar menumpuk di atas.
- Padding konten: `40px 48px 56px`. Jarak antar blok besar: `48px`. Jarak antar kolom: `56px`.
- Grid ringkasan: `repeat(auto-fit, minmax(180px, 1fr))`, gap 32px.
- Tabel lebar dibungkus `overflow-x: auto`; `min-width: 560px`.
- Radius: **2px** (tombol). Elemen lain 0. Tidak ada sudut membulat besar.
- Spacing kelipatan 4px (4, 8, 12, 16, 24, 32, 40, 48, 56).

---

## 7. Layar

Label berbahasa Indonesia dengan istilah militer.

### 7.1 Pos Komando (utama)
1. **Header:** judul + metadata mono "Sensor aktif / waktu WIB / Data simulasi lab".
2. **Meteran biaya:** dua kolom dipisah garis vertikal — "Biaya dibakar penyerang" (Rp + token) vs "Biaya NEXA" (Rp 0, warna aksen). Ini momen paling diingat di demo.
3. **Ringkasan:** Sesi terjebak · Rata-rata waktu tertahan · Kedalaman labirin maksimum · Aturan menunggu persetujuan.
4. **Kontak aktif** (tabel) + **Aturan menunggu persetujuan** (daftar dengan Setujui/Tolak), berdampingan; menumpuk di layar sempit.

### 7.2 Kontak
Daftar sesi; klik sesi → **linimasa** agen di dalam labirin (langkah, umpan yang disajikan, token per langkah, canary dipicu). Layar demo kedua yang paling berguna.

### 7.3 Intel
System prompt/tool yang tertangkap (dilabel "eksperimental"), dugaan model/framework dengan tingkat keyakinan, pola serangan.

### 7.4 Aturan
Semua draf rule, status validasi sintaks, riwayat setuju/tolak, siapa & kapan.

### 7.5 Latihan (roadmap)
Arena red-team bawaan untuk skor ketahanan decoy satuan.

---

## 8. Komponen

### 8.1 Tombol
- **Primer:** latar `--accent`, teks `--on-accent`, tanpa border, radius 2px, tinggi ≥44px, padding horizontal 16px, Geist 13px/500.
- **Sekunder:** latar transparan, teks `--text`, border 1px `--line-strong`.
- Hover: ubah warna latar/border sedikit (±1 langkah kecerahan). Tanpa bayangan, tanpa scale.
- Focus: outline 2px `--accent` offset 2px (wajib terlihat untuk keyboard).

### 8.2 Tabel
- Header: `--text-muted`, berat 400, garis bawah `--line`.
- Baris: garis bawah `--line-subtle`, padding vertikal 14px.
- Angka rata kanan; teks rata kiri. Status = warna teks.
- Tanpa zebra striping, tanpa hover-highlight berwarna.

### 8.3 Stat / meteran
- Label kapital kecil `--text-muted` di atas, angka mono besar, metadata kecil di bawah. Tanpa ikon, tanpa sparkline dekoratif.

### 8.4 Blok rule
- Isi rule dalam JetBrains Mono 12px `--text-2`, `overflow-wrap: anywhere`.
- Baris bawah: sumber sesi + status validasi (kiri), Setujui/Tolak (kanan).

### 8.5 Grafik (Recharts)
- Garis 1.5px warna `--accent`; grid sangat redup (`--line-subtle`) atau tanpa grid.
- Tanpa area fill bergradien, tanpa dot di tiap titik, tanpa animasi masuk.

---

## 9. Aksesibilitas

- Kontras teks ≥4.5:1 (termasuk label abu kecil). Verifikasi `--text-muted` di atas `--bg`.
- Elemen interaktif nyata (`<button>`, `<a href>`, `<input>` + `<label>`), bukan div berklik.
- Target sentuh ≥44px.
- Status tidak mengandalkan warna saja (selalu ada teks).
- Hormati `prefers-reduced-motion`.

---

## 10. Do & Don't

| ✅ Lakukan | ❌ Jangan |
|---|---|
| Garis 1px + ruang kosong | Kartu berlatar, shadow, border tebal |
| Satu aksen sage | Banyak warna aksen, neon, glow |
| Status via warna teks + label | Badge/pil, titik berdenyut |
| Angka mono tabular | Angka proporsional yang bergoyang |
| Loreng di dasar sidebar saja | Loreng di belakang konten |
| Label "Data simulasi lab" | Angka contoh tanpa label |
| Istilah militer Indonesia | Jargon generik "Dashboard Overview" |
| Hijau sage (beda dari tim lain yang ikut merah-hitam poster) | Ikut merah-hitam poster lomba |

---

## 11. Aset Submission

- **Thumbnail:** 1200×630, ≤500KB — pakai crop meteran biaya di atas latar `--bg`.
- **Screenshot:** maksimal 5 — Pos Komando, linimasa sesi, intel, panel aturan, diagram arsitektur.
- Semua screenshot memakai data lab nyata hasil uji tim, berlabel simulasi.
