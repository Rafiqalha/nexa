// Akses data lab bersama (hanya baca): laporan attacker-agent di lab/output dan DB sensor.
// Dipakai scripts/lab-metrics.mjs dan scripts/interrogation-report.mjs.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUTPUT_DIR = join(ROOT, 'lab', 'output');

export function openDb() {
  const require = createRequire(join(ROOT, 'apps', 'sensor', 'package.json'));
  const Database = require('better-sqlite3');
  const dbPath = process.env.DATABASE_PATH
    ? resolve(ROOT, process.env.DATABASE_PATH)
    : join(ROOT, 'data', 'nexa.db');
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

export function flag(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

/** Laporan attacker-agent (mode llm) yang labelnya berawalan salah satu prefix. */
export function loadReports(prefixes, { baseline }) {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  return readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith('attack-') && f.endsWith('.json'))
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(OUTPUT_DIR, f), 'utf8')) }))
    .filter(
      (r) =>
        r.mode === 'llm' &&
        Boolean(r.baseline) === baseline &&
        list.some((p) => (r.label ?? '').startsWith(p)),
    )
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export const parseMeta = (e) => {
  try {
    return JSON.parse(e.meta || '{}');
  } catch {
    return {};
  }
};

/** Sesi non-sah dengan event di jendela waktu run (agen uji lab berjalan berurutan). */
export function sessionsForRun(db, report) {
  const start = Date.parse(report.startedAt);
  const end = start + report.durationMs;
  const sessions = db
    .prepare(
      `select distinct s.* from sessions s join events e on e.session_id = s.id
       where e.ts between ? and ? and s.classification != 'legit' order by s.first_seen_at`,
    )
    .all(start - 2_000, end + 2_000);
  const eventsOf = db.prepare('select * from events where session_id = ? order by ts, id');
  const events = sessions.flatMap((s) => eventsOf.all(s.id)).filter((e) => e.ts >= start - 2_000);
  return { start, end, sessions, events };
}

export const median = (xs) => {
  const v = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export const sum = (xs) => xs.reduce((s, x) => s + (Number(x) || 0), 0);
