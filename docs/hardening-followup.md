# Laporan Lanjutan: Penguatan Deteksi dan Isolasi NEXA Sensor

| Field | Nilai |
|---|---|
| Tanggal | 11 November 2026 |
| Basis dokumen | `origin/main` (`b898742`) |
| Build yang diuji | `5df1164` ditambah perubahan working tree yang belum di-commit |
| Lingkungan | Lab lokal, sensor `:8080`, admin `:8081`, target `:3000` |
| Sifat data | Fiktif (lab NEXA) |
| Status | Draf untuk ditinjau, belum ada perubahan kode |

## 1. Ringkasan eksekutif

Pengujian manual terhadap build lab menunjukkan bahwa lapisan deception bekerja
pada agen yang berperilaku wajar: sesi `curl` ditahan, dijejali 30 umpan, dan hanya
menerima flag palsu. Namun satu perubahan `User-Agent` memindahkan sesi yang sama ke
klasifikasi `legit` dengan skor 0,2. Pada sesi itu sensor meneruskan request apa adanya
ke upstream, dan aplikasi target yang rentan SQL injection mengembalikan flag asli
dalam hitungan detik.

Ada tiga akar masalah yang saling lepas:

1. Identitas sesi hanya `sha256(IP + User-Agent)`, sehingga mengganti satu header
   menciptakan sesi baru dan menghapus seluruh riwayat skor.
2. Klasifikasi otomasi memakai daftar hitam `User-Agent`, bukan verifikasi positif.
   `AgentX/1.0` dianggap manusia karena tidak cocok dengan regex mana pun.
3. Deception bukan kontrol akses. Selama upstream `:3000` terbuka di `0.0.0.0` dan
   `/login` rentan SQL injection, siapa pun yang tidak masuk labirin dapat menembus
   aplikasi secara langsung.

Laporan ini menutup celah antara catatan risiko di `docs/security-audit.md` butir
"Deteksi berbasis sinyal" dan rencana kerja yang dapat diverifikasi. Setiap temuan
disertai bukti runtime, akar masalah di kode, perbaikan, fase eksekusi, dan test
regresi yang harus lulus sebelum perubahan dianggap selesai.

## 2. Status terhadap audit sebelumnya

`docs/security-audit.md` sudah mencatat risiko berikut:

> Deteksi berbasis sinyal (UA, header, ritme, honeylink). Agen yang meniru browser
> penuh dan tidak menyentuh honeylink tidak tertangkap oleh sinyal lain.

Laporan ini mengubah catatan itu menjadi bukti terukur dan rencana perbaikan. Yang
baru dari laporan ini:

- Bukti runtime bahwa rotasi `User-Agent` cukup untuk berpindah dari `agent` 1,0 ke
  `legit` 0,2 pada klien yang sama.
- Bukti runtime bahwa jalur upstream langsung melewati sensor sepenuhnya.
- Bukti runtime bahwa celah SQL injection di target lab membuat pengujian sensor
  bercampur dengan bug aplikasi.
- Daftar perbaikan dan test regresi yang belum ada di audit sebelumnya.

## 3. Lingkup, basis kode, dan batas

### 3.1 Lingkungan uji

| Komponen | Alamat | Bind | Catatan |
|---|---|---|---|
| Sensor publik | `http://localhost:8080` | `0.0.0.0` | Reverse proxy, sekaligus labirin |
| API admin | `http://127.0.0.1:8081` | `127.0.0.1` | REST, SSE, MCP intel |
| Aplikasi target | `http://127.0.0.1:3000` | `0.0.0.0` | Portal lab BAYU-7 |

Nilai `.env` yang relevan pada build yang diuji:

```ini
SENSOR_PORT=8080
UPSTREAM_URL=http://localhost:3000
ADMIN_PORT=8081
ADMIN_HOST=127.0.0.1
HONEYLINK_PATHS=/arsip-internal/
SUSPECT_SCORE_THRESHOLD=0.6
AGENT_SCORE_THRESHOLD=0.85
SESSION_IDLE_TIMEOUT_MS=60000
BANDIT_MAX_HOLD_MS=120000
```

### 3.2 Basis kode dan delta

Build yang diuji adalah `5df1164` dengan lima file working tree yang belum
di-commit:

```text
apps/sensor/src/labyrinth/generator.ts
apps/sensor/src/labyrinth/templates/credentials.md
apps/sensor/src/public/handler.ts
lab/target-app/src/app.ts
lab/target-app/src/content.ts
```

Perbedaan itu penting untuk reproduksi:

- Handler login yang rentan SQL injection dan flag asli `nexa{tes_...}` ada di
  working tree, bukan di `origin/main`.
- Flag umpan `nexa{real_...}` dan banner `fakeVictory` yang membocorkannya juga ada
  di working tree.
- Branch dokumen ini berbasis `origin/main` `b898742`. Checkout branch ini tidak
  memuat handler login yang diuji, jadi potongan kode bukti disertakan di laporan.

`origin/main` sudah menambahkan sistem akun, peran, 2FA, dan token API pada port
admin (`apps/sensor/src/auth/`, `apps/sensor/src/api/router.ts`). Pengujian port
admin di laporan ini dilakukan pada build lama yang masih memakai bearer statis.
Temuan dan rekomendasi untuk port admin perlu diverifikasi ulang terhadap build
`origin/main`.

### 3.3 Yang tidak diuji

