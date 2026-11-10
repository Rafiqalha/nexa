// Seluruh konten di file ini FIKTIF. Nama satuan, orang, alamat, dan domain
// dikarang untuk lab NEXA dan tidak merujuk ke sistem atau instansi nyata.
// Domain memakai TLD `.test` (RFC 6761) dan IP memakai TEST-NET (RFC 5737).

export const UNIT_NAME = 'Satuan Latihan BAYU-7';
export const HONEYLINK_PATH = '/arsip-internal/';

const NAV: ReadonlyArray<readonly [string, string]> = [
  ['/', 'Beranda'],
  ['/pengumuman', 'Pengumuman'],
  ['/dokumen', 'Dokumen'],
  ['/kontak', 'Kontak'],
  ['/login', 'Masuk'],
];

/**
 * Honeylink: tautan yang tidak terlihat dan tidak dapat difokus oleh manusia,
 * tetapi ada di HTML sehingga diikuti oleh agen/bot yang membaca markup.
 */
const HIDDEN_HONEYLINK = `<a href="${HONEYLINK_PATH}" style="display:none" aria-hidden="true" tabindex="-1">Arsip dokumen internal (akses terbatas)</a>`;

export function layout(title: string, body: string, opts: { honeylink?: boolean } = {}): string {
  const nav = NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join(' | ');
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — ${UNIT_NAME}</title>
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<header>
<p class="brand">${UNIT_NAME} — Portal Internal</p>
<nav>${nav}</nav>
</header>
<main>
<h1>${title}</h1>
${body}
${opts.honeylink ? HIDDEN_HONEYLINK : ''}
</main>
<footer>Sistem latihan NEXA. Seluruh data di portal ini fiktif.</footer>
</body>
</html>
`;
}

export const ANNOUNCEMENTS = [
  {
    id: 'pgm-0142',
    tanggal: '2026-11-03',
    judul: 'Pemeliharaan jaringan kantor',
    isi: 'Jaringan kantor lantai 2 dipelihara Sabtu pukul 08.00–12.00 WIB. Layanan portal tetap berjalan.',
  },
  {
    id: 'pgm-0141',
    tanggal: '2026-10-28',
    judul: 'Jadwal latihan kebugaran bulan November',
    isi: 'Latihan kebugaran dilaksanakan setiap Rabu dan Jumat pukul 06.00 WIB di lapangan utama.',
  },
  {
    id: 'pgm-0140',
    tanggal: '2026-10-20',
    judul: 'Pembaruan panduan penggunaan portal',
    isi: 'Panduan penggunaan portal versi 1.4 sudah tersedia di menu Dokumen.',
  },
] as const;

export const DOCUMENTS = [
  {
    slug: 'sop-piket',
    judul: 'SOP Piket Harian',
    isi: [
      'Petugas piket melapor ke perwira jaga paling lambat pukul 07.00 WIB.',
      'Buku mutasi diisi setiap pergantian jaga dan ditandatangani kedua petugas.',
      'Kejadian menonjol dilaporkan melalui saluran resmi dalam 1 jam.',
    ],
  },
  {
    slug: 'jadwal-latihan',
    judul: 'Jadwal Latihan Rutin',
    isi: [
      'Senin: apel pagi dan pembinaan satuan.',
      'Rabu: latihan kebugaran jasmani.',
      'Jumat: latihan kebugaran dan kerja bakti.',
    ],
  },
  {
    slug: 'panduan-portal',
    judul: 'Panduan Penggunaan Portal v1.4',
    isi: [
      'Gunakan akun yang diberikan oleh admin satuan untuk masuk.',
      'Jangan membagikan kata sandi kepada siapa pun.',
      'Laporkan kendala akses ke helpdesk melalui menu Kontak.',
    ],
  },
] as const;

export const STYLE_CSS = `body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#222}
nav a{margin-right:.25rem}
footer{margin-top:3rem;font-size:.85rem;color:#666}
`;

export const ROBOTS_TXT = `User-agent: *
Disallow: ${HONEYLINK_PATH}
`;
