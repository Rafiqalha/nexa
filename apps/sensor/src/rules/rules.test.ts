import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Bus } from '../bus';
import { openDb, runMigrations } from '../db/client';
import { type RuleRow, rules, sessions } from '../db/schema';
import { silentLogger } from '../logger';
import {
  ApprovalRequiredError,
  assertDeployable,
  buildRulesFile,
  deployRule,
  hasApprovalRecord,
  RULES_FILE,
} from './deploy';
import { escapeContent, safeMsg } from './escape';
import { draftRules, isPublicIp, renderRule, SID_BASE } from './generate';
import type { SuricataRunner } from './suricata';
import { parseCommand, summarizeOutput } from './suricata';

describe('escapeContent: nilai penyerang tidak bisa menyuntik opsi rule', () => {
  it('meng-hex-kan karakter khusus Suricata', () => {
    expect(escapeContent('a"b;c\\d|e:f')).toBe('a|22|b|3B|c|5C|d|7C|e|3A|f');
  });

  it('upaya injeksi menjadi literal yang aman', () => {
    const evil = 'x"; sid:1; content:"y';
    const out = escapeContent(evil);
    expect(out).not.toMatch(/[";]/);
    expect(out).toBe('x|22 3B| sid|3A|1|3B| content|3A 22|y');
  });

  it('non-ASCII & kontrol dienkode per byte UTF-8', () => {
    expect(escapeContent('é\n')).toBe('|C3 A9 0A|');
  });

  it('msg hanya berisi karakter aman', () => {
    expect(safeMsg('NEXA "evil"; sid:9')).toBe('NEXA evil sid:9');
  });
});

describe('draftRules (template, bukan LLM)', () => {
  const base = {
    sessionId: 'abcd1234-0000-0000-0000-000000000000',
    sourceIp: '172.18.0.5',
    honeylinkPaths: ['/arsip-internal/'],
    triggeredCanaries: [{ kind: 'credential', token: 'B7pw-0123456789abcdef' }],
  };

  it('honeylink + UA agen + canary yang dipakai; tanpa rule IP untuk alamat privat', () => {
    const drafts = draftRules({ ...base, userAgent: 'python-httpx/0.28.1' });
    expect(drafts.map((d) => d.kind)).toEqual(['honeylink', 'user_agent', 'canary']);
    expect(drafts.every((d) => d.template.includes('sid:{{SID}}'))).toBe(true);
    expect(drafts[0]?.template).toContain('http.uri; content:"/arsip-internal/"; startswith');
    expect(drafts[1]?.template).toContain('http.user_agent; content:"python-httpx/0.28.1"');
    expect(drafts[2]?.template).toContain('content:"B7pw-0123456789abcdef"');
  });

  it('UA browser biasa tidak dijadikan rule (hindari blokir pengguna sah)', () => {
    const drafts = draftRules({ ...base, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/140' });
    expect(drafts.map((d) => d.kind)).not.toContain('user_agent');
  });

  it('rule IP hanya untuk alamat publik dan diberi peringatan risiko', () => {
    expect(isPublicIp('172.18.0.5')).toBe(false);
    expect(isPublicIp('127.0.0.1')).toBe(false);
    expect(isPublicIp('203.0.113.9')).toBe(true);
    const drafts = draftRules({ ...base, userAgent: 'node', sourceIp: '203.0.113.9' });
    const ip = drafts.find((d) => d.kind === 'source_ip');
    expect(ip?.title).toMatch(/berisiko/);
  });

  it('SID diisi dari id rule pada rentang lokal NEXA', () => {
    expect(renderRule('x sid:{{SID}}; rev:1;', 7)).toBe(`x sid:${SID_BASE + 7}; rev:1;`);
  });
});

describe('runner Suricata', () => {
  it('parseCommand: spasi atau JSON array', () => {
    expect(parseCommand('wsl.exe -d kali -- bash /x.sh')).toEqual([
      'wsl.exe',
      '-d',
      'kali',
      '--',
      'bash',
      '/x.sh',
    ]);
    expect(parseCommand('["C:\\\\Program Files\\\\s.exe","a b"]')).toEqual([
      'C:\\Program Files\\s.exe',
      'a b',
    ]);
  });

  it('summarizeOutput menyaring baris penting', () => {
    expect(summarizeOutput('i: info\nE: detect: error parsing\nnoise')).toBe(
      'E: detect: error parsing',
    );
  });
});

// ---------------------------------------------------------------------------
// Regresi keamanan wajib (AGENTS.md §10): deploy.ts menolak rule tanpa approval.
// ---------------------------------------------------------------------------

function setup() {
  const handle = openDb(':memory:');
  runMigrations(handle.db);
  handle.db
    .insert(sessions)
    .values({
      id: 's1',
      fingerprint: 'f',
      firstSeenAt: 1,
      lastSeenAt: 2,
      sourceIp: '10.0.0.2',
      labyrinthSeed: 'x',
    })
    .run();
  const dir = mkdtempSync(join(tmpdir(), 'nexa-rules-'));
  const deployed: string[] = [];
  const runner: SuricataRunner = {
    kind: 'exec',
    validate: vi.fn(async () => ({ ok: true, output: 'ok' })),
    deploy: vi.fn(async (content: string) => {
      deployed.push(content);
      return { ok: true, output: '{"return":"OK"}' };
    }),
  };
  const insert = (over: Partial<RuleRow>) =>
    handle.db
      .insert(rules)
      .values({
        sessionId: 's1',
        kind: 'honeylink',
        title: 't',
        body: `drop http any any -> $HOME_NET any (msg:"x"; sid:${SID_BASE + 1}; rev:1;)`,
        createdAt: 1,
        syntaxValid: true,
        ...over,
      })
      .returning()
      .get();
  return { handle, dir, runner, deployed, insert };
}

describe('deploy.ts: gerbang persetujuan operator', () => {
  it.each([
    ['draf', { status: 'draft' as const }],
    ['ditolak', { status: 'rejected' as const, decidedBy: 'op', decidedAt: 5 }],
    ['approved tanpa decidedBy', { status: 'approved' as const, decidedAt: 5 }],
    ['approved tanpa decidedAt', { status: 'approved' as const, decidedBy: 'op' }],
    [
      'approved dengan decidedBy kosong',
      { status: 'approved' as const, decidedBy: '  ', decidedAt: 5 },
    ],
  ])('menolak rule %s dan tidak pernah menulis file', async (_label, over) => {
    const { handle, dir, runner, insert } = setup();
    const rule = insert(over);
    await expect(
      deployRule({ db: handle.db, runner, rulesDir: dir, logger: silentLogger }, rule.id),
    ).rejects.toBeInstanceOf(ApprovalRequiredError);
    expect(existsSync(join(dir, RULES_FILE))).toBe(false);
    expect(runner.deploy).not.toHaveBeenCalled();
  });

  it('menolak rule approved yang belum lolos suricata -T', async () => {
    const { handle, dir, runner, insert } = setup();
    const rule = insert({ status: 'approved', decidedBy: 'op', decidedAt: 5, syntaxValid: null });
    await expect(
      deployRule({ db: handle.db, runner, rulesDir: dir, logger: silentLogger }, rule.id),
    ).rejects.toThrow(/suricata -T/);
    expect(existsSync(join(dir, RULES_FILE))).toBe(false);
  });

  it('rule disetujui (siapa & kapan) -> ditulis ke folder Suricata + reload', async () => {
    const { handle, dir, runner, deployed, insert } = setup();
    const rule = insert({
      status: 'approved',
      decidedBy: 'Serma Lab',
      decidedAt: 1_800_000_000_000,
    });
    const bus = new Bus();
    const changed = vi.fn();
    bus.on('rule:changed', changed);
    const out = await deployRule(
      { db: handle.db, runner, rulesDir: dir, logger: silentLogger, bus, now: () => 9 },
      rule.id,
    );
    expect(out.status).toBe('deployed');
    expect(out.deployedAt).toBe(9);
    const file = readFileSync(join(dir, RULES_FILE), 'utf8');
    expect(file).toContain(rule.body);
    expect(file).toContain('disetujui Serma Lab');
    expect(deployed[0]).toBe(file);
    expect(changed).toHaveBeenCalledWith({ ruleId: rule.id });
  });

  it('reload gagal -> file dikembalikan, status tetap approved + deployError', async () => {
    const { handle, dir, runner, insert } = setup();
    const ok = insert({ status: 'approved', decidedBy: 'op', decidedAt: 5 });
    await deployRule({ db: handle.db, runner, rulesDir: dir, logger: silentLogger }, ok.id);
    const before = readFileSync(join(dir, RULES_FILE), 'utf8');
    const failing: SuricataRunner = {
      ...runner,
      deploy: vi.fn(async () => ({ ok: false, output: 'E: reload gagal' })),
    };
    const second = insert({
      status: 'approved',
      decidedBy: 'op',
      decidedAt: 6,
      body: `drop http any any -> $HOME_NET any (msg:"y"; sid:${SID_BASE + 2}; rev:1;)`,
    });
    const out = await deployRule(
      { db: handle.db, runner: failing, rulesDir: dir, logger: silentLogger },
      second.id,
    );
    expect(out.status).toBe('approved');
    expect(out.deployError).toContain('reload gagal');
    expect(readFileSync(join(dir, RULES_FILE), 'utf8')).toBe(before);
  });

  it('buildRulesFile menolak set yang berisi rule tanpa approval (pertahanan berlapis)', () => {
    const { insert } = setup();
    const approved = insert({ status: 'approved', decidedBy: 'op', decidedAt: 5 });
    const draft = insert({ status: 'draft' });
    expect(() => buildRulesFile([approved, draft], 1)).toThrow(ApprovalRequiredError);
    expect(hasApprovalRecord(approved)).toBe(true);
    expect(() => assertDeployable(draft)).toThrow(ApprovalRequiredError);
  });
});