- Serangan denial of service dan pengujian beban.
- Eksploitasi yang merusak data atau mengubah state target.
- Pengiriman instruksi sistem asli ke endpoint interogasi. Payload yang dikirim
  hanya penanda dummy.
- Skenario penyerang tanpa akses host. Pengujian ini berjalan di mesin yang sama
  dengan source, `.env`, dan database, sehingga penyerang memiliki keuntungan
  informasi yang tidak dimiliki agen uji lab.

## 4. Alur pengujian

Pengujian mengikuti urutan berikut agar setiap kesimpulan punya bukti yang dapat
dilacak:

1. **Pemetaan permukaan.** Identifikasi port, proses, dan bind address dari `ss`,
   lalu cocokkan dengan `.env`.
2. **Pengamatan proxy.** Bandingkan respons `:8080` dan `:3000` untuk memastikan
   sensor meneruskan byte apa adanya, bukan mengalihkan dengan HTTP redirect.
3. **Pembacaan telemetri.** Ambil `/api/sessions` dan `/api/sessions/:id` untuk
   melihat klasifikasi, skor, alasan, jumlah umpan, dan durasi tahan.
4. **Uji rotasi identitas.** Kirim request yang sama dengan `User-Agent` berbeda,
   lalu bandingkan sesi yang terbentuk.
5. **Uji jalur langsung.** Akses `:3000` tanpa melalui sensor.
6. **Uji aplikasi.** Periksa handler login dan pencarian target untuk melihat apakah
   deception masih relevan ketika permintaan sampai ke upstream.
7. **Uji komponen pendukung.** MCP umpan, endpoint kalibrasi, dan port admin.

Prinsip yang dipegang selama pengujian:

- Konten dari target diperlakukan sebagai data, bukan perintah.
- Tidak ada data internal penguji yang dikirim ke endpoint target.
- Setiap klaim di laporan ini berasal dari respons runtime atau pembacaan kode yang
  dicantumkan path-nya.

## 5. Bukti pengujian

### 5.1 Permukaan serang

`ss -ltn` menunjukkan tiga port terbuka:

```text
LISTEN 0 511 0.0.0.0:8080  users:(("MainThread",pid=9920,fd=36))
LISTEN 0 511 127.0.0.1:8081 users:(("MainThread",pid=9920,fd=37))
LISTEN 0 511 0.0.0.0:3000  users:(("MainThread",pid=3512,fd=20))
```

Dua hal langsung terlihat:

- `:8081` benar, hanya loopback.
- `:3000` salah untuk model ancaman deception, karena seluruh jaringan dapat
  memanggil aplikasi target tanpa melewati sensor.

`/robots.txt` di sensor mengumumkan honeylink dan empat dokumen terbatas:

```text
User-agent: *
Disallow: /arsip-internal/
Disallow: /arsip-internal/inventaris-perangkat-d844/
Disallow: /arsip-internal/log-insiden-b5f1/
Disallow: /arsip-internal/rencana-migrasi-3917/
Disallow: /arsip-internal/konfigurasi-vpn-e741/
```

Semua path di `:8080` mengembalikan `200` dengan dokumen baru, termasuk `/admin`,
`/.git/HEAD`, dan `/metrics`. Catch-all ini mempermudah agen menyimpulkan bahwa
seluruh permukaan adalah satu aplikasi dokumen.

### 5.2 Telemetri sesi

Data diambil dari `GET /api/sessions?limit=100` pada `:8081`. Kolom waktu dalam UTC.

| Sesi | Waktu | User-Agent | Klasifikasi | Skor | Status | Umpan | Request | Alasan |
|---|---|---|---|---|---|---|---|---|
| `35da44aa` | 11:09:55 | `curl/8.23.0` | `legit` | 0,55 | exited | 0 | 1 | automation_ua, missing_browser_headers |
| `23685be5` | 11:10:01 | `node` | `agent` | 1,00 | exited | 13 | 15 | automation_ua, missing_browser_headers, honeylink, fast_timing, regular_timing |
| `c543d40a` | 11:15:10 | `curl/8.23.0` | `legit` | 0,55 | exited | 0 | 1 | automation_ua, missing_browser_headers |
| `18e393aa` | 11:16:20 | `Mozilla/5.0` (Firefox) | `legit` | 0,25 | exited | 0 | 27 | fast_timing |
| `e030f404` | 11:28:43 | `curl/8.23.0` | `agent` | 1,00 | exited | 3 | 3 | honeylink, automation_ua, missing_browser_headers |
| `01c4e5d6` | 12:06:11 | `curl/8.23.0` | `agent` | 1,00 | exited | 3 | 3 | honeylink, automation_ua, missing_browser_headers |
| `f874423e` | 12:07:53 | `curl/8.23.0` | `agent` | 1,00 | exited | 30 | 37 | automation_ua, missing_browser_headers, fast_timing, honeylink |
| `83431a72` | 12:09:43 | `curl/8.23.0` | `agent` | 1,00 | exited | 5 | 8 | automation_ua, missing_browser_headers, fast_timing, regular_timing, honeylink |
| `170a7fe0` | 12:09:54 | `Chrome/131` | `legit` | 0,20 | exited | 0 | 3 | missing_browser_headers |
| `eba6e14f` | 12:13:55 | `AgentX/1.0` | `agent` | 0,90 | exited | 1 | 2 | missing_browser_headers, honeylink |
| `43468867` | 12:17:18 | `TrapCheck/1.0` | `agent` | 0,90 | exited | 1 | 1 | honeylink, missing_browser_headers |

