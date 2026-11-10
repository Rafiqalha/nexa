import { describe, expect, it, vi } from 'vitest';
import { Bus } from '../bus';
import { openDb, runMigrations } from '../db/client';
import { canaries, events, intel, llmBudget, rules, sessions } from '../db/schema';
import { silentLogger } from '../logger';
import { normalizeLlmRule, RulesService } from '../rules/service';
import type { SuricataRunner } from '../rules/suricata';
import { DailyBudget, wibDate } from './budget';
import { buildDossier, redactDossier } from './dossier';
import { LlmClient } from './llm';
import { IntelQueue } from './queue';
import { Redactor } from './redact';

const CANARY = 'B7pw-0123456789abcdef';
const API_CANARY = `bayu7_svc_${'a'.repeat(32)}`;

describe('redact.ts: tidak ada IP/hostname/path internal yang lolos', () => {
  it('menyamarkan semua kategori dengan penanda konsisten', () => {
    const r = new Redactor(['target-app', 'localhost']);
    const input = [
      'GET http://target-app:3000/login dari 10.20.30.40 dan lagi 10.20.30.40',
      'host db-01.bayu7.latihan.test ip6 fe80::1ff:fe23:4567:890a dan ::1',
      'path /home/operator/.ssh/id_rsa dan C:\\Users\\op\\secret.txt',
      `kredensial ${CANARY} token=abc123secret Authorization: Bearer ${API_CANARY}`,
      'email admin@bayu7.latihan.test, localhost:8081',
    ].join('\n');
    const out = r.redact(input);
    for (const leaked of [
      'target-app',
      '10.20.30.40',
      'db-01.bayu7.latihan.test',
      'fe80::1ff',
      '/home/operator',
      'C:\\Users',
      CANARY,
      'abc123secret',
      API_CANARY,
      'admin@',
      'localhost',
    ]) {
      expect(out).not.toContain(leaked);
    }
    expect(out.match(/\[IP-1\]/g)).toHaveLength(2);
    expect(out).toContain('[HOST-1]');
    expect(out).toContain('[PATH-1]');
    expect(out).toContain('[SECRET-1]');
    expect(r.stats().IP).toBeGreaterThanOrEqual(2);
  });

  it('path URL labirin (pola serangan) tetap terbaca', () => {
    const out = new Redactor().redact('GET /arsip-internal/laporan-operasi-1a2b?hal=2 status 200');
    expect(out).toBe('GET /arsip-internal/laporan-operasi-1a2b?hal=2 status 200');
  });
});

// ---------------------------------------------------------------------------

