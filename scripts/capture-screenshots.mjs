// Ambil screenshot dashboard untuk dokumentasi/submission (maks. 5, sesuai rulebook).
// Prasyarat: lab berjalan (pnpm lab:up) dan dashboard dev server dengan proxy auth:
//   DASHBOARD_DEV_AUTOAUTH=1 pnpm --filter dashboard dev
// Lalu:  node scripts/capture-screenshots.mjs [--session <uuid>] [--out docs/screenshots]
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { flag, ROOT } from './lib/lab-data.mjs';

const args = process.argv.slice(2);
const session = flag(args, '--session', null);
const outDir = resolve(ROOT, flag(args, '--out', 'docs/screenshots'));
mkdirSync(outDir, { recursive: true });

const routes = [
  { hash: '#/', file: '1-pos-komando.jpg' },
  { hash: '#/kontak', file: '2-kontak.jpg' },
  ...(session
    ? [
        {
          hash: `#/kontak/${session}`,
          file: '3-linimasa-kontak.jpg',
          scrollText: 'Balasan interogasi',
        },
      ]
    : []),
  { hash: '#/aturan', file: '4-aturan.jpg' },
  { hash: '#/intel', file: '5-intel.jpg', scrollText: 'Tangkapan interogasi', waitMs: 5_000 },
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
  },
});
process.exit(r.status ?? 1);