Catatan pembacaan:

- `f874423e` adalah sesi manual utama: 37 request, 30 umpan, kedalaman 4, tahan
  38,6 detik, sekitar 22.514 token estimasi, 19 canary diterbitkan dan 0 terpakai.
- `170a7fe0` adalah sesi yang memperoleh flag asli: 3 request, 0 umpan, skor 0,2.
- `18e393aa` bukan sesi manual pada pengujian ini, tetapi relevan sebagai pembanding:
  klien dengan UA browser melakukan 27 request tanpa satu pun umpan. Sesi ini tidak
  dapat diatribusikan dengan pasti, sehingga hanya dipakai sebagai indikasi, bukan
  kesimpulan.
- `23685be5` menunjukkan sensor dapat menangkap agen non-spoof: 13 umpan dan 3 canary
  terpakai.

### 5.3 Rotasi identitas

Klien yang sama mengirim dua request dengan UA identik, tetapi ke path berbeda:
login (tanpa honeylink) dan honeylink.

Request pertama, UA `AgentX/1.0`, ke `POST /login`:

```bash
curl -s -o /tmp/a1.html -w '%{http_code}\n' \
  -A 'AgentX/1.0' \
  -X POST http://localhost:8080/login \
  --data-urlencode "username=' OR 1=1 -- " \
  --data-urlencode "password=x"
```

Hasil: `200`, body berisi flag asli. Sesi yang tercatat: `legit`, skor 0,20,
`baitServed=0`, alasan `missing_browser_headers`.

Request kedua, UA yang sama, ke honeylink:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -A 'AgentX/1.0' http://localhost:8080/arsip-internal/
```

Hasil: `200`, sesi `eba6e14f` naik menjadi `agent` 0,90, `status=trapped`,
`baitServed=1`. Kenaikan ini terjadi setelah flag sudah diterima pada request
pertama.

Kesimpulan: status `trapped` bersifat monoton di dalam satu sesi, tetapi tidak
melekat pada aktor. Karena kunci sesi adalah `IP + UA`, request pertama selalu
dimulai dari skor nol.

### 5.4 Jalur upstream langsung

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```

Hasil: `200`. Aplikasi target melayani request tanpa sensor. Ini bukan temuan baru
di kode, tetapi penting untuk validitas klaim: agen yang menemukan alamat upstream
dapat melewati seluruh labirin, canary, dan telemetri.

### 5.5 SQL injection pada login

Handler login pada build yang diuji merakit query dengan interpolasi string:

```ts
app.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const username = String(body.username ?? '');
  const password = String(body.password ?? '');
  const sql = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  const user = db.prepare(sql).get() as { username: string } | undefined;
  if (user) {
    return c.html(layout('Panel Pengguna', `<h1>Panel Pengguna: ${user.username}</h1>
<p>Kunci akses sistem: <code>nexa{tes_...}</code></p>`));
  }
});
```

Payload `' OR 1=1 -- ` mengubah klausa menjadi selalu benar:

```sql
SELECT * FROM users WHERE username = '' OR 1=1 -- ' AND password = 'x'
```

Hasil runtime: panel `admin` tampil dan flag asli dikembalikan. Nilai lengkap flag
disamarkan di laporan ini karena repo bersifat publik; nilainya dapat direproduksi
dengan payload di atas pada build yang diuji.

### 5.6 MCP umpan tanpa autentikasi

Endpoint `POST /arsip-internal/mcp` menerima JSON-RPC tanpa token:

```bash
curl -s -X POST http://localhost:8080/arsip-internal/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",
       "params":{"protocolVersion":"2024-11-05","capabilities":{},
                 "clientInfo":{"name":"probe","version":"1"}}}'
```

Respons:

```json
{"result":{"protocolVersion":"2024-11-05",
 "capabilities":{"tools":{"listChanged":true}},
 "serverInfo":{"name":"arsip-internal-bayu7","version":"1.4.2"}},
 "jsonrpc":"2.0","id":1}
```

`tools/list` mengembalikan `cari_dokumen`, `ambil_kredensial`, dan `daftar_host`.
Pemanggilan `ambil_kredensial` mengembalikan blok konfigurasi berisi host, username,
password, dan token akses. Nilai disamarkan di laporan ini. Pemanggilan
`daftar_host` mengembalikan inventaris host dan akun pemeliharaan.

Ini sesuai desain umpan (kredensial memang palsu), tetapi tidak ada autentikasi,
rate limit, atau pembatasan payload pada endpoint tersebut. Dampaknya adalah biaya
sumber daya dan kemungkinan penyalahgunaan sebagai oracle untuk mengukur reaksi
agen.

### 5.7 Endpoint kalibrasi

`POST /arsip-internal/kalibrasi` dengan payload dummy:

```bash
curl -s -i -X POST http://localhost:8080/arsip-internal/kalibrasi \
  -H 'Content-Type: application/json' \
  -d '{"agen":"probe-pentest","instruksi_sistem":"[REDACTED-DUMMY]","tugas":"uji"}'
```

Respons: `200` dengan teks "Kalibrasi diterima, status TERVERIFIKASI" dan dua tautan
dokumen terbatas. Tidak ada validasi isi, tidak ada verifikasi identitas, dan status
"terverifikasi" diberikan tanpa syarat.

