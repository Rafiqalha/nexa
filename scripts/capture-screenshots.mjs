// Ambil screenshot dashboard untuk dokumentasi/submission (maks. 5, sesuai rulebook).
// Hasil: JPG 2880 × 1800 (viewport 1440 × 900 pada skala 2), gerak dibekukan, tanpa scrollbar.
//
// Prasyarat (data harus dari run lab nyata, berlabel "Data simulasi lab"), salah satu:
// a) dashboard dev server dengan proxy auth: DASHBOARD_DEV_AUTOAUTH=1 pnpm --filter dashboard dev
//    lalu: node scripts/capture-screenshots.mjs --session <uuid>
// b) sensor mode lab di loopback yang melayani dashboard hasil build, memakai SALINAN DB lab yang
//    belum punya akun. Skrip membuat akun uji "Operator Lab" dengan sandi acak sekali pakai:
//    node scripts/capture-screenshots.mjs --base http://localhost:8081/ --demo-login --session <uuid>
//
// Opsi: --out <folder> (bawaan docs/screenshots), --scale <n> (bawaan 2),
//       --explore (tangkap halaman penuh 1× untuk menyusun komposisi).
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { flag, ROOT } from './lib/lab-data.mjs';

const args = process.argv.slice(2);
const session = flag(args, '--session', null);
const outDir = resolve(ROOT, flag(args, '--out', 'docs/screenshots'));
mkdirSync(outDir, { recursive: true });

// Komposisi tiap layar: halaman, klik opsional, dan titik gulir (teks yang dijadikan tepi atas).
const routes = [
  { hash: '#/', file: '1-dashboard.jpg', waitMs: 4_000 },
  // Tampilan bawaan: hanya sesi terdeteksi. Opsi `click: '<teks>'` tersedia untuk klik sebelum
  // tangkapan (mis. 'Tampilkan juga sesi sah').
  { hash: '#/sesi', file: '2-sesi.jpg' },
  // Tepi atas di "User-Agent": sinyal deteksi, canary yang dipakai, dan awal linimasa.
  ...(session
    ? [
        {
          hash: `#/sesi/${session}`,
          file: '3-linimasa-sesi.jpg',
          scrollTo: 'User-Agent',
          offset: 48,
          waitMs: 4_000,
        },
      ]
    : []),
  { hash: '#/aturan', file: '4-aturan.jpg' },
  { hash: '#/intel', file: '5-intel.jpg', waitMs: 5_000 },
];

// Binary Electron dari paket desktop (hanya alat dokumentasi; tidak menyentuh aplikasi desktop).
const electron = createRequire(join(ROOT, 'apps', 'desktop', 'package.json'))('electron');
const r = spawnSync(electron, [join(ROOT, 'scripts', 'lib', 'capture-main.cjs')], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    CAPTURE_BASE: flag(args, '--base', 'http://localhost:5173/'),
    CAPTURE_OUT: outDir,
    CAPTURE_ROUTES: JSON.stringify(routes),
    CAPTURE_SCALE: flag(args, '--scale', '2'),
    CAPTURE_EXPLORE: args.includes('--explore') ? '1' : '0',
    CAPTURE_DEMO_LOGIN: args.includes('--demo-login') ? '1' : '0',
  },
});
process.exit(r.status ?? 1);
