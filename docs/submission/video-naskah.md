# Video tutorial NEXA: naskah, gaya, dan cara membuat ulang

Video tutorial dan demo untuk dewan juri: 6:14, 1920×1080 30 fps, 6 bab, narasi pria Bahasa
Indonesia, subtitle tertanam plus berkas `.srt`, musik dan efek suara orisinal. Gaya penyuntingan
mengikuti riset di [`video-riset.md`](video-riset.md).

## Bab (tempel di deskripsi YouTube)

```
0:00 Pembuka
0:25 Masalah
0:54 Cara kerja
1:59 Memasang NEXA
2:40 Demo langsung
5:04 Hasil lab
5:53 Penutup
```

## Data dan kejujuran

- Semua footage UI berasal dari satu run `lab:attack` nyata pada 12 November 2026 (model DeepSeek
  `deepseek-flash`, 15 langkah, 38 permintaan, terjebak 1,8 detik setelah permintaan pertama),
  terhadap salinan `data/nexa.db` dengan sensor mode lab, `lab/target-app`, dan Suricata 8.0.6 di
  WSL. Tombol Setujui ditekan sungguhan dan aturannya ter-deploy ke Suricata.
- Angka di bab Hasil lab dibaca dari `docs/metrics.json` (median run `deepseek-flash`, sama dengan
  `docs/metrics.md`). Panel terminal agen menampilkan permintaan dari event sesi itu sendiri.
  Keluaran di adegan terminal pemasangan adalah teks asli dari `scripts/ensure-env.mjs` dan
  `scripts/lab.mjs`.
- Setiap layar dashboard memuat label "Data simulasi lab". Interogasi dilaporkan sebagai
  eksperimental. Tidak ada klaim "100% lokal" karena demo memakai API DeepSeek.

## Suara

Narasi dibuat lokal di GPU (RTX 4060) dengan **Chatterbox** (Resemble AI, MIT) memakai bobot
fine-tune Bahasa Indonesia **grandhigh/Chatterbox-TTS-Indonesian** (Apache 2.0; data latih
SuaraGabungan-ID: Espeak-ID-5K, FLEURS dari Google dengan lisensi CC BY 4.0, ind_famal). Suara
yang dipakai adalah suara bawaan model, tanpa meniru suara orang. Tiap kalimat dibuat tiga kali dan
take terbaik dipilih otomatis dari skor alignment CTC (aligner wav2vec2 Indonesia
`indonesian-nlp/wav2vec2-indonesian-javanese-sundanese`, Apache 2.0). Keluaran Chatterbox membawa
watermark audio Perth bawaan Resemble AI. Istilah Inggris dieja ulang hanya untuk mesin suara
(`scripts/video/pron.py`); subtitle memakai ejaan asli.

Versi pertama video (4:34) memakai suara Microsoft `id-ID-ArdiNeural` dan dinilai terlalu kaku;
ElevenLabs tier free tidak mengizinkan suara Voice Library maupun Voice Design lewat API.

## Penyuntingan

- Cold open: agen sudah terjebak, kamera zoom ke status Terjebak lalu ke penghitung token.
- Footage direkam 2880×1620 (viewport 1440×810 skala 2), lalu di-zoom di pasca-produksi sehingga
  teks tetap tajam. Kamera mengikuti kata dalam narasi; sorotan meredupkan area lain dan memberi
  label (`scripts/video/tutorial/compositor.py`).
- Halaman yang digulir diputar dari rekaman per "beat" (peta waktu), dipercepat bila narasi rapat
  (paling cepat 3×). Halaman baru menunggu ±2 detik setelah sorotan terakhir supaya labelnya
  terbaca, kamera mundur ke tampilan penuh saat halaman berpindah, dan klik jatuh tepat pada kata
  yang menyebutnya (mis. "Setujui", lalu kamera pindah ke Riwayat keputusan: siapa dan kapan).
- Adegan HTML deterministik: kanvas arsitektur beranimasi, terminal pemasangan, hasil lab, penutup.
- Kartu bab di setiap pergantian bab, dissolve 0,45 detik, musik pad orisinal yang mengecil saat
  narasi, bunyi transisi dan klik yang disintesis sendiri (`music.py`, `tutorial/sfx.py`).

