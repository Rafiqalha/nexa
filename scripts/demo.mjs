// Demo satu perintah: siapkan .env, build dashboard, nyalakan lab (Docker atau lokal),
// tunggu sensor sehat, jalankan agen uji, lalu tunggu draf aturan siap ditinjau.
//
//   pnpm demo [-- --desktop] [--wait 15] [--model deepseek-flash] [--scripted]
//
// --desktop : buka aplikasi desktop NEXA Dashboard (Electron) sebelum serangan
// --wait N  : jeda (detik) sebelum serangan agar presenter sempat membuka dashboard
// Argumen lain diteruskan ke lab:attack. Token dashboard tidak pernah dicetak;
// pakai `pnpm token` untuk menyalinnya ke clipboard.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((a) => a !== '--');
const take = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v ?? fallback;
};
const desktop = args.includes('--desktop');
if (desktop) args.splice(args.indexOf('--desktop'), 1);
const waitSeconds = Number(take('--wait', '10'));
const ADMIN = 'http://127.0.0.1:8081';
const PUBLIC = 'http://127.0.0.1:8080';
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const step = (msg) => console.log(`\n[demo] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) {
    console.error(`[demo] gagal: ${cmd} ${cmdArgs.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

function dashboardToken() {
  const line = readFileSync(join(root, '.env'), 'utf8')
    .split(/\r?\n/)
    .find((l) => /^\s*DASHBOARD_TOKEN\s*=/.test(l));
  return (line?.slice(line.indexOf('=') + 1) ?? '').trim();
}

async function waitHealthy(timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const [a, p] = await Promise.all([fetch(`${ADMIN}/healthz`), fetch(`${PUBLIC}/`)]);
      if (a.ok && p.status < 500) return true;
    } catch {
      // belum siap
    }
    await sleep(1_000);
  }
  return false;
}

async function overview() {
  const res = await fetch(`${ADMIN}/api/overview`, {
    headers: { authorization: `Bearer ${dashboardToken()}` },
  });
  return res.ok ? res.json() : null;
}

step('1/6 menyiapkan .env (token acak dibuat bila kosong; nilai tidak dicetak)');
run(process.execPath, ['scripts/ensure-env.mjs']);

step('2/6 build dashboard (disajikan port admin sensor)');
run(pnpm, ['--filter', 'dashboard', 'build'], { shell: process.platform === 'win32' });

step('3/6 menyalakan lab (Docker bila tersedia, selain itu proses lokal)');
run(process.execPath, ['scripts/lab.mjs', 'up']);

step('4/6 menunggu sensor sehat');
if (!(await waitHealthy(120_000))) {
  console.error('[demo] sensor tidak sehat dalam 120 detik. Cek: pnpm lab:status / data/lab-logs');
  process.exit(1);
}
const before = await overview();
console.log(`[demo] dashboard: ${ADMIN}  (token: jalankan "pnpm token" lalu tempel)`);
console.log(`[demo] aplikasi lab lewat sensor: ${PUBLIC}`);
if (desktop) {
  const child = spawn(pnpm, ['--filter', 'desktop', 'start'], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    shell: process.platform === 'win32',
  });
  child.unref();
  console.log('[demo] aplikasi desktop NEXA Dashboard dibuka');
}
if (waitSeconds > 0) {
  console.log(`[demo] serangan dimulai dalam ${waitSeconds} detik…`);
  await sleep(waitSeconds * 1_000);
}

step('5/6 menjalankan agen penyerang uji (lab:attack)');
run(process.execPath, ['scripts/lab.mjs', 'attack', ...args]);

step('6/6 menunggu sesi ditutup (idle 60 detik) dan draf aturan tervalidasi');
const baseline = before?.summary?.rulesPending ?? 0;
const until = Date.now() + 150_000;
let last = null;
while (Date.now() < until) {
  last = await overview();
  if ((last?.summary?.rulesPending ?? 0) > baseline) break;
  await sleep(5_000);
}
run(process.execPath, ['scripts/lab-report.mjs']);
const pending = last?.summary?.rulesPending ?? 0;
console.log(
  pending > baseline
    ? `\n[demo] ${pending - baseline} draf aturan baru siap ditinjau di halaman "Aturan". Setujui/Tolak sebagai operator.`
    : '\n[demo] draf aturan belum muncul; cek halaman "Aturan" beberapa saat lagi.',
);
console.log('[demo] selesai. Matikan lab: pnpm lab:down');
