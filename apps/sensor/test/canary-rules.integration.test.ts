// Siklus Fase 4 end-to-end (runner Suricata palsu): deteksi -> labirin -> canary ->
// draf rule (tervalidasi) -> Setujui -> deploy; Tolak -> tidak pernah ditulis.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuleSchema } from '@nexa/shared';
import { eq } from 'drizzle-orm';
import { createTargetApp } from 'target-app';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSensor, type Sensor } from '../src/app';
import type { DbHandle } from '../src/db/client';
import { canaries, events, rules, sessions } from '../src/db/schema';
import { CANARY_TOKEN_PATTERN } from '../src/labyrinth/generator';
import { silentLogger } from '../src/logger';
import { RULES_FILE } from '../src/rules/deploy';
import type { SuricataRunner } from '../src/rules/suricata';
import { type Listening, listen, TEST_TOKEN, testConfig, testDb } from './helpers';

let target: Listening;
let pub: Listening;
let admin: Listening;
let sensor: Sensor;
let dbh: DbHandle;
let rulesDir: string;
let clock = 1_800_000_000_000;
const deployedContents: string[] = [];

const runner: SuricataRunner = {
  kind: 'exec',
  // Tiru `suricata -T`: tolak rule tanpa sid numerik.
  validate: vi.fn(async (r: string) =>
    /sid:\d+;/.test(r)
      ? { ok: true, output: 'successfully loaded' }
      : { ok: false, output: 'E: sid' },
  ),
  deploy: vi.fn(async (content: string) => {
    deployedContents.push(content);
    return { ok: true, output: '{"message":"done","return":"OK"}' };
  }),
};

const AGENT = { 'user-agent': 'python-httpx/0.28.1', accept: '*/*' };
const AUTH = { authorization: `Bearer ${TEST_TOKEN}`, 'content-type': 'application/json' };

beforeAll(async () => {
  target = await listen(createTargetApp().fetch);
  dbh = testDb();
  rulesDir = mkdtempSync(join(tmpdir(), 'nexa-suricata-'));
  sensor = createSensor({
    config: testConfig(target.url, {
      SURICATA_RULES_DIR: rulesDir,
      LABYRINTH_FIXED_SEED: 'seedcanary01',
    }),
    logger: silentLogger,
    db: dbh.db,
    now: () => clock,
    suricata: runner,
  });
  pub = await listen(sensor.publicApp.fetch as never);
  admin = await listen(sensor.adminApp.fetch as never);
});

afterAll(async () => {
  sensor.shutdown();
  await pub.close();
  await admin.close();
  await target.close();
  dbh.close();
});

async function get(path: string, headers: Record<string, string> = AGENT) {
  const res = await fetch(`${pub.url}${path}`, { headers });
  clock += 3_000;
  return res.text();
}

