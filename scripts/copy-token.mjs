// Salin DASHBOARD_TOKEN dari .env ke clipboard TANPA menampilkannya di terminal,
// untuk ditempel di layar login dashboard / aplikasi desktop.
//   pnpm token
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
if (!existsSync(envPath)) {
  console.error('[token] .env belum ada. Jalankan: pnpm env:init');
  process.exit(1);
}
const line = readFileSync(envPath, 'utf8')
  .split(/\r?\n/)
  .find((l) => /^\s*DASHBOARD_TOKEN\s*=/.test(l));
const token = (line?.slice(line.indexOf('=') + 1) ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
if (!token) {
  console.error('[token] DASHBOARD_TOKEN kosong. Jalankan: pnpm env:init');
  process.exit(1);
}

const candidates =
  process.platform === 'win32'
    ? [['clip', []]]
    : process.platform === 'darwin'
      ? [['pbcopy', []]]
      : [
          ['wl-copy', []],
          ['xclip', ['-selection', 'clipboard']],
          ['xsel', ['--clipboard', '--input']],
        ];
for (const [cmd, args] of candidates) {
  const r = spawnSync(cmd, args, { input: token, stdio: ['pipe', 'ignore', 'ignore'] });
  if (r.status === 0) {
    console.log(
      `[token] DASHBOARD_TOKEN (${token.length} karakter) disalin ke clipboard. Tempel di kolom "Token API sensor".`,
    );
    process.exit(0);
  }
}
console.error(
  '[token] Tidak ada utilitas clipboard (clip/pbcopy/wl-copy/xclip). Buka .env dan salin nilai DASHBOARD_TOKEN secara manual.',
);
process.exit(1);
