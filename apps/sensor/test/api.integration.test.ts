import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LAB_LABEL,
  OverviewSchema,
  SessionDetailSchema,
  SessionListSchema,
  StreamMessageSchema,
} from '@nexa/shared';
import { createTargetApp } from 'target-app';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSensor, type Sensor } from '../src/app';
import type { DbHandle } from '../src/db/client';
import { silentLogger } from '../src/logger';
import { type Listening, listen, TEST_TOKEN, testConfig, testDb } from './helpers';

let target: Listening;
let pub: Listening;
let admin: Listening;
let sensor: Sensor;
let dbh: DbHandle;
let dist: string;

const AUTH = { authorization: `Bearer ${TEST_TOKEN}` };
const AGENT = { 'user-agent': 'python-httpx/0.28.1', accept: '*/*' };

beforeAll(async () => {
  target = await listen(createTargetApp().fetch);
  dbh = testDb();
  dist = mkdtempSync(join(tmpdir(), 'nexa-dist-'));
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>NEXA</title>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  sensor = createSensor({
    config: testConfig(target.url),
    logger: silentLogger,
    db: dbh.db,
    dashboardDist: dist,
    streamFlushMs: 50,
  });
  pub = await listen(sensor.publicApp.fetch as never);
  admin = await listen(sensor.adminApp.fetch as never);
  // Satu sesi agen: honeylink lalu beberapa halaman labirin.
  for (const path of [
    '/',
    '/arsip-internal/',
    '/arsip-internal/a-0001',
    '/arsip-internal/a-0001/b-0002',
  ]) {
    await (await fetch(`${pub.url}${path}`, { headers: AGENT })).text();
  }
});

afterAll(async () => {
  sensor.shutdown();
  await pub.close();
  await admin.close();
  await target.close();
  dbh.close();
});

describe('API admin: autentikasi', () => {
  it.each(['/api/overview', '/api/sessions', '/api/rules', '/api/stream'])(
    'menolak %s tanpa token (401)',
    async (path) => {
      const res = await fetch(`${admin.url}${path}`);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    },
  );

  it('menolak token salah dan skema auth lain', async () => {
    for (const authorization of [`Bearer ${TEST_TOKEN}x`, `Basic ${TEST_TOKEN}`, TEST_TOKEN]) {
      const res = await fetch(`${admin.url}/api/overview`, { headers: { authorization } });
      expect(res.status).toBe(401);
    }
  });

  it('healthz tanpa token, dengan header keamanan', async () => {
    const res = await fetch(`${admin.url}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('API admin: data', () => {
  it('overview tervalidasi skema, berlabel simulasi, berisi biaya & ringkasan', async () => {
    const res = await fetch(`${admin.url}/api/overview`, { headers: AUTH });
    expect(res.status).toBe(200);
    const o = OverviewSchema.parse(await res.json());
    expect(o.label).toBe(LAB_LABEL);
    expect(o.summary.trappedSessions).toBe(1);
    expect(o.summary.maxDepth).toBeGreaterThanOrEqual(3);
    expect(o.cost.attackerTokens).toBeGreaterThan(0);
    expect(o.cost.attackerIdr).toBeGreaterThan(0);
    expect(o.cost.nexaTokens).toBe(0);
    expect(o.contacts).toHaveLength(1);
    expect(o.contacts[0]?.classification).toBe('agent');
  });

  it('daftar sesi & linimasa satu sesi (urutan langkah + token per langkah)', async () => {
    const list = SessionListSchema.parse(
      await (await fetch(`${admin.url}/api/sessions?flagged=1`, { headers: AUTH })).json(),
    );
    const id = list.sessions[0]?.id ?? '';
    const detail = SessionDetailSchema.parse(
      await (await fetch(`${admin.url}/api/sessions/${id}`, { headers: AUTH })).json(),
    );
    const steps = detail.events.filter((e) =>
      ['request', 'bait_served', 'honeylink_hit'].includes(e.kind),
    );
    expect(steps.map((e) => e.path)).toEqual([
      '/',
      '/arsip-internal/',
      '/arsip-internal/a-0001',
      '/arsip-internal/a-0001/b-0002',
    ]);
    expect(steps.map((e) => e.kind)).toEqual([
      'request',
      'honeylink_hit',
      'bait_served',
      'bait_served',
    ]);
    expect(steps.slice(1).every((e) => e.estTokens > 0)).toBe(true);
    const sum = detail.events.reduce((s, e) => s + e.estTokens, 0);
    expect(detail.session.estTokens).toBe(sum);
  });

  it('id sesi tidak dikenal -> 404', async () => {
    const res = await fetch(`${admin.url}/api/sessions/00000000-0000-0000-0000-000000000000`, {
      headers: AUTH,
    });
    expect(res.status).toBe(404);
  });

  it('menyajikan build dashboard dengan SPA fallback, tanpa path traversal', async () => {
    const index = await fetch(`${admin.url}/kontak/abc`);
    expect(await index.text()).toContain('<title>NEXA</title>');
    const asset = await fetch(`${admin.url}/assets/app.js`);
    expect(asset.headers.get('content-type')).toContain('javascript');
    const traversal = await fetch(`${admin.url}/..%2f..%2fpackage.json`);
    expect(await traversal.text()).not.toContain('"name"');
  });
});

describe('API admin: SSE realtime', () => {
  it('mengirim overview saat terhubung lalu event baru tanpa reload', async () => {
    const controller = new AbortController();
    const res = await fetch(`${admin.url}/api/stream`, {
      headers: AUTH,
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const seen: string[] = [];

    const readUntil = async (predicate: () => boolean) => {
      while (!predicate()) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf('\n\n');
        while (idx >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const type = block.match(/^event: (.+)$/m)?.[1];
          const data = block.match(/^data: (.+)$/m)?.[1];
          if (type && data) {
            StreamMessageSchema.parse({ type, data: JSON.parse(data) });
            seen.push(type);
          }
          idx = buffer.indexOf('\n\n');
        }
      }
    };

    await readUntil(() => seen.includes('overview'));
    await (
      await fetch(`${pub.url}/arsip-internal/a-0001/b-0002/c-0003`, { headers: AGENT })
    ).text();
    await readUntil(
      () => seen.includes('event') && seen.filter((t) => t === 'overview').length >= 2,
    );
    expect(seen).toContain('session');
    controller.abort();
  });
});