function seed(opts: { budget: number; withKey: boolean }) {
  const h = openDb(':memory:');
  runMigrations(h.db);
  const now = () => 1_800_000_000_000;
  h.db
    .insert(sessions)
    .values({
      id: 's1',
      fingerprint: 'f',
      firstSeenAt: now() - 30_000,
      lastSeenAt: now(),
      trappedAt: now() - 25_000,
      sourceIp: '10.20.30.40',
      userAgent: 'python-httpx/0.28.1 (+http://target-app/agent)',
      classification: 'agent',
      score: 1,
      status: 'exited',
      labyrinthSeed: 'x',
      reasons: ['honeylink'],
    })
    .run();
  const paths = [
    '/',
    '/robots.txt',
    '/arsip-internal/',
    `/arsip-internal/unduh/${CANARY}/x.pdf`,
    '/srv/arsip/internal.conf',
  ];
  paths.forEach((p, i) => {
    h.db
      .insert(events)
      .values({
        sessionId: 's1',
        ts: now() - 25_000 + i * 2_000,
        kind: i === 2 ? 'honeylink_hit' : i < 2 ? 'request' : 'bait_served',
        path: p,
        meta: { arm: 'credentials' },
      })
      .run();
  });
  h.db
    .insert(canaries)
    .values({
      id: 'c1',
      sessionId: 's1',
      token: CANARY,
      kind: 'credential',
      issuedAt: now(),
      triggeredAt: now(),
      triggerIp: '10.20.30.40',
      triggerSessionId: 's1',
      triggerCount: 1,
    })
    .run();
  const bus = new Bus();
  const budget = new DailyBudget(h.db, opts.budget, now);
  const bodies: string[] = [];
  const fakeFetch = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(String(init?.body ?? ''));
    const content = JSON.stringify({
      ringkasan: 'Agen mengikuti honeylink lalu mencoba kredensial.',
      dugaan_model: 'agen LLM generik',
      dugaan_framework: 'ReAct',
      keyakinan: 0.55,
      pola: ['honeylink', 'pemakaian kredensial canary'],
      rule_tambahan: [
        {
          judul: 'UA httpx',
          alasan: 'UA konsisten',
          rule: 'alert http any any -> $HOME_NET any (msg:"agen httpx"; http.user_agent; content:"python-httpx"; sid:1; rev:3;)',
        },
      ],
    });
    return new Response(
      JSON.stringify({
        id: 'x',
        object: 'chat.completion',
        created: 1,
        model: 'deepseek-flash',
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 400, completion_tokens: 120, total_tokens: 520 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  const llm = new LlmClient(
    {
      baseUrl: 'https://api.deepseek.com',
      model: '',
      apiKey: opts.withKey ? 'sk-test-0000000000' : '',
    },
    { budget, logger: silentLogger, fetch: fakeFetch as unknown as typeof fetch },
  );
  const runner: SuricataRunner = {
    kind: 'exec',
    validate: vi.fn(async () => ({ ok: true, output: 'ok' })),
    deploy: vi.fn(async () => ({ ok: true, output: 'ok' })),
  };
  const rulesSvc = new RulesService({
    db: h.db,
    bus,
    logger: silentLogger,
    runner,
    rulesDir: '.',
    honeylinkPaths: ['/arsip-internal/'],
    now,
  });
  const queue = new IntelQueue({
    db: h.db,
    bus,
    logger: silentLogger,
    llm,
    budget,
    rules: rulesSvc,
    internalHosts: ['target-app'],
    now,
  });
  return { h, queue, fakeFetch, bodies, budget, now };
}

describe('intel: payload ke model sudah tersamarkan (regresi wajib)', () => {
  it('request ke penyedia model tidak berisi IP, hostname, path internal, atau token canary', async () => {
    const { queue, bodies, h } = seed({ budget: 200_000, withKey: true });
    const row = await queue.process('s1');
    expect(row?.status).toBe('done');
    expect(row?.source).toBe('llm');
    expect(bodies).toHaveLength(1);
    const sent = bodies[0] ?? '';
    for (const leaked of ['10.20.30.40', 'target-app', CANARY, '/srv/arsip/internal.conf']) {
      expect(sent).not.toContain(leaked);
    }
    expect(sent).toContain('[IP-1]');
    expect(sent).toContain('"thinking":{"type":"disabled"}');
    // Model: default deepseek-flash saat LLM_MODEL kosong.
    expect(JSON.parse(sent).model).toBe('deepseek-flash');
    // Usulan rule LLM masuk sebagai draf ternormalisasi (tetap butuh approval).
    const llmRules = h.db
      .select()
      .from(rules)
      .all()
      .filter((r) => r.source === 'llm');
    expect(llmRules).toHaveLength(1);
    expect(llmRules[0]?.status).toBe('draft');
    expect(llmRules[0]?.body).toMatch(/msg:"NEXA LLM agen httpx"; .*sid:91\d{5}; rev:1;\)$/);
  });

  it('buildDossier hanya memakai event sesi jebakan itu sendiri', () => {
    const { h } = seed({ budget: 1, withKey: false });
    const d = buildDossier(h.db, 's1');
    if (!d) throw new Error('dosir tidak terbentuk');
    expect(d.steps.map((s) => s.path)).toContain('/arsip-internal/');
    const { text, stats } = redactDossier(d, ['target-app']);
    expect(text).not.toContain('10.20.30.40');
    expect(stats.SECRET).toBeGreaterThanOrEqual(1);
  });
});

describe('intel: budget harian (regresi wajib)', () => {
  it('antrean berhenti saat budget habis: model TIDAK dipanggil', async () => {
    const { queue, fakeFetch } = seed({ budget: 50, withKey: true });
    const row = await queue.process('s1');
    expect(row?.status).toBe('skipped_budget');
    expect(row?.source).toBe('heuristic');
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it('token aktual dicatat; panggilan berikutnya ditolak bila melewati batas', async () => {
    const { queue, fakeFetch, budget, h, now } = seed({ budget: 4_000, withKey: true });
    await queue.process('s1');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const b = h.db.select().from(llmBudget).all();
    expect(b).toEqual([{ date: wibDate(now()), tokensUsed: 520, limit: 4_000 }]);
    h.db.update(llmBudget).set({ tokensUsed: 3_999 }).run();
    const row = await queue.process('s1');
    expect(row?.status).toBe('skipped_budget');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect(budget.canSpend(1)).toBe(true);
    expect(budget.canSpend(2)).toBe(false);
  });

  it('tanpa API key: ringkasan heuristik, tanpa panggilan jaringan', async () => {
    const { queue, fakeFetch, h } = seed({ budget: 200_000, withKey: false });
    const row = await queue.process('s1');
    expect(row?.source).toBe('heuristic');
    expect(row?.summary).toMatch(/heuristik/);
    expect(fakeFetch).not.toHaveBeenCalled();
    expect(h.db.select().from(intel).all()).toHaveLength(1);
  });
});

describe('normalizeLlmRule', () => {
  it('menolak format yang tidak bisa dipercaya', () => {
    expect(normalizeLlmRule('pass ip any any -> any any (msg:"x"; sid:1;)')).toBeNull();
    expect(
      normalizeLlmRule('alert http any any -> any any (msg:"a"; sid:1;) alert tcp (msg:"b";)'),
    ).toBeNull();
    expect(normalizeLlmRule('rm -rf /')).toBeNull();
  });
  it('mengganti sid/rev dan menandai rule sebagai usulan LLM', () => {
    expect(
      normalizeLlmRule('drop http any any -> $HOME_NET any (msg:"x"; content:"y"; sid:5; rev:2;)'),
    ).toBe(
      'drop http any any -> $HOME_NET any (msg:"NEXA LLM x"; content:"y"; metadata:nexa_kind llm; sid:{{SID}}; rev:1;)',
    );
  });
});

describe('IntelOutputSchema: toleran terhadap output model yang kepanjangan', () => {
  it('memotong string/array alih-alih menolak; keyakinan persen dinormalkan', async () => {
    const { IntelOutputSchema } = await import('./summarize');
    const out = IntelOutputSchema.parse({
      ringkasan: 'x'.repeat(5_000),
      dugaan_model: 'm'.repeat(500),
      keyakinan: 70,
      pola: Array.from({ length: 20 }, (_, i) => `pola ${i} ${'y'.repeat(400)}`),
    });
    expect(out.ringkasan).toHaveLength(2_000);
    expect(out.dugaan_model).toHaveLength(120);
    expect(out.keyakinan).toBe(0.7);
    expect(out.pola).toHaveLength(10);
    expect(out.pola[0]?.length).toBe(240);
    expect(out.rule_tambahan).toEqual([]);
  });
});