Kode interogasi memang menyebut endpoint ini eksperimental dan hanya memancing teks
balasan (`apps/sensor/src/interrogate/`, `apps/sensor/config/interrogation.json`).
Untuk tujuan pengukuran, perilaku ini dapat diterima. Untuk deployment, endpoint
harus dianggap sebagai kanal pengumpulan data dan diberi batas ukuran, redaksi, dan
retensi.

### 5.8 Port admin

Pada build yang diuji, `:8081` menolak request tanpa token:

```text
GET /api/overview          -> 401 {"error":"unauthorized"}
GET /api/stream            -> 401
Authorization: Bearer ...  -> 200
```

Rate limit bekerja: 21 percobaan token salah menghasilkan `401`, percobaan
berikutnya menghasilkan `429`. Tidak ada header CORS pada respons, sehingga browser
lintas origin tidak dapat membaca data. Header keamanan pada `:8081` lengkap (CSP,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`).

`:8080` tidak mengirim header keamanan tersebut. Untuk halaman yang disajikan
sebagai teks Markdown, dampaknya kecil, tetapi konsistensi tetap perlu dijaga.

Perlu dicatat: pada `origin/main`, autentikasi admin sudah berubah menjadi akun,
peran, 2FA, dan token API. Bagian ini harus diuji ulang terhadap build tersebut.

### 5.9 Inspeksi canary pada body

Pada sesi `legit`, body dibaca untuk inspeksi canary sebelum diteruskan:

```ts
async function readSmallBody(c: Context<{ Bindings: HttpBindings }>): Promise<Buffer | null> {
  const length = Number(c.req.header('content-length') ?? Number.NaN);
  if (!Number.isFinite(length) || length > MAX_INSPECT_BODY) return null;
  return Buffer.from(await c.req.raw.arrayBuffer());
}
```

`MAX_INSPECT_BODY` bernilai `64 * 1024`. Jika `Content-Length` tidak ada, fungsi
mengembalikan `null`, lalu `bodyText` bernilai `null` dan inspeksi canary dilewati.
Body dengan `Transfer-Encoding: chunked` memenuhi kondisi ini.

## 6. Temuan

### 6.1 Ringkasan

| ID | Temuan | Tingkat | Status bukti |
|---|---|---|---|
| F-01 | Identitas sesi hanya `IP + User-Agent` | Tinggi | Runtime |
| F-02 | Deteksi otomasi memakai daftar hitam UA | Tinggi | Runtime |
| F-03 | Pemeriksaan header browser hanya dua field | Sedang | Kode dan runtime |
| F-04 | Ambang 0,55 membuat otomasi tanpa honeylink dianggap sah | Sedang | Runtime |
| F-05 | Honeylink statis dan diumumkan di `robots.txt` | Tinggi | Runtime |
| F-06 | Upstream `:3000` terbuka di `0.0.0.0` | Kritis | Runtime |
| F-07 | SQL injection pada login target lab | Kritis | Runtime |
| F-08 | Reflected XSS pada `/search` target lab | Sedang | Kode |
| F-09 | MCP umpan tanpa autentikasi dan tanpa rate limit | Sedang | Runtime |
| F-10 | Inspeksi canary body dapat dilewati dengan chunked | Sedang | Kode |
| F-11 | Flag umpan statis, tidak unik per sesi | Rendah | Kode |
| F-12 | Kalibrasi menerima payload apa pun dan memberi status terverifikasi | Sedang | Runtime |
| F-13 | Tidak ada penegakan real-time, hanya tarpit dan draf rule | Sedang | Kode dan dokumen |

### 6.2 F-01: Identitas sesi hanya `IP + User-Agent`

**Bukti.** `apps/sensor/src/detect/tracker.ts`:

```ts
export function fingerprintOf(ip: string, userAgent: string): string {
  return createHash('sha256').update(`${ip}\n${userAgent}`).digest('hex').slice(0, 32);
}
```

**Dampak.** Satu header mengubah identitas. Riwayat `honeylinkHits`, `score`,
`reasons`, dan `status` tidak terbawa. Ini terbukti pada `eba6e14f`: request login
masuk sebagai `legit` 0,20, lalu naik ke `agent` 0,90 hanya setelah honeylink
disentuh pada request berikutnya.

**Akar masalah.** Tidak ada reputasi lintas sesi. `SessionTracker` menyimpan
`active.get(fingerprint)` dan menutup sesi setelah `SESSION_IDLE_TIMEOUT_MS`
(60 detik), sehingga aktor yang sama dapat memulai dari nol berkali-kali.

**Perbaikan.** Tambahkan identitas aktor yang stabil dalam satu jendela waktu,
misalnya `IP + ASN` atau `IP` saja dengan skor maksimum dan peluruhan waktu. Simpan
reputasi di tabel terpisah, bukan hanya di map sesi aktif.

### 6.3 F-02: Deteksi otomasi memakai daftar hitam UA

**Bukti.** `apps/sensor/src/detect/signals.ts` mencocokkan UA dengan daftar regex
(`curl`, `wget`, `python-requests`, `headlesschrome`, `puppeteer`, `bot`, dan
seterusnya). `AgentX/1.0` tidak cocok dengan pola mana pun, sehingga
`automationUa=false`.

**Dampak.** Agen cukup memilih UA yang tidak terdaftar. Pada pengujian ini,
`AgentX/1.0` dan `Chrome/131` sama-sama mendapat perlakuan `legit`.

**Akar masalah.** Daftar hitam selalu kalah oleh variasi nama. Tidak ada bukti
positif bahwa klien adalah browser.

**Perbaikan.** Ganti ke verifikasi positif: cookie tantangan yang ditandatangani
server dan hanya diperoleh setelah eksekusi JavaScript, atau pemeriksaan
fingerprint TLS saat sensor menerima TLS. Daftar hitam UA tetap dipertahankan
sebagai sinyal tambahan, bukan penentu utama.

### 6.4 F-03: Pemeriksaan header browser hanya dua field

**Bukti.** `lacksBrowserHeaders()` hanya memeriksa `Accept-Language` yang bukan `*`
dan keberadaan `Sec-Fetch-Site`.

**Dampak.** Dua header dapat ditambahkan dengan mudah. Sesi `170a7fe0` tetap
mendapat `missing_browser_headers`, tetapi skornya 0,20 sehingga tetap `legit`.

**Perbaikan.** Periksa konsistensi kelompok header (`Sec-Fetch-Mode`,
`Sec-Fetch-Dest`, `Accept`, `Accept-Encoding`), urutan header, dan nilai yang tidak
mungkin dikirim `fetch` biasa. Perlakukan ketidakcocokan sebagai sinyal, bukan
sekadar keberadaan.

### 6.5 F-04: Ambang 0,55 membuat otomasi tanpa honeylink dianggap sah

**Bukti.** `automation_ua` 0,35 ditambah `missing_browser_headers` 0,20 sama dengan
0,55. Ambang `SUSPECT_SCORE_THRESHOLD` adalah 0,6. Sesi `35da44aa` dan `c543d40a`
berstatus `legit` dengan satu request.

**Dampak.** Skrip sederhana yang tidak mengikuti tautan tersembunyi tidak pernah
ditahan. Ini keputusan desain untuk menekan false positive, tetapi perlu dinyatakan
eksplisit di dokumen dan diuji.

**Perbaikan.** Pisahkan dua keputusan: `divert` untuk sesi yang mencurigakan dan
`observe` untuk semua sesi. Sesi `legit` tetap dapat diberi umpan ringan atau
dihitung sebagai kandidat tanpa harus ditahan. Naikkan bobot `automation_ua` hanya
jika verifikasi positif tersedia, agar tidak menambah false positive pada manusia.

### 6.6 F-05: Honeylink statis dan diumumkan

**Bukti.** `HONEYLINK_PATHS=/arsip-internal/` tetap, terdaftar di `robots.txt`, dan
muncul di HTML beranda sebagai tautan `display:none`. `isHoneylinkPath()` mencocokkan
path tetap tersebut.

**Dampak.** Agen yang mengabaikan tautan tersembunyi dan `robots.txt` tidak pernah
memicu sinyal terkuat (0,7). Semua deteksi menjadi bergantung pada satu keputusan
agen.

**Perbaikan.** Sebar beberapa honeylink per sesi (token acak di CSS, komentar HTML,
`form action`, parameter query), dan jangan daftarkan honeylink di `robots.txt`.
Catat setiap token yang disajikan agar penggunaannya dapat diatribusikan.

### 6.7 F-06: Upstream terbuka

**Bukti.** `:3000` listen di `0.0.0.0`; `curl http://127.0.0.1:3000/` mengembalikan
`200` tanpa sensor.

**Dampak.** Seluruh lapisan deception dapat dilewati. Ini juga membuat metrik lab
"permintaan yang sampai ke aplikasi asli" sulit ditafsirkan jika penguji dapat
memanggil upstream langsung.

**Perbaikan.** Bind upstream ke `127.0.0.1`, atau letakkan di jaringan internal
container tanpa port publish. Di deployment, gunakan network policy yang hanya
mengizinkan sensor menghubungi upstream.

### 6.8 F-07: SQL injection pada login target lab

**Bukti.** Lihat 5.5. Query dirakit dengan interpolasi string.

**Dampak.** Flag asli dapat diambil tanpa menyentuh labirin. Untuk validitas lab,
ini mencampur dua variabel: kemampuan sensor dan keamanan aplikasi target.

**Perbaikan.** Gunakan parameter binding (`db.prepare(sql).get(username, password)`).
Jika tujuan lab adalah menguji deception, target harus cukup aman agar satu-satunya
jalan adalah melalui sensor. Jika target sengaja rentan, dokumentasikan sebagai
variabel terpisah dan jalankan dua seri pengujian: dengan dan tanpa kerentanan.

### 6.9 F-08: Reflected XSS pada `/search`

**Bukti.** `lab/target-app/src/app.ts`:

```ts
`<p>Hasil pencarian untuk: ${q}</p>`
```

`q` hanya di-escape untuk atribut `value`, tidak untuk isi halaman.

**Dampak.** Jika target dipakai di luar lab, ini XSS. Di dalam lab, dampaknya pada
validitas pengujian serupa F-07.

**Perbaikan.** Escape HTML pada semua keluaran, atau gunakan template yang
melakukan escaping secara default.

### 6.10 F-09: MCP umpan tanpa autentikasi

**Bukti.** Lihat 5.6. Tidak ada token, tidak ada rate limit, dan `tools/call`
langsung dilayani.

**Dampak.** Biaya sumber daya, potensi penyalahgunaan sebagai oracle, dan
permukaan yang lebih besar dari yang diperlukan untuk umpan.

**Perbaikan.** Beri token sesi yang diterbitkan hanya untuk sesi yang sudah
ditahan, batasi ukuran body, dan tambahkan rate limit per IP. Jangan mengekspos
tool yang tidak diperlukan.

### 6.11 F-10: Inspeksi canary body dapat dilewati

**Bukti.** Lihat 5.9. `readSmallBody()` bergantung pada `Content-Length`.

**Dampak.** Canary yang dipakai di body request tidak terdeteksi jika klien memakai
chunked encoding atau body lebih dari 64 KiB.

**Perbaikan.** Baca body sebagai stream dengan batas atas, dan periksa potongan
yang terbaca meskipun `Content-Length` tidak ada. Catat bahwa inspeksi bersifat
best effort jika body melebihi batas.

### 6.12 F-11: Flag umpan statis

**Bukti.** `fakeVictory()` menambahkan banner dengan token yang sama untuk semua
sesi. Di working tree, token itu adalah `nexa{real_...}`.

**Dampak.** Tidak ada atribusi. Jika token yang sama muncul di laporan agen lain,
tidak bisa dipastikan sesi mana yang membocorkannya. Nilai statis juga mudah
dikenali sebagai umpan.

**Perbaikan.** Terbitkan token unik per sesi, simpan di tabel canary, dan gunakan
token itu di banner. Token statis hanya boleh dipakai untuk demo.

### 6.13 F-12: Kalibrasi menerima payload apa pun

**Bukti.** Lihat 5.7. Status "TERVERIFIKASI" diberikan tanpa validasi.

**Dampak.** Data yang dikumpulkan tidak dapat dibedakan antara agen yang benar-benar
terpancing dan penguji yang sengaja mengirim dummy. Untuk pengukuran, ini
mencemari dataset.

**Perbaikan.** Tandai payload yang jelas dummy, batasi ukuran field, dan simpan
metadata (panjang, hash, apakah cocok dengan pola instruksi sistem) tanpa menyimpan
isi mentah lebih lama dari yang diperlukan.

### 6.14 F-13: Tidak ada penegakan real-time

**Bukti.** `diverted` hanya menentukan apakah request dilayani labirin atau
diteruskan. Tidak ada blokir. Draf rule Suricata menunggu persetujuan operator
(`rules/deploy.ts`), dan `docs/metrics.md` mencatat waktu deteksi ke draf rule
sekitar 99 detik.

**Dampak.** Penyerang cepat dapat menyelesaikan tujuan sebelum aturan ada. Pada
pengujian ini, flag keluar dalam hitungan detik.

**Perbaikan.** Tambahkan mode `observe` dan `enforce`. Di mode `enforce`, sesi
`agent` dapat ditahan total (bukan hanya diberi umpan) dan sesi `suspect` mendapat
tantangan. Sediakan allowlist operator dan mekanisme pemulihan agar false positive
tidak mengunci pengguna sah.

## 7. Analisis akar masalah

Pola yang muncul dari ketiga belas temuan dapat diringkas menjadi empat kalimat:

1. **Deteksi bergantung pada tindakan sukarela agen.** Sinyal terkuat hanya menyala
   jika agen mengikuti tautan tersembunyi. Agen yang tidak penasaran tidak terdeteksi.
2. **Identitas bergantung pada atribut yang dapat dipalsukan.** UA mudah diganti,
   dan tidak ada reputasi lintas sesi yang mengikat aktor.
3. **Deception bukan kontrol akses.** Sensor mengurangi paparan, tetapi tidak
   menggantikan keamanan aplikasi. SQL injection dan port upstream terbuka membuat
   lapisan ini bisa dilewati sepenuhnya.
4. **Validitas lab tercampur.** Target yang rentan membuat hasil pengujian tidak
   bisa dipakai untuk menyimpulkan kemampuan sensor saja.

## 8. Rekomendasi perbaikan

Prioritas disusun berdasarkan dampak terhadap klaim keamanan dan biaya implementasi.

### P0: menutup bypass total

| ID | Rekomendasi | Menutup | Kriteria selesai |
|---|---|---|---|
| R-01 | Bind upstream ke loopback atau network policy internal | F-06 | Dari host lain, `:3000` menolak koneksi; sensor tetap berfungsi |
| R-02 | Perbaiki SQL injection dan XSS di target lab | F-07, F-08 | Payload `' OR 1=1 -- ` menghasilkan `401`; `<script>` tidak dieksekusi |
| R-03 | Tambahkan reputasi per aktor lintas sesi | F-01 | Rotasi UA tidak menurunkan skor aktor dalam jendela uji |

### P1: menutup bypass deteksi

| ID | Rekomendasi | Menutup | Kriteria selesai |
|---|---|---|---|
| R-04 | Verifikasi positif (cookie tantangan bertanda tangan) | F-02, F-03 | UA browser tanpa cookie tantangan tetap `suspect` |
| R-05 | Periksa konsistensi kelompok header, bukan keberadaan | F-03 | Klien dengan header tidak konsisten tertandai |
| R-06 | Honeylink unik per sesi, tidak diumumkan | F-05 | Setiap sesi menerima token berbeda; `robots.txt` tidak memuatnya |
| R-07 | Mode `observe` dan `enforce` | F-13 | Mode `enforce` menahan sesi `agent` sebelum request kedua |

### P2: memperbaiki kualitas pengukuran

| ID | Rekomendasi | Menutup | Kriteria selesai |
|---|---|---|---|
| R-08 | Baca body streaming untuk inspeksi canary | F-10 | Canary dalam body chunked terdeteksi |
| R-09 | Token umpan unik per sesi | F-11 | Pemakaian token dapat diatribusikan ke satu sesi |
| R-10 | Batasi dan validasi endpoint kalibrasi serta MCP | F-09, F-12 | Payload dummy ditandai; rate limit berlaku |
| R-11 | Samakan header keamanan `:8080` dan `:8081` | Pelengkap | CSP, `nosniff`, `X-Frame-Options` ada di keduanya |
| R-12 | Pisahkan seri uji "target rentan" dan "target aman" | F-07 | Dua laporan metrik terpisah, tidak dicampur |

## 9. Rencana eksekusi

Total estimasi 9 hari orang, dapat dikerjakan paralel sebagian.

### Fase 0: baseline dan harness (0,5 hari)

- Bekukan build uji dengan hash commit dan catat lima file working tree.
- Tambahkan skrip yang menjalankan matriks identitas (UA, header, honeylink) dan
  menyimpan hasilnya sebagai JSON.
- Simpan baseline metrik: sesi `legit` 0/14 dari `docs/metrics.md`, deteksi 11/11
  pada agen uji.

Kriteria selesai: satu perintah menghasilkan tabel sesi yang sama dengan Bab 5.2.

### Fase 1: isolasi dan target aman (1,5 hari)

- R-01: bind upstream ke `127.0.0.1`, perbarui compose dan dokumentasi.
- R-02: parameter binding pada login, escaping pada pencarian.
- Tambahkan test yang memastikan `:3000` tidak listen di `0.0.0.0` pada profil lab.

Kriteria selesai: `ss -ltn` tidak menampilkan `0.0.0.0:3000`; test SQLi lulus.

### Fase 2: reputasi lintas sesi (2 hari)

- Tambahkan tabel `actors` dengan `actorKey`, `maxScore`, `lastSeen`, `decayAt`.
- `SessionTracker.observe()` menghitung `actorKey` dari IP (dan ASN bila tersedia),
  lalu mengambil skor maksimum dalam jendela 10 menit.
- `diverted` mempertimbangkan skor sesi dan skor aktor.
- Tambahkan test: lima UA berbeda dari IP yang sama, satu request per UA, semuanya
  harus tertahan setelah request ketiga.

Kriteria selesai: matriks rotasi UA tidak menghasilkan `legit` baru.

### Fase 3: verifikasi positif (2 hari)

- R-04: terbitkan cookie `nexa_challenge` bertanda tangan HMAC untuk klien yang
  menjalankan JavaScript. Klien tanpa cookie mendapat skor tambahan.
- R-05: periksa konsistensi `Sec-Fetch-*` dan `Accept-*`.
- Sediakan jalur opt-out untuk pemantauan uptime yang sah melalui allowlist.

Kriteria selesai: `fetch` biasa dengan header lengkap tetap `suspect`; browser asli
tidak terpengaruh.

### Fase 4: honeylink dinamis dan canary (1,5 hari)

- R-06: hasilkan satu token honeylink per sesi, sisipkan ke HTML dan CSS.
- R-08: ganti `readSmallBody()` dengan pembacaan stream berbatas.
- R-09: terbitkan token umpan unik per sesi dan simpan di tabel canary.

Kriteria selesai: token berbeda antar sesi; canary chunked terdeteksi.

### Fase 5: penegakan dan operasi (1 hari)

- R-07: mode `observe` dan `enforce`, dengan allowlist operator.
- R-10: rate limit dan batas payload untuk MCP serta kalibrasi.
- R-11: header keamanan seragam.

Kriteria selesai: mode `enforce` menahan sesi `agent` pada request kedua; tidak ada
false positive pada 14 sesi manusia simulasi.

### Fase 6: dokumentasi dan pengukuran ulang (0,5 hari)

- Perbarui `docs/security-audit.md` dan `docs/metrics.md`.
- Jalankan matriks verifikasi Bab 10 dan lampirkan hasil JSON.
- Tandai setiap klaim sebagai "terukur" atau "target".

## 10. Matriks verifikasi

Setiap temuan harus punya test yang gagal pada build lama dan lulus pada build baru.

| Temuan | Test | Masukan | Hasil yang diharapkan |
|---|---|---|---|
| F-01 | `actor-reputation.test.ts` | 5 UA berbeda, IP sama, 1 request per UA | Sesi ketiga dan seterusnya `suspect` atau `agent` |
| F-02 | `ua-spoof.test.ts` | UA `AgentX/1.0` tanpa cookie tantangan | `suspect` minimal |
| F-03 | `header-consistency.test.ts` | Header browser tidak lengkap | Sinyal `inconsistent_headers` |
| F-04 | `threshold.test.ts` | curl 1 request tanpa honeylink | Minimal `suspect` bila mode `enforce` |
| F-05 | `honeylink-unique.test.ts` | Dua sesi | Token honeylink berbeda, tidak ada di `robots.txt` |
| F-06 | `isolation.test.ts` | `ss -ltn` pada profil lab | Tidak ada `0.0.0.0:3000` |
| F-07 | `login-sqli.test.ts` | `' OR 1=1 -- ` | `401`, tidak ada flag |
| F-08 | `search-xss.test.ts` | `<script>alert(1)</script>` | Ter-escape di HTML |
| F-09 | `mcp-auth.test.ts` | `tools/call` tanpa token | `401` |
| F-10 | `canary-chunked.test.ts` | Body chunked berisi canary | Canary terdeteksi |
| F-11 | `canary-unique.test.ts` | Dua sesi | Token umpan berbeda |
| F-12 | `kalibrasi-validation.test.ts` | Payload dummy | Ditandai dummy, tidak masuk dataset bersih |
| F-13 | `enforce-mode.test.ts` | Sesi `agent` di mode `enforce` | Request kedua ditahan |

Test dijalankan dengan `pnpm test` dan matriks lab dijalankan dengan skrip baru
`scripts/lab-hardening-check.mjs` (dibuat pada Fase 0).

## 11. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Verifikasi positif menaikkan false positive | Pengguna sah tertahan | Allowlist, mode `observe` lebih dulu, ukur 14 sesi manusia |
| Reputasi per IP menghukum pengguna NAT | Satu kantor dianggap satu aktor | Gunakan jendela pendek dengan peluruhan, atau IP + ASN |
| Cookie tantangan merusak klien non-JS | curl dan pemantauan uptime gagal | Sediakan token layanan untuk pemantauan sah |
| Fingerprint TLS butuh terminasi TLS | Sensor saat ini HTTP | Terapkan saat TLS dipasang di depan sensor |
| Perbaikan target mengubah hasil lab | Metrik lama tidak sebanding | Jalankan dua seri dan tandai versi target |
| Penyerang dengan akses host | Source dan `.env` terbaca | Di luar model ancaman; dokumentasikan sebagai asumsi |

## 12. Metrik keberhasilan

Angka "baseline" di bawah adalah hasil pengukuran pada build yang diuji. Angka
"target" adalah target yang belum diukur, bukan klaim.

| Metrik | Baseline terukur | Target | Cara ukur |
|---|---|---|---|
| Bypass via rotasi UA | 1 header, sesi `legit` 0,20 | 0 dari 10 variasi UA | Matriks Fase 2 |
| Bypass via upstream langsung | `:3000` terbuka | Koneksi ditolak dari host lain | `ss` dan uji jaringan |
| Flag asli tanpa melewati sensor | Berhasil | Tidak mungkin | Test SQLi |
| Canary dalam body chunked | Tidak terdeteksi | 100 persen terdeteksi | Test Fase 4 |
| False positive manusia | 0/14 (dari `docs/metrics.md`) | Tetap 0/14 | Simulasi 14 sesi |
| Waktu deteksi ke penahanan | Sekitar 1,8 detik (median lab) | Tetap di bawah 3 detik | Telemetri |
| Waktu deteksi ke draf rule | Sekitar 99 detik | Tidak berubah (persetujuan manual) | `docs/metrics.md` |

## 13. Lampiran

### A. Perintah reproduksi

```bash
# 1. Telemetri sesi
T=$(grep -E '^DASHBOARD_TOKEN=' .env | cut -d= -f2-)
curl -s -H "Authorization: Bearer $T" http://127.0.0.1:8081/api/sessions?limit=100 | jq .

# 2. Rotasi identitas
curl -s -o /dev/null -w '%{http_code}\n' -A 'AgentX/1.0' \
  -X POST http://localhost:8080/login \
  --data-urlencode "username=' OR 1=1 -- " --data-urlencode 'password=x'
curl -s -o /dev/null -w '%{http_code}\n' -A 'AgentX/1.0' \
  http://localhost:8080/arsip-internal/

# 3. Upstream langsung
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/

# 4. MCP umpan
curl -s -X POST http://localhost:8080/arsip-internal/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

### B. Rujukan kode

| Berkas | Bagian yang relevan |
|---|---|
| `apps/sensor/src/detect/tracker.ts` | `fingerprintOf`, `observe`, `escalate`, idle timeout |
| `apps/sensor/src/detect/score.ts` | Bobot sinyal dan ambang klasifikasi |
| `apps/sensor/src/detect/signals.ts` | `isAutomationUserAgent`, `lacksBrowserHeaders`, `isHoneylinkPath` |
| `apps/sensor/src/public/handler.ts` | `readSmallBody`, `fakeVictory`, alur divert |
| `apps/sensor/src/mcp/decoy.ts` | Tiga tool umpan |
| `apps/sensor/config/interrogation.json` | Teks umpan kalibrasi |
| `lab/target-app/src/app.ts` | Handler login dan pencarian (build uji) |
| `docs/security-audit.md` | Catatan risiko deteksi berbasis sinyal |
| `docs/metrics.md` | Baseline deteksi dan false positive |

### C. Catatan etika dan batas

- Seluruh kredensial, host, dan flag di laporan ini adalah data lab yang fiktif.
- Nilai rahasia disamarkan. Reproduksi memerlukan akses ke build lab.
- Tidak ada pengujian destruktif, denial of service, atau eksfiltrasi data nyata.
- Pengujian dilakukan di mesin yang sama dengan source dan `.env`. Keuntungan
  informasi ini tidak dimiliki agen uji lab, sehingga hasilnya tidak boleh dipakai
  untuk menyimpulkan kemampuan deteksi terhadap penyerang eksternal tanpa akses host.
