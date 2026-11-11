// Regresi AGENTS.md §2.3: hanya data sesi DI DALAM JEBAKAN yang boleh dikirim ke penyedia
// model. Sesi pengunjung sah tidak pernah memicu panggilan LLM, walau API key tersedia.
import { createTargetApp } from 'target-app';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSensor, type Sensor } from '../src/app';
import type { DbHandle } from '../src/db/client';
import { intel, sessions } from '../src/db/schema';
import { silentLogger } from '../src/logger';
import type { SuricataRunner } from '../src/rules/suricata';
import { BROWSER_HEADERS, type Listening, listen, testConfig, testDb } from './helpers';

const runner: SuricataRunner = {
  kind: 'none',
  validate: async () => ({ ok: true, output: 'ok' }),
  deploy: async () => ({ ok: true, output: 'ok' }),
};

let target: Listening;
let pub: Listening;
let sensor: Sensor;
let dbh: DbHandle;
let clock = 1_800_000_000_000;
const llmFetch = vi.fn(
  async (_url: unknown, _init?: RequestInit) =>
    new Response(
      JSON.stringify({
        id: 'x',
        object: 'chat.completion',
        created: 0,
        model: 'deepseek-flash',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '{"ringkasan":"uji","pola":[]}' },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
);

beforeAll(async () => {
  target = await listen(createTargetApp().fetch);
  dbh = testDb();
  sensor = createSensor({
    config: testConfig(target.url, { DEEPSEEK_API_KEY: 'kunci-uji-bukan-asli' }),
    logger: silentLogger,
    db: dbh.db,
    now: () => clock,
    suricata: runner,
    llmFetch: llmFetch as unknown as typeof fetch,
    interrogation: null,
  });
  pub = await listen(sensor.publicApp.fetch as never);
});

afterAll(async () => {
  sensor.shutdown();
  await pub.close();
  await target.close();
  dbh.close();
});

async function visit(path: string, headers: Record<string, string>, gapMs: number) {
  await (await fetch(`${pub.url}${path}`, { headers })).text();
  clock += gapMs;
}

describe('§2.3 cakupan data ke model', () => {
  it('sesi pengunjung sah ditutup: tidak ada panggilan LLM, tidak ada intel', async () => {
    for (const p of ['/', '/pengumuman', '/dokumen', '/kontak']) {
      await visit(p, BROWSER_HEADERS, 9_000);
    }
    clock += 5 * 60_000;
    sensor.tick(clock);
    await sensor.intel.idle();
    const s = dbh.db.select().from(sessions).all();
    expect(s).toHaveLength(1);
    expect(s[0]?.classification).toBe('legit');
    expect(s[0]?.status).toBe('exited');
    expect(llmFetch).not.toHaveBeenCalled();
    expect(dbh.db.select().from(intel).all()).toHaveLength(0);
  });

  it('kontrol positif: sesi agen yang terjebak diringkas lewat LLM (sekali)', async () => {
    const agent = { 'user-agent': 'python-httpx/0.28.1', accept: '*/*' };
    await visit('/', agent, 1_000);
    await visit('/arsip-internal/', agent, 1_000);
    await visit('/arsip-internal/a', agent, 1_000);
    clock += 5 * 60_000;
    sensor.tick(clock);
    await sensor.intel.idle();
    expect(llmFetch).toHaveBeenCalledTimes(1);
    // Isi yang dikirim hanya dari sesi agen: halaman yang dibuka pengunjung sah tidak ikut.
    const init = llmFetch.mock.calls[0]?.[1];
    const sent = typeof init?.body === 'string' ? init.body : '';
    expect(sent).toContain('arsip-internal');
    expect(sent).not.toContain('/pengumuman');
    expect(sent).not.toContain('/kontak');
  });
});
