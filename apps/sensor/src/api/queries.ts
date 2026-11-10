// Query baca untuk API dashboard. Semua keluaran dibentuk sesuai skema di @nexa/shared.
import {
  type Canary,
  type Intel,
  LAB_LABEL,
  type Overview,
  OverviewSchema,
  type Rule,
  type SessionDetail,
  SessionDetailSchema,
  type SessionSummary,
  type TimelineEvent,
} from '@nexa/shared';
import { and, asc, desc, eq, inArray, isNotNull, ne, type SQL, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  type CanaryRow,
  canaries,
  type EventRow,
  events,
  type IntelRow,
  intel,
  llmBudget,
  type RuleRow,
  rules,
  type SessionRow,
  sessions,
} from '../db/schema';
import { idrPerMTok, nexaPricingModel, type Pricing, tokensToIdr } from './pricing';

const MAX_TIMELINE = 2_000;

export function eventToApi(row: EventRow): TimelineEvent {
  return {
    id: row.id,
    sessionId: row.sessionId,
    ts: row.ts,
    kind: row.kind,
    method: row.method,
    path: row.path,
    status: row.status,
    charsServed: row.charsServed,
    estTokens: row.estTokens,
    latencyMs: row.latencyMs,
    meta: row.meta,
  };
}

export function ruleToApi(row: RuleRow): Rule {
  return {
    id: row.id,
    sessionId: row.sessionId,
    kind: row.kind,
    source: row.source,
    title: row.title,
    body: row.body,
    syntaxValid: row.syntaxValid,
    validationOutput: row.validationOutput,
    validatedAt: row.validatedAt,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
    deployedAt: row.deployedAt,
    deployError: row.deployError,
    createdAt: row.createdAt,
  };
}

export function intelToApi(row: IntelRow): Intel {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status,
    source: row.source,
    summary: row.summary,
    suspectedModel: row.suspectedModel,
    confidence: row.confidence,
    capturedPrompt: row.capturedPrompt,
    patterns: row.patterns,
    tokensUsed: row.tokensUsed,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Token canary tidak pernah dikirim utuh ke dashboard; cukup petunjuk untuk korelasi. */
export function tokenHint(token: string): string {
  return token.length <= 12 ? '••••' : `${token.slice(0, 8)}…${token.slice(-4)}`;
}

export function canaryToApi(row: CanaryRow): Canary {
  return {
    id: row.id,
    sessionId: row.sessionId,
    kind: row.kind,
    tokenHint: tokenHint(row.token),
    issuedAt: row.issuedAt,
    issuedPath: row.issuedPath,
    triggeredAt: row.triggeredAt,
    triggerIp: row.triggerIp,
    triggerSessionId: row.triggerSessionId,
    triggerCount: row.triggerCount,
  };
}

/** Ringkasan sesi + agregat event & canary (satu query agregat per tabel). */
export function toSessionSummaries(db: Db, rows: readonly SessionRow[]): SessionSummary[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const evAgg = db
    .select({
      sessionId: events.sessionId,
      bait: sql<number>`sum(case when ${events.kind} in ('bait_served','honeylink_hit') then 1 else 0 end)`,
      tokens: sql<number>`coalesce(sum(${events.estTokens}), 0)`,
    })
    .from(events)
    .where(inArray(events.sessionId, ids))
    .groupBy(events.sessionId)
    .all();
  const caAgg = db
    .select({
      sessionId: canaries.sessionId,
      issued: sql<number>`count(*)`,
      triggered: sql<number>`sum(case when ${canaries.triggeredAt} is not null then 1 else 0 end)`,
    })
    .from(canaries)
    .where(inArray(canaries.sessionId, ids))
    .groupBy(canaries.sessionId)
    .all();
  const ev = new Map(evAgg.map((a) => [a.sessionId, a]));
  const ca = new Map(caAgg.map((a) => [a.sessionId, a]));
  return rows.map((r) => ({
    id: r.id,
    sourceIp: r.sourceIp,
    userAgent: r.userAgent,
    classification: r.classification,
    status: r.status,
    score: r.score,
    reasons: r.reasons,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    trappedAt: r.trappedAt,
    endedAt: r.endedAt,
    requestCount: r.requestCount,
    maxDepth: r.maxDepth,
    baitServed: Number(ev.get(r.id)?.bait ?? 0),
    estTokens: Number(ev.get(r.id)?.tokens ?? 0),
    holdSeconds: r.trappedAt ? Math.max(0, Math.round((r.lastSeenAt - r.trappedAt) / 100) / 10) : 0,
    canariesIssued: Number(ca.get(r.id)?.issued ?? 0),
    canariesTriggered: Number(ca.get(r.id)?.triggered ?? 0),
  }));
}

export interface SessionListOptions {
  limit?: number;
  /** true = hanya sesi suspect/agent (kontak). */
  flagged?: boolean;
}

export function listSessions(db: Db, opts: SessionListOptions = {}): SessionSummary[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 500);
  const where: SQL | undefined = opts.flagged ? ne(sessions.classification, 'legit') : undefined;
  const rows = db
    .select()
    .from(sessions)
    .where(where)
    .orderBy(desc(sessions.lastSeenAt))
    .limit(limit)
    .all();
  return toSessionSummaries(db, rows);
}

