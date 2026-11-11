// Regresi AGENTS.md §2.5: draf rule yang belum divalidasi `suricata -T` tidak pernah
// ditampilkan (API daftar rule, detail sesi, overview, MCP intel memakai listRules).
import { randomUUID } from 'node:crypto';
import { LAB_LABEL } from '@nexa/shared';
import { describe, expect, it } from 'vitest';
import { loadPricing } from '../src/api/pricing';
import { computeOverview, isReviewableRule, listRules, sessionDetail } from '../src/api/queries';
import { rules, sessions } from '../src/db/schema';
import { testDb } from './helpers';

function seed() {
  const handle = testDb();
  const { db } = handle;
  const sessionId = randomUUID();
  const t = 1_800_000_000_000;
  db.insert(sessions)
    .values({
      id: sessionId,
      fingerprint: 'fp',
      sourceIp: '192.0.2.10',
      userAgent: 'python-httpx/0.28.1',
      firstSeenAt: t,
      lastSeenAt: t + 1_000,
      classification: 'agent',
      score: 1,
      reasons: ['honeylink'],
      status: 'exited',
      trappedAt: t,
      labyrinthSeed: 'seedvis',
    })
    .run();
  const base = { sessionId, kind: 'honeylink', title: 'x', createdAt: t };
  const row = (body: string, extra: Partial<typeof rules.$inferInsert>) =>
    db
      .insert(rules)
      .values({ ...base, body, ...extra })
      .returning()
      .get();
  const pending = row('alert http any any -> any any (msg:"a"; sid:1;)', { syntaxValid: null });
  const valid = row('alert http any any -> any any (msg:"b"; sid:2;)', {
    syntaxValid: true,
    validatedAt: t + 2_000,
  });
  const invalid = row('alert http any any -> any any (msg:"c"; sid:3;)', {
    syntaxValid: false,
    validatedAt: t + 2_000,
  });
  return { handle, sessionId, pending, valid, invalid };
}

describe('§2.5 draf belum tervalidasi tidak ditampilkan', () => {
  it('daftar rule, detail sesi, dan overview menyembunyikan draf yang belum divalidasi', () => {
    const { handle, sessionId, pending, valid, invalid } = seed();
    try {
      const ids = listRules(handle.db).map((r) => r.id);
      expect(ids).toContain(valid.id);
      expect(ids).toContain(invalid.id);
      expect(ids).not.toContain(pending.id);

      const detail = sessionDetail(handle.db, sessionId);
      expect(detail?.rules.map((r) => r.id).sort()).toEqual([valid.id, invalid.id].sort());

      const overview = computeOverview(handle.db, {
        label: LAB_LABEL,
        pricing: loadPricing(),
        charsPerToken: 4,
        llmBaseUrl: 'https://api.deepseek.com',
        llmModel: 'deepseek-flash',
        startedAt: 0,
        upstreamHost: 'target-app:3000',
        now: 1_800_000_010_000,
      });
      expect(overview.pendingRules.map((r) => r.id)).not.toContain(pending.id);
      expect(overview.summary.rulesPending).toBe(2);
      expect(overview.summary.rulesValidating).toBe(1);
    } finally {
      handle.close();
    }
  });

  it('isReviewableRule: draf null tersembunyi; yang sudah diputuskan selalu tampil', () => {
    expect(isReviewableRule({ status: 'draft', syntaxValid: null })).toBe(false);
    expect(isReviewableRule({ status: 'draft', syntaxValid: true })).toBe(true);
    expect(isReviewableRule({ status: 'draft', syntaxValid: false })).toBe(true);
    expect(isReviewableRule({ status: 'rejected', syntaxValid: null })).toBe(true);
  });
});
