// Salin token dari .env ke clipboard TANPA menampilkannya di terminal.
//   pnpm token              -> SETUP_TOKEN (hanya bila di-set; kosong = akun pertama tanpa token)
//   pnpm token -- service   -> DASHBOARD_TOKEN (token layanan untuk skrip/klien API lab)
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
const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
const envValue = (key) => {
  const line = lines.find((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  return (line?.slice(line.indexOf('=') + 1) ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
};

const service = process.argv.slice(2).includes('service');
const key = service ? 'DASHBOARD_TOKEN' : 'SETUP_TOKEN';
const token = envValue(key);
if (!token && !service) {
  console.log(
    '[token] SETUP_TOKEN kosong: tidak perlu token. Buka dashboard lalu buat akun; pendaftar pertama menjadi pemilik.',
  );
  process.exit(0);
}
if (!token) {
  console.error(`[token] ${key} kosong. Jalankan: pnpm env:init`);
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
      service
        ? `[token] DASHBOARD_TOKEN (${token.length} karakter) disalin. Kirim sebagai header Authorization: Bearer.`
        : `[token] ${key} (${token.length} karakter) disalin. Tempel di kolom "Token penyiapan" saat membuat akun pertama.`,
    );
    process.exit(0);
  }
}
console.error(
  `[token] Tidak ada utilitas clipboard (clip/pbcopy/wl-copy/xclip). Buka .env dan salin nilai ${key} secara manual.`,
);
process.exit(1);
