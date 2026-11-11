// Regresi F-10 (docs/hardening-followup.md): inspeksi canary pada sesi sah tidak boleh
// bergantung pada Content-Length. Body chunked dan body di atas batas tetap diperiksa bagian
// awalnya, dan body asli tetap diteruskan utuh ke upstream.
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSensor, type Sensor } from '../src/app';
import type { DbHandle } from '../src/db/client';
import { canaries, events, sessions } from '../src/db/schema';
import { silentLogger } from '../src/logger';
import { MAX_INSPECT_BODY } from '../src/public/handler';
import { BROWSER_HEADERS, type Listening, listen, testConfig, testDb } from './helpers';

interface Received {
  body: Buffer;
  contentLength: string | null;
  transferEncoding: string | null;
}

let upstream: Listening;
let pub: Listening;
let sensor: Sensor;
let dbh: DbHandle;
let clock = 1_800_000_000_000;
const received: Received[] = [];

const AGENT = { 'user-agent': 'python-httpx/0.28.1', accept: '*/*' };
// Token berpola canary (CANARY_TOKEN_PATTERN), didaftarkan langsung ke registry.
const TOKEN_CHUNKED = 'B7pw-0123456789abcdef';
const TOKEN_BIG_CHUNKED = 'B7pw-fedcba9876543210';
const TOKEN_BIG_LENGTH = `bayu7_svc_${'ab'.repeat(16)}`;

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** POST mentah lewat node:http agar framing body (chunked atau Content-Length) terkendali. */
function post(
  path: string,
  headers: Record<string, string>,
  chunks: readonly Buffer[],
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(`${pub.url}${path}`, { method: 'POST', headers }, (res) => {
      const parts: Buffer[] = [];
      res.on('data', (chunk: Buffer) => parts.push(chunk));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(parts).toString('utf8') }),
      );
      res.on('error', reject);
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

function legitSessionId(): string {
  const row = dbh.db
    .select()
    .from(sessions)
    .where(eq(sessions.userAgent, BROWSER_HEADERS['user-agent']))
    .get();
  return row?.id ?? '';
}

/** Canary sudah dipakai oleh sesi sah (bukan sesi penerima), dan tercatat di linimasanya. */
function expectTriggeredByLegit(token: string): void {
  const legit = legitSessionId();
  expect(legit).not.toBe('');
  const row = dbh.db.select().from(canaries).where(eq(canaries.token, token)).get();
  expect(row?.triggeredAt).toBe(clock);
  expect(row?.triggerSessionId).toBe(legit);
  expect(row?.sessionId).not.toBe(legit);
  const hits = dbh.db
    .select()
    .from(events)
    .where(and(eq(events.sessionId, legit), eq(events.kind, 'canary_triggered')))
    .all()
    .filter((e) => e.meta?.canaryId === row?.id);
  expect(hits).toHaveLength(1);
}

beforeAll(async () => {
  upstream = await listen(async (req) => {
    const body = Buffer.from(await req.arrayBuffer());
    received.push({
      body,
      contentLength: req.headers.get('content-length'),
      transferEncoding: req.headers.get('transfer-encoding'),
    });
    return Response.json({ bytes: body.length, sha256: sha256(body) });
  });
  dbh = testDb();
  sensor = createSensor({
    config: testConfig(upstream.url),
    logger: silentLogger,
    db: dbh.db,
    now: () => clock,
  });
  pub = await listen(sensor.publicApp.fetch as never);

  // Sesi agen yang menerima canary di labirin (canaries.session_id wajib menunjuk sesi nyata).
  await (await fetch(`${pub.url}/arsip-internal/`, { headers: AGENT })).text();
  const issuer = dbh.db
    .select()
    .from(sessions)
    .where(eq(sessions.userAgent, AGENT['user-agent']))
    .get();
  expect(issuer?.status).toBe('trapped');
  sensor.canaries.recordIssued(
    issuer?.id ?? '',
    '/arsip-internal/kredensial',
    [
      { kind: 'credential', token: TOKEN_CHUNKED },
      { kind: 'credential', token: TOKEN_BIG_CHUNKED },
      { kind: 'api_key', token: TOKEN_BIG_LENGTH },
    ],
    clock,
  );
});

afterAll(async () => {
  sensor.shutdown();
  await pub.close();
  await upstream.close();
  dbh.close();
});

describe('canary di body sesi sah (F-10)', () => {
  it('body chunked tanpa Content-Length: canary terdeteksi, body diteruskan utuh', async () => {
    clock += 3_000;
    // Token sengaja terbelah di dua chunk HTTP.
    const chunks = [
      Buffer.from('username=svc_x&password=B7pw-01234567'),
      Buffer.from('89abcdef&ingat=1'),
    ];
    const sent = Buffer.concat(chunks);
    const before = received.length;
    const res = await post(
      '/login',
      {
        ...BROWSER_HEADERS,
        'content-type': 'application/x-www-form-urlencoded',
        'transfer-encoding': 'chunked',
      },
      chunks,
    );
    expect(res.status).toBe(200);
    expect(received).toHaveLength(before + 1);
    const got = received.at(-1);
    expect(got?.body.toString('utf8')).toBe(sent.toString('utf8'));
    expect(got?.contentLength).toBeNull();
    expect(got?.transferEncoding).toBe('chunked');
    expectTriggeredByLegit(TOKEN_CHUNKED);
  });

  it('body chunked di atas batas: proxy tidak gagal, awal body tetap diperiksa', async () => {
    clock += 3_000;
    const filler = Array.from({ length: 16 }, (_, i) => Buffer.alloc(16 * 1024, 0x61 + i));
    const chunks = [Buffer.from(`password=${TOKEN_BIG_CHUNKED}&lampiran=`), ...filler];
    const sent = Buffer.concat(chunks);
    expect(sent.length).toBeGreaterThan(MAX_INSPECT_BODY * 4);
    const res = await post(
      '/unggah',
      {
        ...BROWSER_HEADERS,
        'content-type': 'application/x-www-form-urlencoded',
        'transfer-encoding': 'chunked',
      },
      chunks,
    );
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ bytes: sent.length, sha256: sha256(sent) });
    const got = received.at(-1);
    expect(got?.body.length).toBe(sent.length);
    expect(got && sha256(got.body)).toBe(sha256(sent));
    expectTriggeredByLegit(TOKEN_BIG_CHUNKED);
  });

  it('body ber-Content-Length di atas batas juga diperiksa bagian awalnya', async () => {
    clock += 3_000;
    const sent = Buffer.concat([
      Buffer.from(`{"kunci":"${TOKEN_BIG_LENGTH}","isi":"`),
      Buffer.alloc(MAX_INSPECT_BODY * 2, 0x7a),
      Buffer.from('"}'),
    ]);
    const res = await post(
      '/api/impor',
      {
        ...BROWSER_HEADERS,
        'content-type': 'application/json',
        'content-length': String(sent.length),
      },
      [sent],
    );
    expect(res.status).toBe(200);
    const got = received.at(-1);
    expect(got?.contentLength).toBe(String(sent.length));
    expect(got?.transferEncoding).toBeNull();
    expect(got && sha256(got.body)).toBe(sha256(sent));
    expectTriggeredByLegit(TOKEN_BIG_LENGTH);
  });

  it('sesi pengirim tetap sah dan semua request sampai ke upstream', () => {
    const legit = dbh.db.select().from(sessions).where(eq(sessions.id, legitSessionId())).get();
    expect(legit?.classification).toBe('legit');
    expect(received).toHaveLength(3);
  });
});
