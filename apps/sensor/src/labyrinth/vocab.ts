// Kosakata umpan. SEMUA FIKTIF: nama satuan, sistem, orang, host, dan alamat dikarang.
// IP memakai TEST-NET RFC 5737 (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24),
// domain memakai TLD .test (RFC 6761). Tidak ada nama/topologi instansi nyata.

export const UNIT = 'Satuan Latihan BAYU-7';
export const DOMAIN = 'bayu7.latihan.test';

export const SYSTEMS = [
  'KABUT-TIMUR',
  'ELANG-SENJA',
  'TIRTA-ANGKASA',
  'SIGMA-RELAY',
  'LANGIT-BIRU',
  'BATU-KARANG',
  'ANGIN-SELATAN',
  'PELITA-MALAM',
  'RIMBA-HIJAU',
  'SAMUDRA-DIAM',
] as const;

export const SEGMENTS = ['DMZ-LAT', 'OPS-LAT', 'LOG-LAT', 'ADM-LAT', 'KOM-LAT', 'ARS-LAT'] as const;

export const DEPARTMENTS = [
  'Seksi Komunikasi Latihan',
  'Bagian Logistik Latihan',
  'Unit Siber Latihan',
  'Seksi Administrasi Personel',
  'Bagian Perencanaan Latihan',
] as const;

export const OWNERS = [
  'Lettu (Lat) A. Prakoso',
  'Serma (Lat) B. Wiratama',
  'Kapten (Lat) C. Halim',
  'Pelda (Lat) D. Saputra',
  'Mayor (Lat) E. Lestari',
] as const;

export const DOC_STEMS = [
  'laporan-operasi',
  'konfigurasi-vpn',
  'daftar-akun-layanan',
  'rencana-migrasi',
  'notulen-rapat',
  'prosedur-darurat',
  'audit-akses',
  'cadangan-database',
  'peta-jaringan',
  'kunci-integrasi',
  'jadwal-patroli-siber',
  'inventaris-perangkat',
  'evaluasi-latihan',
  'kebijakan-sandi',
  'log-insiden',
] as const;

export const FILE_EXT = ['md', 'txt', 'pdf', 'xlsx', 'conf', 'json', 'zip', 'bak'] as const;

export const SERVICES = [
  ['ssh', 22],
  ['https', 443],
  ['postgres', 5432],
  ['redis', 6379],
  ['ldap', 389],
  ['smb', 445],
  ['grafana', 3000],
  ['minio', 9000],
  ['vault', 8200],
  ['mqtt', 1883],
] as const;

export const SOFTWARE = [
  'nginx 1.27',
  'OpenSSH 9.8',
  'PostgreSQL 16.4',
  'Redis 7.4',
  'OpenLDAP 2.6',
  'Samba 4.20',
  'Grafana 11.2',
  'MinIO 2025',
  'Vault 1.17',
  'Mosquitto 2.0',
] as const;

export const TEST_NETS = ['192.0.2', '198.51.100', '203.0.113'] as const;

export const SENTENCE_OPENERS = [
  'Dokumen ini merangkum',
  'Sesuai arahan pimpinan latihan,',
  'Berdasarkan hasil evaluasi terakhir,',
  'Dalam rangka penyiapan latihan gabungan,',
  'Menindaklanjuti temuan audit internal,',
  'Untuk keperluan serah terima jaga,',
] as const;

export const SENTENCE_SUBJECTS = [
  'konfigurasi layanan {system}',
  'prosedur akses jarak jauh ke segmen {segment}',
  'integrasi sistem logistik dengan {system}',
  'pemeliharaan server arsip {system}',
  'peninjauan akun layanan pada segmen {segment}',
  'pencadangan basis data harian',
  'rotasi kredensial integrasi',
] as const;

export const SENTENCE_PREDICATES = [
  'telah diperbarui dan menunggu verifikasi',
  'perlu ditinjau ulang sebelum latihan berikutnya',
  'dijadwalkan untuk migrasi bertahap',
  'masih dalam uji coba terbatas',
  'dibatasi untuk personel yang tercantum di lampiran',
  'dipindahkan ke berkas arsip terpisah',
] as const;

export const SENTENCE_DETAILS = [
  'setelah ditemukan perbedaan konfigurasi pada {host}',
  'sesuai standar keamanan internal revisi {version}',
  'dengan rujukan dokumen {ref}',
  'dan rinciannya tersedia pada dokumen terkait di bawah',
  'mengikuti hasil rapat koordinasi tanggal {date}',
  'termasuk daftar host pada segmen {segment}',
] as const;

export const ADMIN_NOTES = [
  'berkas lama dipindahkan ke subfolder per tahun.',
  'akses ke folder ini dicatat; gunakan akun layanan yang sesuai.',
  'indeks lengkap tersedia di halaman berikutnya.',
  'dokumen kredensial telah dipisah ke folder konfigurasi.',
] as const;

export const INCIDENT_TITLES = [
  'Akses tidak sah ke server arsip',
  'Kegagalan sinkronisasi cadangan',
  'Lonjakan login gagal pada gateway VPN',
  'Konfigurasi firewall tertimpa',
  'Sertifikat layanan kedaluwarsa',
] as const;

export const TIMELINE_EVENTS = [
  'Alarm pemantauan aktif pada {host}',
  'Petugas jaga melakukan verifikasi awal',
  'Akun layanan {user} dinonaktifkan sementara',
  'Cadangan konfigurasi dipulihkan dari {host}',
  'Laporan awal dikirim ke {owner}',
  'Analisis log dilanjutkan oleh Unit Siber Latihan',
] as const;

export const ENDPOINT_NAMES = [
  'personel',
  'logistik',
  'jadwal',
  'perangkat',
  'akun-layanan',
  'arsip',
  'laporan',
  'kunci',
] as const;
