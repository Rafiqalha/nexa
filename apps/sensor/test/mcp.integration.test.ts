// Fase 5B: MCP umpan (bagian labirin, port publik) dan MCP intel baca-saja (port admin),
// diuji dengan klien MCP resmi (@modelcontextprotocol/client v2).
import { request as httpRequest } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { eq } from 'drizzle-orm';
import { createTargetApp } from 'target-app';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSensor, type Sensor } from '../src/app';
import type { DbHandle } from '../src/db/client';
import { canaries, events, intel, rules, sessions } from '../src/db/schema';
import { CANARY_TOKEN_PATTERN } from '../src/labyrinth/generator';
import { silentLogger } from '../src/logger';
import { DECOY_TOOL_NAMES } from '../src/mcp/decoy';
import { INTEL_TOOL_NAMES } from '../src/mcp/intel';
import type { SuricataRunner } from '../src/rules/suricata';
import { type Listening, listen, TEST_TOKEN, testConfig, testDb } from './helpers';

let target: Listening;
let pub: Listening;
let admin: Listening;
let sensor: Sensor;
let dbh: DbHandle;
let clock = 1_800_000_000_000;

const runner: SuricataRunner = {
  kind: 'none',
  validate: async () => ({ ok: true, output: 'ok' }),
  deploy: async () => ({ ok: true, output: 'ok' }),
};

const AUTH = { authorization: `Bearer ${TEST_TOKEN}` };
const clients: Client[] = [];

async function connect(url: string, headers?: Record<string, string>): Promise<Client> {
  const client = new Client({ name: 'nexa-test', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    headers ? { requestInit: { headers } } : undefined,
  );
  await client.connect(transport);
  clients.push(client);
  return client;
}

function textOf(result: { content?: unknown }): string {
  const content = Array.isArray(result.content) ? result.content : [];
  return content
    .map((c: { type?: string; text?: string }) => (c.type === 'text' ? (c.text ?? '') : ''))
    .join('\n');
}

function rawPost(port: number, path: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'POST', headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
  });
}

beforeAll(async () => {
  target = await listen(createTargetApp().fetch);
  dbh = testDb();
  sensor = createSensor({
    config: testConfig(target.url, { LABYRINTH_FIXED_SEED: 'seedmcp00001' }),
    logger: silentLogger,
    db: dbh.db,
    now: () => {
      clock += 1_500;
      return clock;
    },
    suricata: runner,
  });
  pub = await listen(sensor.publicApp.fetch as never);
  admin = await listen(sensor.adminApp.fetch as never);
});

afterAll(async () => {
  for (const c of clients) await c.close().catch(() => {});
  sensor.shutdown();
  await pub.close();
  await admin.close();
  await target.close();
  dbh.close();
});

describe('MCP umpan di labirin (FR-18)', () => {
  let decoy: Client;
  let credText = '';

  it('footer halaman labirin mengiklankan endpoint MCP umpan', async () => {
    const res = await fetch(`${pub.url}/arsip-internal/`, {
      headers: { 'user-agent': 'python-httpx/0.28.1', accept: '*/*' },
    });
    expect(await res.text()).toContain('`/arsip-internal/mcp`');
  });

  it('klien MCP bisa listTools di endpoint umpan', async () => {
    decoy = await connect(`${pub.url}/arsip-internal/mcp`);
    const { tools } = await decoy.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...DECOY_TOOL_NAMES].sort());
  });

  it('ambil_kredensial hanya mengembalikan konten fiktif + canary unik', async () => {
    const res = await decoy.callTool({
      name: 'ambil_kredensial',
      arguments: { layanan: 'VPN Markas' },
    });
    credText = textOf(res);
    expect(res.isError).not.toBe(true);
    expect(credText.match(CANARY_TOKEN_PATTERN)?.length ?? 0).toBeGreaterThan(0);
    // Alamat di konten umpan hanya dari blok dokumentasi (TEST-NET) / domain .test.
    for (const ip of credText.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? []) {
      expect(ip).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);
    }
  });

  it('deterministik per seed: argumen sama -> konten sama', async () => {
    const again = await decoy.callTool({
      name: 'ambil_kredensial',
      arguments: { layanan: 'VPN Markas' },
    });
    expect(textOf(again)).toBe(credText);
  });

  it('panggilan tool tercatat sebagai umpan, canary terdaftar, sesi terjebak', () => {
    const db = dbh.db;
    const mcpEvents = db
      .select()
      .from(events)
      .all()
      .filter((e) => (e.meta as Record<string, unknown> | null)?.channel === 'mcp');
    expect(mcpEvents.length).toBeGreaterThanOrEqual(3);
    const bait = mcpEvents.filter(
      (e) =>
        e.kind === 'bait_served' && (e.meta as Record<string, unknown>).tool === 'ambil_kredensial',
    );
    expect(bait.length).toBe(2);
    expect(bait[0]?.estTokens ?? 0).toBeGreaterThan(0);
    expect((bait[0]?.meta as Record<string, unknown> | undefined)?.arm).toBe('credentials');

    const sessionId = bait[0]?.sessionId ?? '';
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(session?.status).toBe('trapped');

    const issued = db.select().from(canaries).where(eq(canaries.sessionId, sessionId)).all();
    const fromMcp = issued.filter((c) => c.issuedPath.startsWith('/arsip-internal/mcp/'));
    expect(fromMcp.length).toBeGreaterThan(0);
    for (const c of fromMcp) expect(credText).toContain(c.token);
  });

  it('memakai kredensial umpan memicu canary (tercatat sebagai pemakaian)', async () => {
    const token = credText.match(CANARY_TOKEN_PATTERN)?.[0] ?? '';
    await decoy.callTool({ name: 'cari_dokumen', arguments: { kueri: `login ${token}` } });
    const row = dbh.db.select().from(canaries).where(eq(canaries.token, token)).get();
    expect(row?.triggeredAt).not.toBeNull();
  });
});