export function sessionSummary(db: Db, id: string): SessionSummary | null {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  return row ? (toSessionSummaries(db, [row])[0] ?? null) : null;
}

export function sessionDetail(db: Db, id: string): SessionDetail | null {
  const summary = sessionSummary(db, id);
  if (!summary) return null;
  const evs = db
    .select()
    .from(events)
    .where(eq(events.sessionId, id))
    .orderBy(asc(events.ts), asc(events.id))
    .limit(MAX_TIMELINE)
    .all();
  const cans = db
    .select()
    .from(canaries)
    .where(eq(canaries.sessionId, id))
    .orderBy(asc(canaries.issuedAt))
    .all();
  const rs = db.select().from(rules).where(eq(rules.sessionId, id)).orderBy(asc(rules.id)).all();
  const it = db
    .select()
    .from(intel)
    .where(eq(intel.sessionId, id))
    .orderBy(desc(intel.updatedAt))
    .limit(1)
    .get();
  return SessionDetailSchema.parse({
    session: summary,
    events: evs.map(eventToApi),
    canaries: cans.map(canaryToApi),
    rules: rs.map(ruleToApi),
    intel: it ? intelToApi(it) : null,
  });
}

export function listRules(db: Db, limit = 200): Rule[] {
  return db.select().from(rules).orderBy(desc(rules.id)).limit(limit).all().map(ruleToApi);
}

export interface OverviewContext {
  pricing: Pricing;
  charsPerToken: number;
  llmBaseUrl: string;
  llmModel: string;
  startedAt: number;
  upstreamHost: string;
  now?: number;
}

export function computeOverview(db: Db, ctx: OverviewContext): Overview {
  const attackerTokens = Number(
    db
      .select({ t: sql<number>`coalesce(sum(${events.estTokens}), 0)` })
      .from(events)
      .get()?.t ?? 0,
  );
  const nexaTokens = Number(
    db
      .select({ t: sql<number>`coalesce(sum(${llmBudget.tokensUsed}), 0)` })
      .from(llmBudget)
      .get()?.t ?? 0,
  );
  const trapped = db
    .select({
      n: sql<number>`count(*)`,
      avgHold: sql<number>`coalesce(avg((${sessions.lastSeenAt} - ${sessions.trappedAt}) / 1000.0), 0)`,
      maxDepth: sql<number>`coalesce(max(${sessions.maxDepth}), 0)`,
    })
    .from(sessions)
    .where(isNotNull(sessions.trappedAt))
    .get();
  const pendingRows = db
    .select()
    .from(rules)
    .where(eq(rules.status, 'draft'))
    .orderBy(desc(rules.createdAt))
    .all();

  const attackerModel = ctx.pricing.attackerAssumedModel;
  const attackerPrice = idrPerMTok(ctx.pricing, attackerModel);
  const nexaModel = nexaPricingModel(ctx.llmBaseUrl, ctx.llmModel);
  const nexaPrice = idrPerMTok(ctx.pricing, nexaModel);

  return OverviewSchema.parse({
    label: LAB_LABEL,
    generatedAt: ctx.now ?? Date.now(),
    sensor: { startedAt: ctx.startedAt, upstreamHost: ctx.upstreamHost },
    cost: {
      attackerTokens,
      attackerIdr: tokensToIdr(attackerTokens, attackerPrice),
      nexaTokens,
      nexaIdr: tokensToIdr(nexaTokens, nexaPrice),
      attackerModel,
      attackerPriceIdrPerMTok: attackerPrice,
      nexaModel,
      nexaPriceIdrPerMTok: nexaPrice,
      charsPerToken: ctx.charsPerToken,
      pricingNote: `Estimasi: ${ctx.pricing.basis}; kurs Rp ${ctx.pricing.usdToIdr.toLocaleString('id-ID')}/USD (${ctx.pricing.usdToIdrNote}); sumber ${ctx.pricing.source} (${ctx.pricing.retrievedAt}).`,
    },
    summary: {
      trappedSessions: Number(trapped?.n ?? 0),
      avgHoldSeconds: Math.round(Number(trapped?.avgHold ?? 0) * 10) / 10,
      maxDepth: Number(trapped?.maxDepth ?? 0),
      rulesPending: pendingRows.length,
    },
    contacts: listSessions(db, { limit: 8, flagged: true }),
    pendingRules: pendingRows.slice(0, 5).map(ruleToApi),
  });
}

/** Ringkas: sesi aktif yang bukan sah (untuk penghitung di header). */
export function activeFlaggedCount(db: Db): number {
  return Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(sessions)
      .where(and(ne(sessions.status, 'exited'), ne(sessions.classification, 'legit')))
      .get()?.n ?? 0,
  );
}