describe('canary (FR-10, FR-11)', () => {
  let sessionId = '';
  let password = '';
  let apiKey = '';

  it('halaman kredensial & API di labirin menerbitkan canary unik per sesi', async () => {
    await get('/arsip-internal/');
    // Jelajahi beberapa halaman sampai ditemukan canary kredensial & api key.
    const queue = ['/arsip-internal/'];
    const seen = new Set<string>();
    while (queue.length > 0 && (!password || !apiKey) && seen.size < 60) {
      const path = queue.shift() as string;
      if (seen.has(path)) continue;
      seen.add(path);
      const body = await get(path);
      password ||= body.match(/password = (B7pw-[0-9a-f]{16})/)?.[1] ?? '';
      apiKey ||= body.match(/Bearer (bayu7_svc_[0-9a-f]{32})/)?.[1] ?? '';
      for (const m of body.matchAll(/\]\((\/arsip-internal\/[^)\s?]+)\)/g)) {
        if (!m[1]?.includes('/unduh/') && !m[1]?.includes('/api/')) queue.push(m[1] as string);
      }
    }
    expect(password).toMatch(/^B7pw-/);
    expect(apiKey).toMatch(/^bayu7_svc_/);
    const row = dbh.db
      .select()
      .from(sessions)
      .where(eq(sessions.userAgent, AGENT['user-agent']))
      .get();
    sessionId = row?.id ?? '';
    const issued = dbh.db.select().from(canaries).where(eq(canaries.sessionId, sessionId)).all();
    expect(issued.length).toBeGreaterThanOrEqual(2);
    expect(
      issued.every((c) => new RegExp(`^(${CANARY_TOKEN_PATTERN.source})$`).test(c.token)),
    ).toBe(true);
    const kinds = dbh.db
      .select()
      .from(events)
      .where(eq(events.sessionId, sessionId))
      .all()
      .map((e) => e.kind);
    expect(kinds).toContain('canary_issued');
  });

  it('kredensial canary dipakai -> tercatat (waktu & IP) + "fake victory"', async () => {
    const res = await fetch(`${pub.url}/login`, {
      method: 'POST',
      headers: { ...AGENT, 'content-type': 'application/x-www-form-urlencoded' },
      body: `username=svc_x&password=${password}`,
    });
    const body = await res.text();
    expect(body).toContain('Autentikasi berhasil');
    const c = dbh.db.select().from(canaries).where(eq(canaries.token, password)).get();
    expect(c?.triggeredAt).toBe(clock);
    expect(c?.triggerIp).toBe('127.0.0.1');
    const trig = dbh.db
      .select()
      .from(events)
      .where(eq(events.kind, 'canary_triggered'))
      .all()
      .find((e) => e.sessionId === sessionId);
    expect(trig?.meta).toMatchObject({
      label: 'infrastruktur yang dipakai penyerang',
      canaryKind: 'credential',
    });
    // Token tidak pernah tercatat utuh di meta.
    expect(JSON.stringify(trig?.meta)).not.toContain(password);
  });

  it('API key canary dipakai dari "infrastruktur lain" (sesi sah berbeda) tetap terdeteksi', async () => {
    clock += 1_000;
    const res = await fetch(`${pub.url}/api/status`, {
      headers: { 'user-agent': 'curl/8.9.1', authorization: `Bearer ${apiKey}` },
    });
    expect(res.status).toBe(200);
    const c = dbh.db.select().from(canaries).where(eq(canaries.token, apiKey)).get();
    expect(c?.triggeredAt).not.toBeNull();
    expect(c?.triggerSessionId).not.toBe(c?.sessionId);
  });
});

describe('rules: draf otomatis pasca-sesi + gerbang persetujuan (FR-15..17)', () => {
  it('sesi berakhir -> draf rule muncul dengan status validasi', async () => {
    sensor.tick(clock + 10 * 60_000);
    await sensor.rules.idle();
    const all = dbh.db.select().from(rules).all();
    expect(all.map((r) => r.kind)).toEqual(
      expect.arrayContaining(['honeylink', 'user_agent', 'canary']),
    );
    expect(all.every((r) => r.status === 'draft' && r.syntaxValid === true)).toBe(true);
    expect(all.every((r) => r.validatedAt !== null)).toBe(true);
    expect(runner.validate).toHaveBeenCalled();
    expect(existsSync(join(rulesDir, RULES_FILE))).toBe(false);
  });

  it('API menolak keputusan tanpa nama operator', async () => {
    const id = dbh.db.select().from(rules).all()[0]?.id;
    const res = await fetch(`${admin.url}/api/rules/${id}/approve`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ operator: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('Tolak -> rule tidak pernah ditulis ke folder Suricata', async () => {
    const ua = dbh.db.select().from(rules).where(eq(rules.kind, 'user_agent')).get();
    const res = await fetch(`${admin.url}/api/rules/${ua?.id}/reject`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ operator: 'Serma Lab' }),
    });
    const r = RuleSchema.parse(await res.json());
    expect(r.status).toBe('rejected');
    expect(r.decidedBy).toBe('Serma Lab');
    expect(r.decidedAt).toBe(clock);
    expect(existsSync(join(rulesDir, RULES_FILE))).toBe(false);
    const again = await fetch(`${admin.url}/api/rules/${ua?.id}/approve`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ operator: 'Serma Lab' }),
    });
    expect(again.status).toBe(409);
  });

  it('Setujui -> approval tercatat, rule masuk folder Suricata dan reload dipanggil', async () => {
    const hl = dbh.db.select().from(rules).where(eq(rules.kind, 'honeylink')).get();
    clock += 5_000;
    const res = await fetch(`${admin.url}/api/rules/${hl?.id}/approve`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ operator: 'Kapten Lab' }),
    });
    const r = RuleSchema.parse(await res.json());
    expect(r.status).toBe('deployed');
    expect(r.decidedBy).toBe('Kapten Lab');
    const file = readFileSync(join(rulesDir, RULES_FILE), 'utf8');
    expect(file).toContain(hl?.body);
    const rejected = dbh.db.select().from(rules).where(eq(rules.status, 'rejected')).get();
    expect(file).not.toContain(rejected?.body);
    expect(deployedContents.at(-1)).toBe(file);
  });
});
