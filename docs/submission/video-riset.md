# Riset gaya video tutorial (12 November 2026)

Acuan untuk versi kedua video demo NEXA (tutorial lengkap, maksimal 10 menit). Frame dianalisis
dari storyboard pratinjau YouTube (gambar seek bawaan), bukan unduhan video.

## Video yang dipelajari

| Video | Durasi | Penonton | Yang ditiru |
|---|---|---|---|
| [Tailscale: How to get started in under 10 minutes](https://www.youtube.com/watch?v=sPdvyR7bLqI) | 9:33 | 1,4 jt | Intro hanya 20 detik, lalu bab berbasis tugas (tambah perangkat, SSH, exit node). Layar aplikasi selalu memperlihatkan hasil nyata, bukan slide. |
| [Linear: Intro to Linear](https://www.youtube.com/watch?v=9Q5BoiIFBiY) | 4:01 | 215 rb | Rekaman UI penuh layar yang tajam, zoom halus ke panel yang dibahas, alur satu proyek dari awal sampai selesai, kartu logo di akhir. |
| [Raycast: 102 Things You Can Do](https://www.youtube.com/watch?v=G7_7F_FBqQE) | 6:53 | 63 rb | Label langkah bernomor di kiri bawah sepanjang segmen, jendela aplikasi melayang di atas latar merek, ritme cepat (ganti visual tiap 5–15 detik). |
| [Supabase Explained](https://www.youtube.com/watch?v=T-qAtAKjqwc) | 7:06 | 126 rb | Diagram arsitektur gelap sebagai kanvas besar: kamera bergeser dari node ke node, paket data berjalan di sepanjang garis, label tahap di kiri atas. |
| [Screen Studio: Turn boring screen recordings into engaging content](https://www.youtube.com/watch?v=-7240iOaGhM) | 3:10 | 23 rb | Zoom otomatis ke area klik, kursor besar yang halus, efek riak saat klik, bunyi klik halus, subtitle kecil di tengah bawah. |
| [Cloudflare Zero Trust Network Access Demo](https://www.youtube.com/watch?v=Lxp-LYbKwiY) | 7:12 | 74 rb | Demo produk keamanan: masalah dulu (VPN lama), lalu konfigurasi langkah demi langkah dengan bab bernama. |

## Pedoman juri dan demo

- 10–15 detik pertama menentukan apakah juri menonton sisanya: buka dengan produk yang bekerja
  dan satu kalimat nilai, bukan animasi logo atau salam panjang
  ([Superteam](https://superteam.ar/blog/hackathon-submission-that-wins),
  [Devpost](https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video)).
- Satu alur linear yang berpusat pada pengguna, klik nyata, tampilkan hanya yang benar-benar
  bekerja ([Reskilll](https://reskilll.com/blogs/hackathon-demo-presentation-tips-pitch-3-minutes-win-2026/),
  [Colosseum](https://blog.colosseum.com/perfecting-your-hackathon-submission/)).
- Zoom hanya saat ada kontrol atau hasil yang perlu diperhatikan; kursor bergerak dengan sengaja;
  dashboard penuh layar tanpa fokus membuat penonton kewalahan
  ([ContentBeta](https://www.contentbeta.com/blog/best-product-demo-video-examples/),
  [Tight Studio](https://tight.studio/blog/saas-demo-video-tools-for-founders/)).

## Keputusan untuk video NEXA v2

1. **Cold open 15 detik:** agen sudah terjebak dan penghitung token naik, satu kalimat nilai,
   baru logo dan salam.
2. **Enam bab bernama** (Masalah, Cara kerja, Memasang NEXA, Demo langsung, Hasil lab, Penutup)
   dengan kartu bab singkat dan label bab di pita atas.
3. **Kanvas arsitektur beranimasi** gaya Supabase: kamera bergeser dari reverse proxy ke deteksi,
   labirin, canary, intel, dan aturan; paket data berjalan di garis.
4. **Footage beresolusi tinggi lalu di-zoom di pasca-produksi** (gaya Screen Studio): kamera
   mengikuti kata dalam narasi, sorotan (spotlight) pada elemen yang dibahas, label langkah di kiri
   bawah.
5. **Terminal nyata** untuk bab pemasangan: perintah diketik, keluaran berasal dari menjalankan
   perintah itu sungguhan.
6. **Desain suara:** musik latar orisinal yang mengecil saat narasi, bunyi transisi dan klik halus.
7. **Kejujuran tetap terlihat:** label "Data simulasi lab", interogasi eksperimental dilaporkan
   apa adanya, tidak ada klaim "100% lokal".
