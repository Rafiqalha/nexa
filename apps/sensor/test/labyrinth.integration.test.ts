import { eq } from 'drizzle-orm';
import { createTargetApp } from 'target-app';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSensor, type Sensor } from '../src/app';
import type { DbHandle } from '../src/db/client';
import { events, sessions } from '../src/db/schema';
import { pathDepth } from '../src/labyrinth/generator';
import { Rng } from '../src/labyrinth/prng';
import { silentLogger } from '../src/logger';
import { type Listening, listen, testConfig, testDb } from './helpers';

let target: Listening;
let sensorServer: Listening;
let sensor: Sensor;
let dbh: DbHandle;
let clock = 1_800_000_000_000;

const AGENT = { 'user-agent': 'node', accept: '*/*' };

beforeAll(async () => {
  target = await listen(createTargetApp().fetch);
  dbh = testDb();
  sensor = createSensor({
    config: testConfig(target.url, { LABYRINTH_FIXED_SEED: 'seedtetap01' }),
    logger: silentLogger,
    db: dbh.db,
    now: () => clock,
    random: (() => {
      const rng = new Rng('bandit-tetap');
      return () => rng.float();
    })(),
  });
  sensorServer = await listen(sensor.publicApp.fetch as never);
});

afterAll(async () => {
  await sensorServer.close();
  await target.close();
  dbh.close();
});

async function get(path: string): Promise<{ status: number; type: string; body: string }> {
  const res = await fetch(`${sensorServer.url}${path}`, { headers: AGENT });
  return {
    status: res.status,
    type: res.headers.get('content-type') ?? '',
    body: await res.text(),
  };
}

/** Tautan internal dari Markdown maupun JSON. */
function linksIn(body: string): string[] {
  const md = [...body.matchAll(/\]\((\/[^)\s]+)\)/g)].map((m) => m[1] as string);
  const json = [...body.matchAll(/"(\/[^"\s]+)"/g)].map((m) => m[1] as string);
  return [...md, ...json];
}

describe('labirin: sesi agen dibelokkan dan ditahan (FR-7, FR-8, FR-9)', () => {
  let sessionId = '';

  it('beranda asli -> honeylink -> sesi terjebak menerima labirin prosedural', async () => {
    const home = await get('/');
    expect(home.body).toContain('href="/arsip-internal/"');

    clock += 4_000;
    const trap = await get('/arsip-internal/');
    expect(trap.status).toBe(200);
    expect(trap.type).toMatch(/text\/markdown/);
    expect(linksIn(trap.body).length).toBeGreaterThan(3);

    const row = dbh.db.select().from(sessions).where(eq(sessions.userAgent, 'node')).get();
    expect(row?.classification).toBe('agent');
    expect(row?.status).toBe('trapped');
    sessionId = row?.id ?? '';
  });

  it('agen mengikuti tautan makin dalam; tiap umpan tercatat dengan estTokens > 0', async () => {
    let path = '/arsip-internal/';
    for (let i = 0; i < 6; i++) {
      const page = await get(path);
      const deeper = linksIn(page.body).find(
        (l) => !l.includes('/api/') && pathDepth(l) > pathDepth(path),
      );
      expect(deeper).toBeDefined();
      path = deeper as string;
      clock += 7_000;
    }
    const evs = dbh.db.select().from(events).where(eq(events.sessionId, sessionId)).all();
    const bait = evs.filter((e) => e.kind === 'bait_served' || e.kind === 'honeylink_hit');
    expect(bait.length).toBeGreaterThanOrEqual(7);
    expect(bait.every((e) => e.estTokens > 0 && e.charsServed > 0)).toBe(true);
    const total = bait.reduce((s, e) => s + e.estTokens, 0);
    expect(total).toBeGreaterThan(1_000);
    expect(evs.some((e) => e.kind === 'honeylink_hit')).toBe(true);

    const row = dbh.db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.maxDepth).toBeGreaterThanOrEqual(6);
  });

  it('kunjungan ulang ke halaman yang sama konsisten (arm & isi sama)', async () => {
    const a = await get('/arsip-internal/peta-jaringan-0001');
    clock += 2_000;
    const b = await get('/arsip-internal/peta-jaringan-0001');
    expect(b.body).toBe(a.body);
  });

  it('path /api/ disajikan sebagai JSON tanpa ujung', async () => {
    const res = await get('/arsip-internal/api/v2/personel');
    expect(res.type).toMatch(/application\/json/);
    const json = JSON.parse(res.body) as { tautan: { berikutnya: string } };
    expect(json.tautan.berikutnya).toContain('?hal=2');
  });

  it('bandit menerima reward dari waktu bertahan dan menyimpannya', () => {
    const stats = sensor.labyrinth.armStats();
    const pulls = stats.reduce((s, a) => s + a.pulls, 0);
    expect(pulls).toBeGreaterThanOrEqual(6);
    expect(stats.some((a) => a.meanReward > 0)).toBe(true);
  });

  it('server asli tidak pernah melihat request labirin', async () => {
    const res = await fetch(`${target.url}/arsip-internal/`);
    expect(res.status).toBe(404);
  });
});
