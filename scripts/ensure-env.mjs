// Membuat atau melengkapi .env dari .env.example TANPA menimpa nilai yang sudah ada.
// - .env belum ada  -> salin .env.example, isi DASHBOARD_TOKEN acak.
// - .env sudah ada  -> tambahkan kunci yang belum ada; DASHBOARD_TOKEN kosong diisi acak.
// Nilai (termasuk secret) tidak pernah dicetak ke terminal.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const example = readFileSync(resolve(root, '.env.example'), 'utf8');
const newToken = () => randomBytes(24).toString('base64url');
const KEY_LINE = /^\s*([A-Z0-9_]+)\s*=(.*)$/;

if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    example.replace(/^DASHBOARD_TOKEN=.*$/m, `DASHBOARD_TOKEN=${newToken()}`),
    {
      mode: 0o600,
    },
  );
  console.log('[env] .env dibuat dari .env.example (DASHBOARD_TOKEN acak).');
  process.exit(0);
}

let current = readFileSync(envPath, 'utf8');
const present = new Map();
for (const line of current.split(/\r?\n/)) {
  const m = line.match(KEY_LINE);
  if (m) present.set(m[1], m[2].trim());
}

const added = [];
let tokenFilled = false;
if (present.has('DASHBOARD_TOKEN') && present.get('DASHBOARD_TOKEN') === '') {
  current = current.replace(/^\s*DASHBOARD_TOKEN\s*=.*$/m, `DASHBOARD_TOKEN=${newToken()}`);
  tokenFilled = true;
}
for (const line of example.split(/\r?\n/)) {
  const m = line.match(KEY_LINE);
  if (!m || present.has(m[1])) continue;
  const value = m[1] === 'DASHBOARD_TOKEN' ? newToken() : m[2];
  added.push(`${m[1]}=${value}`);
}

if (added.length === 0 && !tokenFilled) process.exit(0);
if (added.length > 0) {
  if (!current.endsWith('\n')) current += '\n';
  current += `\n# --- dilengkapi otomatis dari .env.example ---\n${added.join('\n')}\n`;
}
writeFileSync(envPath, current, { mode: 0o600 });
const names = added.map((l) => l.split('=')[0]);
console.log(
  `[env] .env dilengkapi: ${names.length} kunci ditambahkan${tokenFilled ? ', DASHBOARD_TOKEN diisi' : ''}.`,
);
