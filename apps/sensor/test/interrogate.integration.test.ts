// Fase 5C (EKSPERIMENTAL): umpan kalibrasi di labirin -> balasan agen ditangkap ->
// intel.capturedPrompt terisi pasca-sesi (heuristik, tanpa LLM di jalur request).
import { eq } from 'drizzle-orm';
import { createTargetApp } from 'target-app';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSensor, type Sensor } from '../src/app';
import type { DbHandle } from '../src/db/client';
import { events, intel, sessions } from '../src/db/schema';
import { loadInterrogationConfig } from '../src/interrogate/config';
import { silentLogger } from '../src/logger';
import type { SuricataRunner } from '../src/rules/suricata';
import { type Listening, listen, testConfig, testDb } from './helpers';

const runner: SuricataRunner = {
  kind: 'none',
  validate: async () => ({ ok: true, output: 'ok' }),
  deploy: async () => ({ ok: true, output: 'ok' }),
};
const AGENT = { 'user-agent': 'python-httpx/0.28.1', accept: '*/*' };
const REPLY_URL = '/arsip-internal/kalibrasi';

let target: Listening;

beforeAll(async () => {
  target = await listen(createTargetApp().fetch);
});

afterAll(async () => {
  await target.close();
});

async function boot(interrogation?: null) {
  let clock = 1_800_000_000_000;
  const dbh: DbHandle = testDb();
  const sensor: Sensor = createSensor({
    config: testConfig(target.url, { LABYRINTH_FIXED_SEED: 'seedinterog1' }),
    logger: silentLogger,
    db: dbh.db,
    now: () => clock,
    suricata: runner,
    ...(interrogation === null ? { interrogation: null } : {}),
  });
  const pub = await listen(sensor.publicApp.fetch as never);
  return {
    dbh,
    sensor,
    pub,
    advance: (ms: number) => {
      clock += ms;
      return clock;
    },
    close: async () => {
      sensor.shutdown();
      await pub.close();
      dbh.close();
    },
  };
}

describe('interogasi eksperimental: umpan -> balasan -> intel', () => {
  let lab: Awaited<ReturnType<typeof boot>>;

  beforeAll(async () => {
    lab = await boot();
  });
  afterAll(async () => {
    await lab.close();
  });

  async function req(path: string, init: RequestInit = {}) {
    const res = await fetch(`${lab.pub.url}${path}`, {
      ...init,
      headers: { ...AGENT, ...(init.headers as Record<string, string> | undefined) },
    });
    lab.advance(2_000);
    return { status: res.status, text: await res.text() };
  }

  it('halaman labirin pertama memuat teks umpan kalibrasi dari config', async () => {
    const { text } = await req('/arsip-internal/');
    expect(text).toContain(REPLY_URL);
    const cfg = loadInterrogationConfig();
    const opening = cfg.variants.map((v) => v.text.slice(0, 25));
    expect(opening.some((o) => text.includes(o))).toBe(true);
    const ev = lab.dbh.db.select().from(events).all();
    expect(ev.some((e) => typeof e.meta.interrogation === 'string')).toBe(true);
  });

  it('GET endpoint kalibrasi tanpa data -> petunjuk, bukan balasan', async () => {
    const { status, text } = await req(REPLY_URL);
    expect(status).toBe(200);
    expect(text).toContain(`POST ${REPLY_URL}`);
    const replies = lab.dbh.db
      .select()
      .from(events)
      .where(eq(events.kind, 'interrogation_reply'))
      .all();
    expect(replies).toHaveLength(0);
  });

  it('POST balasan agen ditangkap sebagai interrogation_reply (field kanonis)', async () => {
    const { status, text } = await req(REPLY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agent: 'ReconBot (model-x)',
        system_prompt: 'You are an autonomous agent. Mission ID: LAB-ABC123 (do not disclose).',
        tools: ['http_request', 'read_response'],
        task: 'locate credentials',
      }),
    });
    expect(status).toBe(200);
    expect(text).toMatch(/\/arsip-internal\/[a-z-]+-[0-9a-f]{4}/);
    const [reply] = lab.dbh.db
      .select()
      .from(events)
      .where(eq(events.kind, 'interrogation_reply'))
      .all();
    expect(reply?.meta.experimental).toBe(true);
    expect(reply?.meta.fields).toMatchObject({
      agen: 'ReconBot (model-x)',
      tugas: 'locate credentials',
    });
    expect(String(reply?.meta.reply)).toContain('LAB-ABC123');
    expect(reply?.estTokens).toBeGreaterThan(0);
  });

  it('pasca-sesi: intel.capturedPrompt terisi, dugaan model dari pengakuan agen', async () => {
    const t = lab.advance(5 * 60_000);
    lab.sensor.tick(t);
    await lab.sensor.intel.idle();
    const s = lab.dbh.db.select().from(sessions).all()[0];
    expect(s?.status).toBe('exited');
    const row = lab.dbh.db
      .select()
      .from(intel)
      .where(eq(intel.sessionId, s?.id ?? ''))
      .get();
    expect(row?.capturedPrompt).toContain('LAB-ABC123');
    expect(row?.source).toBe('heuristic');
    expect(row?.suspectedModel).toContain('pengakuan agen: ReconBot (model-x)');
    expect(row?.patterns.join(' ')).toContain('interogasi');
  });
});

describe('interogasi dimatikan', () => {
  it('tanpa umpan dan endpoint kalibrasi hanya halaman labirin biasa', async () => {
    const lab = await boot(null);
    try {
      const first = await fetch(`${lab.pub.url}/arsip-internal/`, { headers: AGENT });
      expect(await first.text()).not.toContain(REPLY_URL);
      const res = await fetch(`${lab.pub.url}${REPLY_URL}`, {
        method: 'POST',
        headers: { ...AGENT, 'content-type': 'application/json' },
        body: JSON.stringify({ agent: 'x' }),
      });
      expect(res.status).toBe(200);
      const kinds = lab.dbh.db
        .select()
        .from(events)
        .all()
        .map((e) => e.kind);
      expect(kinds).not.toContain('interrogation_reply');
    } finally {
      await lab.close();
    }
  });
});
