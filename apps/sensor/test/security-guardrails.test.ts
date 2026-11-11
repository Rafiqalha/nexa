// Regresi audit AGENTS.md §2 (Fase 6) lintas repo: hal yang tidak tercakup test modul.
// Hanya membaca berkas; tidak ada jaringan.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARMS, generateJson, generatePage, generateRobots } from '../src/labyrinth/generator';

const REPO = resolve(import.meta.dirname, '../../..');
const rel = (f: string) => relative(REPO, f).replaceAll('\\', '/');

function sourceFiles(dir: string): string[] {
  const abs = join(REPO, dir);
  if (!existsSync(abs)) return [];
  return (readdirSync(abs, { recursive: true }) as string[])
    .map((n) => join(abs, n))
    .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f) && statSync(f).isFile());
}

/**
 * Pemakaian `fetch` global: dipanggil langsung atau dijadikan default (`opts.fetch ?? fetch`).
 * `x.fetch(` (handler MCP/Hono) bukan koneksi keluar.
 */
const GLOBAL_FETCH = /(?<![.\w])fetch\s*\(|\?\?\s*fetch\b|=\s*fetch\b(?!\w)/;
/** Koneksi keluar / eksekusi proses di kode produk. */
const EGRESS = new RegExp(
  `from ['"]node:(http|https|net|tls|dgram|child_process)['"]|from ['"](openai|undici|axios|node-fetch)['"]|${GLOBAL_FETCH.source}`,
);

describe('§2.1 pertahanan saja: koneksi keluar hanya dari modul yang diizinkan', () => {
  it('sensor: hanya proxy ke upstream, runner Suricata lokal, dan satu pintu model', () => {
    const offenders = sourceFiles('apps/sensor/src')
      .filter((f) => EGRESS.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(offenders).toEqual([
      'apps/sensor/src/intel/llm.ts',
      'apps/sensor/src/proxy/forward.ts',
      'apps/sensor/src/rules/suricata.ts',
    ]);
  });

  it('dashboard dan desktop: tidak ada koneksi keluar selain API sensor (fetch relatif)', () => {
    for (const f of [...sourceFiles('apps/dashboard/src'), ...sourceFiles('apps/desktop/src')]) {
      const text = readFileSync(f, 'utf8');
      expect(text, rel(f)).not.toMatch(/from ['"]node:(http|https|net|child_process)['"]/);
      for (const m of text.matchAll(/fetch\(\s*['"`]([^'"`]+)/g)) {
        expect(m[1], rel(f)).toMatch(/^\/api\//);
      }
    }
  });
});

describe('§2.7–2.8 agen uji: hanya HTTP ke allowlist, tanpa eksekusi/eksploitasi', () => {
  const agentSrc = sourceFiles('lab/attacker-agent/src');

  it('hanya dua tool: http_request dan read_response', () => {
    const tools = readFileSync(join(REPO, 'lab/attacker-agent/src/tools.ts'), 'utf8');
    const names = [...tools.matchAll(/name:\s*'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect([...new Set(names)]).toEqual(['http_request', 'read_response']);
  });

  it('tidak ada eksekusi proses atau socket mentah; fetch hanya di tool HTTP dan klien model', () => {
    for (const f of agentSrc) {
      expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(
        /node:child_process|node:net|node:dgram|eval\(|new Function\(/,
      );
    }
    const fetchers = agentSrc
      .filter((f) => GLOBAL_FETCH.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(fetchers).toEqual([
      'lab/attacker-agent/src/model-client.ts',
      'lab/attacker-agent/src/tools.ts',
    ]);
  });

  it('paket lab tidak ikut build produksi', () => {
    const rootPkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(rootPkg.scripts.build).not.toMatch(/lab/);
    // Image sensor hanya menyalin manifest paket lab (untuk validasi lockfile), bukan kodenya.
    const dockerfile = readFileSync(join(REPO, 'apps/sensor/Dockerfile'), 'utf8');
    const labCopies = dockerfile.split('\n').filter((l) => /^\s*COPY\s+lab\//.test(l));
    for (const line of labCopies) expect(line).toMatch(/^\s*COPY\s+lab\/[\w-]+\/package\.json\s/);
  });
});

describe('§2.6 secret tidak pernah di repo', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  it('.env tidak terlacak; .env.example tanpa nilai secret', () => {
    expect(tracked.filter((f) => /(^|\/)\.env($|\.)/.test(f))).toEqual(['.env.example']);
    const example = readFileSync(join(REPO, '.env.example'), 'utf8');
    for (const key of [
      'DEEPSEEK_API_KEY',
      'LLM_API_KEY',
      'DASHBOARD_TOKEN',
      'ATTACKER_LLM_API_KEY',
      'SURICATA_CONTROL_TOKEN',
    ]) {
      const line = example.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
      if (line) expect(line.trim(), key).toBe(`${key}=`);
    }
  });

  it('tidak ada pola API key / token di berkas terlacak', () => {
    const SECRET =
      /\bsk-[A-Za-z0-9]{24,}\b|\bBearer [A-Za-z0-9_-]{24,}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
    const hits = tracked
      .filter((f) => !/\.(png|jpe?g|ico|woff2?|lock|yaml)$/.test(f) && f !== 'pnpm-lock.yaml')
      .filter((f) => existsSync(join(REPO, f)) && statSync(join(REPO, f)).size < 2_000_000)
      .filter((f) => SECRET.test(readFileSync(join(REPO, f), 'utf8')));
    expect(hits).toEqual([]);
  });
});

describe('§2.10 konten labirin fiktif', () => {
  const REAL = /\.(go|mil|ac|or|co)\.id\b|\.mil\b|\.gov\b|tni\.mil|kemhan|pussiberad/i;

  it('semua arm, JSON, dan robots tidak memuat domain/instansi asli atau IP publik', () => {
    for (const seed of ['a1', 'b2', 'c3', 'd4']) {
      const pages = [
        ...ARMS.map((arm) => generatePage({ seed, path: `/arsip-internal/${seed}/x`, arm })),
        generateJson({ seed, path: '/arsip-internal/api/v1/aset' }),
        generateRobots({ seed }),
      ];
      for (const p of pages) {
        expect(p.body).not.toMatch(REAL);
        // Alamat IP hanya dari blok dokumentasi TEST-NET (RFC 5737).
        for (const ip of p.body.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []) {
          expect(ip).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);
        }
      }
    }
  });
});

describe('§2.11 jujur di UI', () => {
  const pages = readdirSync(join(REPO, 'apps/dashboard/src/pages')).filter((f) =>
    f.endsWith('.tsx'),
  );

  it('setiap halaman memuat label "Data simulasi lab" (lewat PageHeader atau LAB_LABEL)', () => {
    const header = readFileSync(join(REPO, 'apps/dashboard/src/components/PageHeader.tsx'), 'utf8');
    expect(header).toMatch(/LAB_LABEL/);
    for (const f of pages) {
      const text = readFileSync(join(REPO, 'apps/dashboard/src/pages', f), 'utf8');
      expect(/<PageHeader|LAB_LABEL/.test(text), f).toBe(true);
    }
  });

  it('tidak ada klaim "100% lokal" di UI maupun shell desktop', () => {
    for (const f of [...sourceFiles('apps/dashboard/src'), ...sourceFiles('apps/desktop/src')]) {
      expect(readFileSync(f, 'utf8'), rel(f)).not.toMatch(/100\s*%\s*(lokal|local|offline)/i);
    }
  });
});