## Naskah (versi subtitle)

### Pembuka

Yang Anda lihat ini adalah agen AI penyerang yang sedang terjebak. Setiap detik ia membakar token
di labirin palsu, sementara aplikasi asli kami tidak tersentuh sama sekali.

Inilah NEXA. Sugeng rawuh, Bapak dan Ibu dewan juri. Dalam beberapa menit ke depan, kami tunjukkan
masalah yang kami selesaikan, cara kerja NEXA, cara memasangnya, dan demo lengkap dari serangan
sampai aturan blokir.

### 01 Masalah

Serangan siber kini tidak lagi dijalankan manusia satu per satu. Agen AI yang dibekali tool bisa
memindai situs, mencari kredensial, dan mencoba celah tanpa henti, dengan biaya yang sangat murah.
Pertahanan statis seperti daftar blokir IP atau signature selalu tertinggal satu langkah, karena
agen bisa berganti alamat dan pola dalam hitungan detik. Maka pertanyaannya: bagaimana kalau
kecerdasan penyerang justru kita jadikan kelemahannya?

### 02 Cara kerja

NEXA adalah lapisan deception defensif yang berdiri di depan aplikasi web sebagai reverse proxy.
Setiap permintaan dinilai dari 4 sinyal: user-agent otomasi, header browser yang hilang, ritme
yang terlalu cepat, dan honeylink, yaitu tautan tersembunyi yang hanya diikuti mesin. Pengunjung
sah diteruskan apa adanya ke aplikasi asli. Begitu skor sebuah sesi melewati ambang, klien itu
dibelokkan ke labirin umpan. Labirin ini dibangkitkan secara prosedural dari seed, jadi tidak ada
LLM di jalur request, dan NEXA tidak membakar satu token pun selama agen tertahan. Setiap halaman
umpan berisi canary, yaitu kredensial dan dokumen palsu yang unik per sesi. Begitu canary dipakai,
itu bukti bahwa agen menelan umpan. Setelah sesi berakhir, dosir disamarkan lebih dulu, lalu
dirangkum oleh LLM dengan budget harian. Dari sana NEXA menyusun draf aturan Suricata yang
divalidasi otomatis, tetapi tidak ada yang aktif tanpa persetujuan operator. NEXA hanya bertahan,
tidak pernah menyerang balik.

### 03 Memasang NEXA

Sekarang cara memasangnya. Yang dibutuhkan hanya Git, Node versi 20 ke atas, dan pnpm. Docker dan
Suricata bersifat opsional. Clone repositorinya, jalankan pnpm install, lalu pnpm env:init.
Perintah ini membuat berkas .env dengan rahasia acak yang tidak pernah dicetak ke layar. Nyalakan
lab dengan pnpm lab:up. NEXA memilih otomatis: Docker bila tersedia, atau proses lokal. Dashboard
terbuka di port 8081, dan akun pertama yang mendaftar menjadi pemilik. Untuk Windows, tersedia
juga aplikasi desktop di halaman rilis GitHub.

### 04 Demo langsung

Kita mulai dari sudut pandang pengunjung biasa. Ini portal fiktif BAYU-7 yang kami lindungi di
lab. Halamannya tampil normal, dan NEXA sama sekali tidak terlihat.

Sekarang kami lepaskan agen AI penyerang dengan perintah pnpm lab:attack. Agen ini dijalankan
model DeepSeek dengan tool HTTP, dan diberi misi mencari data sensitif. Panel di kanan bawah
menampilkan setiap permintaannya, sesuai catatan sensor. Perhatikan dashboard. Dalam waktu kurang
dari 2 detik setelah permintaan pertamanya, agen terdeteksi dan statusnya menjadi terjebak. Angka
token yang dibakar penyerang terus naik, karena setiap halaman umpan yang ia baca harus diproses
modelnya. Ia mengira sedang menemukan arsip internal, padahal semua isinya palsu.

Buka menu Sesi untuk melihat semua klien yang terdeteksi. Di detail sesi, NEXA menunjukkan kenapa
klien ini ditandai: skor 1,0, dengan sinyal user-agent otomasi, header browser hilang, honeylink,
dan ritme cepat. Lalu di bagian canary, terlihat kredensial dan dokumen palsu yang benar-benar
dipakai agen.

