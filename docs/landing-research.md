# Riset Landing Page NEXA

Diriset 11 November 2026 dengan membuka langsung tiap situs di browser: screenshot di beberapa
posisi gulir, plus skrip kecil di halaman untuk mendeteksi teknik animasi (pustaka, canvas,
keyframe CSS, aturan gradien/bayangan).

## Situs yang ditinjau

| Situs | Kategori | Teknik yang terlihat | Diambil untuk NEXA | Dihindari |
|---|---|---|---|---|
| [Oxide](https://oxide.computer) | Infrastruktur | Anotasi teknis "FIG. 1", konsol produk yang berganti tab sendiri di hero, gambar rak muncul dari noise dither, judul dua nada, grid garis 1px + label mono | Anotasi "FIG.", materialisasi dari piksel (versi loreng), judul dua nada, grid garis | — |
| [Helsing](https://helsing.ai) | Defense AI | Footage sinematik dengan kotak deteksi garis tipis + label mono | Kotak deteksi HUD yang menandai agen | Footage berwarna merah menyala |
| [Anduril](https://www.anduril.com) | Defense tech | Lenis (smooth scroll), garis progres preloader, manifesto huruf kapital rata penuh dengan label mikro per kolom | Manifesto editorial dengan label mikro ("EST.", "→") | Grid kartu foto, scroll yang dibajak |
| [Mistral](https://mistral.ai) | AI | 58 keyframe CSS tanpa WebGL, maskot piksel, mosaik piksel memudar per sel, kata terakhir judul berganti, indeks bagian sticky | Mosaik/loreng per sel, kata judul berganti, indeks sticky | — |
| [Modal](https://modal.com) | Infrastruktur AI | Indeks sticky + panel diagram yang berubah sesuai langkah, 14 canvas | Scrollytelling: indeks kiri + figur kanan yang berubah per langkah | Titik partikel bulat |
| [Linear](https://linear.app) | Devtools | 222 keyframe; UI produk asli sebagai hero dengan peristiwa berurutan; ilustrasi isometrik garis | Cerita UI produk yang diputar berurutan; ilustrasi garis | 99 aturan gradien & 81 bayangan |
| [Exa](https://exa.ai) | AI search | Demo produk interaktif di hero, batang benchmark tumbuh | Demo yang bisa dicoba tanpa daftar; batang perbandingan | Tema terang |
| [Teenage Engineering](https://teenage.engineering) | Hardware | Navigasi berpiktogram + teks mikro dua baris | Item navigasi/daftar dengan piktogram + keterangan mikro | Foto produk penuh layar |
| [Nothing](https://nothing.tech) | Hardware | Ikon dot-matrix, tipografi mono kapital | Ikonografi mikro yang tegas | Latar blur |
| [Thinkst Canary](https://canary.tools) | Deception (pesaing konsep) | Janji singkat + bukti angka ("Know. When it matters.") | Pola copy: janji lalu bukti | Hero gradien hijau, kartu testimoni berbayangan |
| [Vercel](https://vercel.com) | Infrastruktur | Segitiga dengan halo cahaya dithered | — | Halo/efek cahaya (contoh "AI slop") |

## Keputusan: "Lapangan taktis" × labirin prosedural

Bukan satu referensi, tapi gabungan yang paling cocok dengan produk dan DESIGN.md:

1. **Struktur & tipografi** dari Oxide + Linear: grid garis 1px, judul dua nada, anotasi "FIG.".
2. **Identitas** dari loreng NEXA sendiri, dihidupkan seperti mosaik Mistral dan
   materialisasi Oxide: visual tersusun dari sel loreng, tanpa cahaya.
3. **Cerita produk** gaya Linear + Modal: satu sesi penyerang diputar langkah demi langkah,
   dikendalikan gulir pengguna (bukan dibajak).
4. **HUD deteksi** gaya Helsing: kotak garis tipis + label mono menandai agen di hero.
5. **Interaktivitas** gaya Exa: pengunjung bisa melepas agen dan membangkitkan labirin dari
   seed sendiri tanpa daftar.
6. **Manifesto** gaya Anduril: satu pernyataan besar dengan label mikro.

## Animasi yang membuat betah

| Animasi | Mekanisme | Pesan produk |
|---|---|---|
| Arena hero | Canvas 2D: permintaan mengalir, gerbang NEXA memeriksa, kotak HUD menandai agen, agen dibelokkan ke labirin dan berkeliling tanpa ujung; tombol "Lepas agen" | Deteksi → belokkan → tahan, pengunjung sah tetap lewat |
| Kata judul berganti | Sapuan blok solid (seperti redaksi) | Agen tersesat / membakar token / terekam |
| Scrollytelling 6 langkah | Indeks sticky + figur SVG yang berubah per langkah | Deteksi, belokkan, tahan, canary, redaksi, persetujuan |
| Labirin dari seed | Canvas: seed → labirin deterministik + daftar halaman umpan (PRNG & kosakata fiktif sensor) | Tanpa LLM di jalur penyerang; seed sama = labirin sama |
| Hasil lab | Bagan satuan: satu sel = satu permintaan agen, terisi berurutan (sampai ke aplikasi vs ditahan di labirin) + angka menghitung naik (mono tabular) | Angka nyata, berlabel "Data simulasi lab" |
| Wordmark loreng | Sel loreng menyala di bawah kursor lalu memudar | Identitas |

## Putaran 2: tur produk dan maskot (12 November 2026)

Permintaan: video showcase produk seperti situs startup (contoh plyxl.com), lebih banyak hal yang
menghidupkan halaman, dan robot di hero yang bermain (duduk di atas tombol, berdiri, berjalan).
Situs dibuka langsung di browser dan diperiksa DOM-nya.

| Referensi | Yang ditemukan | Diambil untuk NEXA |
|---|---|---|
| [plyxl.com](https://plyxl.com) | "Video" produknya ternyata bukan `<video>` dan bukan canvas: UI produk berkode di dalam bingkai jendela, pil keterangan yang menarasikan tiap langkah, kursor palsu yang mengetik dan mengklik, lalu kamera memperbesar ke area aksi | Tur produk FIG. 02 dengan pola yang sama |
| [PostHog hedgehog-mode](https://github.com/PostHog/hedgehog-mode) (MIT) | Maskot berjalan dan melompat di atas elemen DOM yang dijadikan pijakan; bisa dikendalikan | Elemen DOM sebagai pijakan robot. Paketnya tidak dipakai (PixiJS, berat). |
| [oneko.js](https://github.com/adryd325/oneko.js) | Kucing piksel mengikuti kursor dan tidur saat dibiarkan (mesin keadaan Neko klasik) | Robot melirik kursor, melambai saat didekati, tertidur setelah 30 detik tanpa aktivitas |
| [Screen Studio](https://screen.studio/guide/auto-zoom) | Rekaman demo dengan zoom otomatis ke titik klik dan kursor yang dihaluskan | Kamera tur produk memperbesar ke setiap klik |

Keputusan:

1. **Tur produk berkode, bukan file video.** Dashboard NEXA tiruan (`modules/reel-mock.ts`,
   tata letak dan label mengikuti tangkapan layar dashboard asli) diputar menurut naskah
   (`modules/reel-script.ts`): 5 bab, 14 keterangan, kamera, kursor, dan klik. Hasilnya tajam di
   zoom berapa pun, ringan, bisa dijeda (WCAG 2.2.2), dan bisa lompat bab. Semua keadaan dihitung
   murni dari detik T. Label "Ilustrasi · Data simulasi lab". Angka diambil dari median run
   deepseek-flash, bobot dan ambang dari sensor; dijaga `modules/reel.test.ts`.
2. **Robot "agen uji" di hero.** SVG flat buatan sendiri dengan warna token, tanpa Lottie, Rive,
   atau PixiJS. Garis atas arena menjadi lantai, tombol CTA menjadi pijakan. Robot berjalan,
   melompat, duduk mengayunkan kaki, memantul di tombol, menari, melambai, melirik judul saat kata
   berganti, mengomentari tombol arena, tertidur saat halaman didiamkan, dan bisa diangkat lalu
   dilempar. Tombol hanya dipakai sebagai pijakan bila ruang di atasnya cukup, jadi robot tidak
   menutupi tombol lain di layar sempit. Ada tombol "Istirahatkan robot" yang diingat di
   `localStorage`.
3. **Penghidup lain.** Jendela tur "mendekat" mengikuti gulir lewat CSS `animation-timeline:
   view()` (peningkatan progresif, tanpa membajak gulir), dan robot kedua tidur di puncak huruf A
   wordmark footer (klik untuk menyapa).

| Animasi | Mekanisme | Pesan produk |
|---|---|---|
| Tur produk | DOM + transform kamera, naskah berwaktu, kursor dan riak klik | Deteksi → jebak → canary → intelijen → persetujuan, di UI produk |
| Robot hero | SVG + fisika gravitasi, pijakan dari tata letak DOM, mesin keadaan perilaku | Agen AI "sibuk bermain", pengunjung sah tidak terganggu |
| Robot footer | Pose statis + "z" nx-z | Penutup yang ramah |

## Aturan gerak landing

Landing mewarisi token, font, dan prinsip flat dari DESIGN.md. Bedanya hanya pada dosis gerak:
landing boleh punya animasi interaktif dan berulang di area konten (dashboard tidak). Aturan:

- Hanya `transform`, `opacity`, warna, `stroke-dashoffset`, dan piksel canvas berwarna token.
  Tanpa bayangan, gradien, glow, blur, glassmorphism, neon, scanline, atau hujan kode.
- Keyframe berawalan `nx-`; easing tanpa overshoot. Maskot memakai lompatan gravitasi, sedangkan
  pemulihan squash dan antena memakai pegas teredam kritis yang tidak memantul (diuji di
  `lib/bot-physics.test.ts`).
- Gerak otomatis yang panjang bisa dihentikan pengguna: tombol jeda tur produk dan tombol
  "Istirahatkan robot".
- Gulir native: tanpa smooth-scroll yang membajak, tanpa pin yang memaksa.
- Canvas berhenti saat keluar layar atau tab tersembunyi; DPR dibatasi 2.
- `prefers-reduced-motion: reduce` → semua gerak berhenti, canvas menggambar satu frame statis,
  angka langsung ke nilai akhir.
- Animasi hero diberi label "Ilustrasi, bukan data langsung"; angka hasil berlabel
  "Data simulasi lab" dan sama dengan `docs/metrics.json` (dijaga test).
- Dijaga `apps/landing/src/design.test.ts`.
