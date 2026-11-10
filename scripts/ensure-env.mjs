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
/** Kunci secret yang diisi acak bila kosong. */
const GENERATED = ['DASHBOARD_TOKEN', 'SURICATA_CONTROL_TOKEN'];

if (!existsSync(envPath)) {
  let content = example;
  for (const key of GENERATED) {
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${newToken()}`);
  }
  writeFileSync(envPath, content, { mode: 0o600 });
  console.log('[env] .env dibuat dari .env.example (token acak dibuat).');
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
for (const key of GENERATED) {
  if (present.has(key) && present.get(key) === '') {
    current = current.replace(new RegExp(`^[ \\t]*${key}[ \\t]*=.*$`, 'm'), `${key}=${newToken()}`);
    tokenFilled = true;
  }
}
for (const line of example.split(/\r?\n/)) {
  const m = line.match(KEY_LINE);
  if (!m || present.has(m[1])) continue;
  const value = GENERATED.includes(m[1]) ? newToken() : m[2];
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
  `[env] .env dilengkapi: ${names.length} kunci ditambahkan${tokenFilled ? ', token kosong diisi' : ''}.`,
);