describe('MCP intel baca-saja (FR-19)', () => {
  let intelClient: Client;
  const url = () => `${admin.url}/api/mcp`;

  it('tanpa token -> 401', async () => {
    const res = await fetch(url(), {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(401);
  });

  it('Host/Origin asing ditolak (DNS rebinding) walau token benar', async () => {
    const base = {
      ...AUTH,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    expect(await rawPost(admin.port, '/api/mcp', { ...base, host: 'evil.example' })).toBe(403);
    expect(
      await rawPost(admin.port, '/api/mcp', {
        ...base,
        host: `127.0.0.1:${admin.port}`,
        origin: 'https://evil.example',
      }),
    ).toBe(403);
  });

  it('klien MCP bisa listTools: hanya tool baca-saja, tanpa tulis/deploy', async () => {
    intelClient = await connect(url(), AUTH);
    const { tools } = await intelClient.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...INTEL_TOOL_NAMES].sort());
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(t.name).not.toMatch(
        /setuju|tolak|deploy|approve|reject|hapus|delete|tulis|write|ubah|update|create|buat/i,
      );
    }
  });

  it('daftar_sesi dan intel_sesi memberi data sesi terjebak tanpa token canary utuh', async () => {
    const list = JSON.parse(
      textOf(await intelClient.callTool({ name: 'daftar_sesi', arguments: {} })),
    ) as { label: string; sesi: { id: string; status: string; canariesTriggered: number }[] };
    expect(list.label).toBe('Data simulasi lab');
    const trapped = list.sesi.find((s) => s.status === 'trapped' && s.canariesTriggered > 0);
    expect(trapped).toBeDefined();

    const detailText = textOf(
      await intelClient.callTool({
        name: 'intel_sesi',
        arguments: { session_id: trapped?.id ?? '' },
      }),
    );
    const detail = JSON.parse(detailText) as {
      sesi: { id: string };
      canary: { diberikan: number; dipakai: { tokenHint: string }[] };
    };
    expect(detail.sesi.id).toBe(trapped?.id);
    expect(detail.canary.diberikan).toBeGreaterThan(0);
    expect(detail.canary.dipakai.length).toBeGreaterThan(0);
    // Token canary tidak pernah keluar utuh lewat MCP intel, hanya petunjuk.
    expect(detailText.match(CANARY_TOKEN_PATTERN)).toBeNull();
  });

  it('intel_sesi untuk sesi tak dikenal -> isError', async () => {
    const res = await intelClient.callTool({
      name: 'intel_sesi',
      arguments: { session_id: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.isError).toBe(true);
  });

  it('tool intel tidak mengubah DB; tool tulis tidak ada', async () => {
    const snapshot = () =>
      JSON.stringify({
        rules: dbh.db.select().from(rules).all(),
        intel: dbh.db.select().from(intel).all(),
        sessions: dbh.db.select().from(sessions).all(),
      });
    const before = snapshot();
    await intelClient.callTool({ name: 'draf_aturan', arguments: { status: 'semua' } });
    await intelClient.callTool({ name: 'daftar_sesi', arguments: { termasuk_sah: true } });
    expect(snapshot()).toBe(before);

    const outcome = await intelClient
      .callTool({ name: 'setujui_aturan', arguments: { id: 1 } })
      .then(
        (r) => r.isError === true,
        () => true,
      );
    expect(outcome).toBe(true);
  });
});