Linimasa di dalam labirin mencatat setiap langkah agen. Ia membuka robots.txt, lalu langsung
mengikuti honeylink ke arsip internal. Setelah itu ia menemukan server MCP umpan, dan berulang
kali memanggil alat palsunya. Karena labirinnya deterministik per seed, setiap sesi bisa
direproduksi untuk investigasi.

Setelah sesi ditutup, NEXA merangkum intelijennya di menu Intelijen: pola serangan, dugaan model
atau framework, beserta tingkat keyakinannya. Data disamarkan dulu sebelum dikirim ke model, dan
pemakaiannya dibatasi budget harian, yang terlihat di bagian atas halaman.

Dari sesi itu lahir draf aturan Suricata di menu Aturan. Setiap draf sudah lolos validasi sintaks
(suricata -T). Operator meninjau isinya, lalu menekan Setujui. Baru setelah itu aturan dikirim ke
Suricata, dan riwayat keputusan mencatat siapa yang menyetujuinya dan kapan. Aturan aktif juga
bisa diekspor sebagai berkas nexa.rules.

Untuk tim, menu Pengguna mengatur 4 peran: Admin, Operator, Analis, dan Pemantau. Setiap keputusan
penting tercatat di Log audit, jadi setiap aturan yang aktif bisa ditelusuri asal-usulnya.

### 05 Hasil lab

Bagaimana hasilnya? Kami menguji NEXA di lab dengan 11 run agen. 11 dari 11 terdeteksi dan
dijebak, dengan median 1,8 detik. Tanpa NEXA, seluruh 58 permintaan agen sampai ke aplikasi asli.
Dengan NEXA, hanya 2 dari 35, sisanya tertahan di labirin. Agen membakar lebih dari 200 ribu token
per run, sementara NEXA hanya memakai sekitar 3 ribu token untuk intel. Dari 14 sesi pengunjung
manusia simulasi, tidak satu pun yang ditandai. Kami juga mencoba menginterogasi agen lewat umpan.
Fitur ini masih eksperimental: 2 dari 11 run berhasil dibelokkan, dan 0 dari 11 membocorkan system
prompt penuh. Kami laporkan apa adanya.

### 06 Penutup

NEXA mengubah kecerdasan agen penyerang menjadi biaya bagi dirinya sendiri, sementara keputusan
tetap di tangan manusia. Semua yang tampil di video ini berasal dari run lab nyata. Dashboard
live, kode sumber, dan aplikasi desktopnya bisa Bapak dan Ibu coba lewat tautan di layar. Matur
nuwun.

## Membuat ulang

Alat bantu besar ada di luar repo (`D:\nexa-video-tools`): venv Python 3.11 dengan
`chatterbox-tts` dan PyTorch CUDA, model Chatterbox Indonesia, dan aligner wav2vec2. Python sistem
butuh `opencv-python`, `numpy`, `scipy`, `Pillow`, dan `fonttools`.

```bash
# 1. Lab: target-app :3000, sensor mode lab :8080/:8081 pada salinan DB baru, Suricata WSL menyala.
node scripts/video/tutorial/scenario.mjs > data/video/tutorial/scenario.json
LAB_MODE=local node scripts/video/record.mjs data/video/tutorial/scenario.json --out data/video/tutorial/clips
# 2. Narasi (GPU lokal)
D:/nexa-video-tools/tts-venv/Scripts/python.exe scripts/video/tutorial/tts_chatterbox.py --takes 3
# 3. Render: data/video/nexa-tutorial.mp4, .srt, dan data/video/tutorial/youtube-bab.txt
node scripts/video/tutorial/compose.mjs
```

`--draft` pada langkah 3 memakai durasi narasi perkiraan untuk meninjau alur tanpa audio.
`--plan-footage` hanya menulis rencana kamera dan sorotan (`build/comp-jobs.json`) serta linimasa
final (`build/timeline.json`) tanpa render, dan `--reuse-scenes` melewati adegan HTML yang sudah
dirender.
