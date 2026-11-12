// Angka di landing harus sama dengan sumbernya: hasil lab dari docs/metrics.json (dihitung ulang
// dengan median yang sama seperti scripts/lib/lab-data.mjs), bobot dan ambang deteksi dari
// sensor, serta batas agen uji dari konfigurasinya. Kalau lab dijalankan ulang, test ini gagal
// sampai content/lab.ts diperbarui.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WEIGHTS } from '../../../sensor/src/detect/score';
import { decoyPath } from './decoys';
import { LAB, LAB_LABEL } from './lab';

const REPO = resolve(import.meta.dirname, '../../../..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

interface NexaRun {
  model: string;
  detected: boolean;
  timeToTrapS: number;
  upstreamRequests: number;
  labyrinthRequests: number;
  heldS: number;
  baitEstTokens: number;
  nexaTokens: number;
}
interface Metrics {
  label: string;
  nexaRuns: NexaRun[];
  baselineRuns: Array<{ model: string; requests: number }>;
  human: Record<string, { total: number; flagged: number }>;
}

const metrics = JSON.parse(read('docs/metrics.json')) as Metrics;

/** Sama dengan `median` di scripts/lib/lab-data.mjs. */
function median(xs: number[]): number {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? (v[m] as number) : ((v[m - 1] as number) + (v[m] as number)) / 2;
}

describe('landing: hasil lab = docs/metrics.json', () => {
  it('label data sama', () => {
    expect(metrics.label).toBe(LAB_LABEL);
  });

  it.each(LAB.models.map((m) => [m.model, m]))('%s', (model, expected) => {
    const runs = metrics.nexaRuns.filter((r) => r.model === model);
    const base = metrics.baselineRuns.filter((r) => r.model === model);
    expect(runs.length).toBeGreaterThan(0);
    expect(base.length).toBeGreaterThan(0);
    expect(expected).toEqual({
      model,
      withoutNexa: median(base.map((r) => r.requests)),
      withNexa: median(runs.map((r) => r.upstreamRequests)),
      heldRequests: Math.round(median(runs.map((r) => r.labyrinthRequests))),
      heldSeconds: Math.round(median(runs.map((r) => r.heldS))),
      intelTokens: median(runs.map((r) => r.nexaTokens)),
    });
  });

  it('agen terjebak dan waktu sampai terjebak', () => {
    const runs = metrics.nexaRuns;
    expect(LAB.trapped).toEqual({
      runs: runs.filter((r) => r.detected).length,
      total: runs.length,
    });
    const ttt = median(runs.map((r) => r.timeToTrapS));
    expect(LAB.timeToTrapSeconds).toBe(Math.round(ttt * 10) / 10);
  });

  it('pengunjung manusia (simulasi)', () => {
    const groups = Object.values(metrics.human);
    expect(LAB.humans).toEqual({
      flagged: groups.reduce((s, g) => s + g.flagged, 0),
      total: groups.reduce((s, g) => s + g.total, 0),
    });
  });

  it('estimasi token umpan per halaman (dibulatkan ke ratusan)', () => {
    const perPage = median(metrics.nexaRuns.map((r) => r.baitEstTokens / r.labyrinthRequests));
    expect(LAB.baitTokensPerPage).toBe(Math.round(perPage / 100) * 100);
  });

  it('batas agen uji sama dengan konfigurasi lab/attacker-agent', () => {
    const cfg = read('lab/attacker-agent/src/config.ts');
    expect(cfg).toMatch(new RegExp(`ATTACKER_MAX_STEPS:.*default\\(${LAB.agentCap.steps}\\)`));
    const tokens = String(LAB.agentCap.tokens).replace(/\B(?=(\d{3})+(?!\d))/g, '_');
    expect(cfg).toMatch(new RegExp(`ATTACKER_MAX_TOKENS:.*default\\(${tokens}\\)`));
  });
});

describe('landing: angka deteksi = sensor', () => {
  const html = read('apps/landing/index.html');
  const id = (n: number) => n.toFixed(2).replace('.', ',');

  it('bobot sinyal di panel deteksi', () => {
    expect(html).toContain(
      `honeylink</span><span class="signal__bar"><span style="width: ${WEIGHTS.honeylink * 100}%"></span></span><span class="signal__val">+${id(WEIGHTS.honeylink)}`,
    );
    expect(html).toContain(`+${id(WEIGHTS.missing_browser_headers)}</span>`);
    const score = WEIGHTS.honeylink + WEIGHTS.missing_browser_headers;
    expect(html).toContain(`skor ${id(score)} ≥ ambang`);
  });

  it('ambang agen sama dengan default sensor', () => {
    const cfg = read('apps/sensor/src/config.ts');
    const threshold = Number(
      cfg.match(/AGENT_SCORE_THRESHOLD: opt\(ratio\.default\(([\d.]+)\)\)/)?.[1],
    );
    expect(threshold).toBeGreaterThan(0);
    expect(html).toContain(`ambang ${id(threshold)}`);
    expect(html).toContain(`Lewat ambang ${id(threshold)}`);
  });
});

describe('landing: umpan fiktif', () => {
  it('path umpan deterministik dan hanya memakai kosakata sensor', () => {
    expect(decoyPath('BAYU-7#1', 3)).toBe(decoyPath('BAYU-7#1', 3));
    for (let i = 0; i < 50; i++) {
      expect(decoyPath('BAYU-7#1', i)).toMatch(
        /^\/arsip-internal\/[a-z]{3}-lat\/[a-z0-9-]+-\d{2}\.(?:md|txt|pdf|xlsx|conf|json|zip|bak)$/,
      );
    }
  });
});
