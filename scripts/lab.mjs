// Pengelola lab NEXA: `node scripts/lab.mjs up|down|status`.
// Mode docker (default bila engine Docker hidup): docker compose deploy/docker-compose.yml.
// Mode local (fallback): target-app + sensor sebagai proses Node di host.
// Paksa mode dengan LAB_MODE=docker|local.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compose = ['compose', '-f', join(root, 'deploy', 'docker-compose.yml')];
const pidFile = join(root, 'data', 'lab-local.json');
const logDir = join(root, 'data', 'lab-logs');

function dockerAvailable() {
  const r = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function pickMode() {
  const forced = process.env.LAB_MODE;
  if (forced === 'docker' || forced === 'local') return forced;
  return dockerAvailable() ? 'docker' : 'local';
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function waitHealthy(url, label, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} tidak sehat dalam ${timeoutMs} ms (${url})`);
}

function readEnvPorts() {
  const env = {};
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return {
    sensor: Number(env.SENSOR_PORT || 8080),
    admin: Number(env.ADMIN_PORT || 8081),
    upstream: env.UPSTREAM_URL || 'http://localhost:3000',
  };
}

function startLocal(name, cwd, entry, extraEnv = {}) {
  mkdirSync(logDir, { recursive: true });
  const out = openSync(join(logDir, `${name}.log`), 'a');
  const child = spawn(process.execPath, ['--import', 'tsx', entry], {
    cwd: join(root, cwd),
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ...extraEnv },
    windowsHide: true,
  });
  child.unref();
  return child.pid;
}

function killPid(pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {}
    }
  }
}

async function up() {
  const mode = pickMode();
  if (mode === 'docker') {
    console.log('[lab] mode docker: docker compose up');
    run('docker', [...compose, 'up', '-d', '--build', '--wait']);
    console.log('[lab] sensor publik http://127.0.0.1:8080  admin http://127.0.0.1:8081');
    return;
  }
  if (existsSync(pidFile)) {
    console.log(
      '[lab] lab lokal sudah berjalan (data/lab-local.json). Jalankan `pnpm lab:down` dulu.',
    );
    return;
  }
  console.log('[lab] Docker tidak tersedia -> mode local (proses Node di host)');
  const ports = readEnvPorts();
  const upstreamPort = new URL(ports.upstream).port || '3000';
  const pids = {
    target: startLocal('target-app', 'lab/target-app', 'src/server.ts', { PORT: upstreamPort }),
  };
  await waitHealthy(`http://127.0.0.1:${upstreamPort}/api/status`, 'target-app');
  pids.sensor = startLocal('sensor', 'apps/sensor', 'src/index.ts');
  writeFileSync(pidFile, JSON.stringify({ mode: 'local', pids }, null, 2));
  await waitHealthy(`http://127.0.0.1:${ports.admin}/healthz`, 'sensor');
  console.log(
    `[lab] target-app :${upstreamPort}  sensor publik http://127.0.0.1:${ports.sensor}  admin http://127.0.0.1:${ports.admin}`,
  );
  console.log(`[lab] log: ${logDir}`);
}

function down() {
  if (existsSync(pidFile)) {
    const { pids } = JSON.parse(readFileSync(pidFile, 'utf8'));
    for (const pid of Object.values(pids)) killPid(pid);
    rmSync(pidFile);
    console.log('[lab] lab lokal dihentikan');
  }
  if (dockerAvailable()) run('docker', [...compose, 'down']);
}

function status() {
  if (existsSync(pidFile)) console.log(readFileSync(pidFile, 'utf8'));
  console.log(`[lab] docker ${dockerAvailable() ? 'tersedia' : 'tidak tersedia'}`);
}

/** Menjalankan agen uji ke lab yang sedang hidup (lokal atau Docker). */
function attack(args) {
  if (existsSync(pidFile)) {
    console.log('[lab] menjalankan attacker-agent (mode local)');
    const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/main.ts', ...args], {
      cwd: join(root, 'lab', 'attacker-agent'),
      stdio: 'inherit',
    });
    process.exit(r.status ?? 1);
  }
  if (dockerAvailable()) {
    console.log('[lab] menjalankan attacker-agent (mode docker)');
    const envFile = join(root, '.env');
    run('docker', [
      'compose',
      ...(existsSync(envFile) ? ['--env-file', envFile] : []),
      '-f',
      join(root, 'deploy', 'docker-compose.yml'),
      '--profile',
      'attack',
      'run',
      '--rm',
      '--build',
      'attacker-agent',
      ...args,
    ]);
    return;
  }
  console.error('[lab] lab belum berjalan. Jalankan `pnpm lab:up` dulu.');
  process.exit(1);
}

const cmd = process.argv[2];
if (cmd === 'up') await up();
else if (cmd === 'down') down();
else if (cmd === 'status') status();
else if (cmd === 'attack') attack(process.argv.slice(3).filter((a) => a !== '--'));
else {
  console.error('pakai: node scripts/lab.mjs up|down|status|attack [-- --baseline --scripted]');
  process.exit(2);
}
