import { eq } from 'drizzle-orm';
import { createTargetApp } from 'target-app';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSensor, type Sensor } from '../src/app';
import type { DbHandle } from '../src/db/client';
import { events, sessions } from '../src/db/schema';
import { silentLogger } from '../src/logger';
import { BROWSER_HEADERS, type Listening, listen, testConfig, testDb } from './helpers';

let target: Listening;
let sensorServer: Listening;
let sensor: Sensor;
let dbh: DbHandle;
let upstreamHits = 0;

beforeAll(async () => {
  const app = createTargetApp();
  target = await listen((req) => {
    upstreamHits += 1;
    return app.fetch(req);
  });
  dbh = testDb();
  sensor = createSensor({ config: testConfig(target.url), logger: silentLogger, db: dbh.db });
  sensorServer = await listen(sensor.publicApp.fetch as never);
});

afterAll(async () => {
  await sensorServer.close();
  await target.close();
  dbh.close();
});

interface Snapshot {
  status: number;
  contentType: string | null;
  contentLength: string | null;
  body: Buffer;
}

async function snapshot(url: string, init?: RequestInit): Promise<Snapshot> {
  const res = await fetch(url, { redirect: 'manual', ...init });
  return {
    status: res.status,
    contentType: res.headers.get('content-type'),
    contentLength: res.headers.get('content-length'),
    body: Buffer.from(await res.arrayBuffer()),
  };
}

describe('proxy: trafik sah diteruskan tanpa perubahan (FR-1)', () => {
  const paths = [
    '/',
    '/pengumuman',
    '/dokumen',
    '/dokumen/sop-piket',
    '/kontak',
    '/api/status',
    '/api/pengumuman',
    '/robots.txt',
    '/static/style.css',
    '/tidak-ada',
    '/dokumen/tidak-ada?ref=1',
  ];

  it.each(paths)('GET %s identik dengan akses langsung', async (path) => {
    const direct = await snapshot(`${target.url}${path}`, { headers: BROWSER_HEADERS });
    const proxied = await snapshot(`${sensorServer.url}${path}`, { headers: BROWSER_HEADERS });
    expect(proxied.status).toBe(direct.status);
    expect(proxied.contentType).toBe(direct.contentType);
    expect(proxied.contentLength).toBe(direct.contentLength);
    expect(Buffer.compare(proxied.body, direct.body)).toBe(0);
  });

  it('POST dengan body diteruskan apa adanya', async () => {
    const init = {
      method: 'POST',
      headers: { ...BROWSER_HEADERS, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'username=a&password=b',
    };
    const direct = await snapshot(`${target.url}/login`, init);
    const proxied = await snapshot(`${sensorServer.url}/login`, init);
    expect(proxied.status).toBe(401);
    expect(proxied.status).toBe(direct.status);
    expect(Buffer.compare(proxied.body, direct.body)).toBe(0);
  });

  it('sesi browser tetap legit setelah banyak request', () => {
    const rows = dbh.db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.classification).toBe('legit');
    expect(rows[0]?.status).toBe('active');
  });
});

describe('deteksi: honeylink membuat sesi suspect/agent (FR-2, FR-4)', () => {
  const AGENT_UA = { 'user-agent': 'python-httpx/0.28.1', accept: '*/*' };

  it('akses honeylink oleh klien non-browser -> agent, trapped, tercatat di DB', async () => {
    const before = upstreamHits;
    const res = await fetch(`${sensorServer.url}/arsip-internal/`, { headers: AGENT_UA });
    expect(res.status).toBe(200);
    await res.text();
    // Honeylink tidak pernah diteruskan ke server asli.
    expect(upstreamHits).toBe(before);

    const rows = dbh.db
      .select()
      .from(sessions)
      .where(eq(sessions.userAgent, 'python-httpx/0.28.1'))
      .all();
    expect(rows).toHaveLength(1);
    const s = rows[0];
    expect(s?.classification).toBe('agent');
    expect(s?.status).toBe('trapped');
    expect(s?.score).toBeGreaterThanOrEqual(0.85);
    expect(s?.reasons).toContain('honeylink');

    const evs = dbh.db
      .select()
      .from(events)
      .where(eq(events.sessionId, s?.id ?? ''))
      .all();
    expect(evs.map((e) => e.kind)).toContain('honeylink_hit');
  });

  it('sesi terjebak tidak lagi menyentuh server asli', async () => {
    const before = upstreamHits;
    const res = await fetch(`${sensorServer.url}/`, { headers: AGENT_UA });
    await res.text();
    expect(upstreamHits).toBe(before);
  });

  it('honeylink dengan UA browser -> suspect', async () => {
    const ua = { ...BROWSER_HEADERS, 'user-agent': `${BROWSER_HEADERS['user-agent']} Edg/140` };
    await (await fetch(`${sensorServer.url}/arsip-internal/laporan`, { headers: ua })).text();
    const row = dbh.db
      .select()
      .from(sessions)
      .where(eq(sessions.userAgent, ua['user-agent']))
      .get();
    expect(row?.classification).toBe('suspect');
    expect(row?.status).toBe('trapped');
  });

  it('pengguna sah lain tetap dilayani server asli', async () => {
    const before = upstreamHits;
    const res = await fetch(`${sensorServer.url}/`, { headers: BROWSER_HEADERS });
    expect(res.status).toBe(200);
    await res.text();
    expect(upstreamHits).toBe(before + 1);
  });

  it('sesi idle ditutup oleh sweep', () => {
    const closed = sensor.tracker.sweep(Date.now() + 10 * 60_000);
    expect(closed.length).toBeGreaterThanOrEqual(3);
    const open = dbh.db
      .select()
      .from(sessions)
      .all()
      .filter((r) => r.status !== 'exited');
    expect(open).toHaveLength(0);
  });
});
