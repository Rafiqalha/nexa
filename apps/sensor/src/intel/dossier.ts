// Dosir sesi untuk intel: HANYA data dari sesi di dalam jebakan (event sesi itu sendiri),
// tidak pernah log server asli. Diserialisasi lalu disamarkan sebelum keluar.
import { and, asc, eq, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { canaries, events, type SessionRow, sessions } from '../db/schema';
import { analyzeTiming } from '../detect/timing';
import { type RedactedText, Redactor } from './redact';

const MAX_STEPS = 80;

export interface Dossier {
  session: {
    userAgent: string;
    classification: string;
    score: number;
    reasons: string[];
    requestCount: number;
    maxDepth: number;
    heldSeconds: number;
    medianIntervalSeconds: number | null;
    sourceIp: string;
  };
  steps: Array<{
    t: number;
    method: string;
    path: string;
    kind: string;
    arm?: string;
    status?: number | null;
  }>;
  canaries: Array<{ kind: string; used: boolean; crossSession: boolean; triggerIp: string | null }>;
  interrogation: Array<{ baitId: string; reply: string }>;
  truncatedSteps: number;
}

export function buildDossier(db: Db, sessionId: string): Dossier | null {
  const s: SessionRow | undefined = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  if (!s) return null;
  const evs = db
    .select()
    .from(events)
    .where(eq(events.sessionId, sessionId))
    .orderBy(asc(events.ts), asc(events.id))
    .all();
  const docTs = evs
    .filter((e) => e.kind !== 'canary_issued' && e.kind !== 'canary_triggered')
    .map((e) => e.ts);
  const timing = analyzeTiming(docTs);
  const t0 = evs[0]?.ts ?? s.firstSeenAt;
  const steps = evs
    .filter((e) => e.kind === 'request' || e.kind === 'bait_served' || e.kind === 'honeylink_hit')
    .map((e) => ({
      t: Math.round((e.ts - t0) / 100) / 10,
      method: e.method,
      path: e.path.slice(0, 200),
      kind: e.kind,
      ...(typeof e.meta.arm === 'string' ? { arm: e.meta.arm } : {}),
      status: e.status,
    }));
  const cans = db
    .select()
    .from(canaries)
    .where(or(eq(canaries.sessionId, sessionId), eq(canaries.triggerSessionId, sessionId)))
    .all();
  const replies = db
    .select()
    .from(events)
    .where(and(eq(events.sessionId, sessionId), eq(events.kind, 'interrogation_reply')))
    .all()
    .map((e) => ({
      baitId: String(e.meta.baitId ?? ''),
      reply: String(e.meta.reply ?? '').slice(0, 600),
    }));
  return {
    session: {
      userAgent: s.userAgent,
      classification: s.classification,
      score: s.score,
      reasons: s.reasons,
      requestCount: s.requestCount,
      maxDepth: s.maxDepth,
      heldSeconds: s.trappedAt ? Math.round((s.lastSeenAt - s.trappedAt) / 1000) : 0,
      medianIntervalSeconds:
        timing.medianIntervalMs === null ? null : Math.round(timing.medianIntervalMs / 100) / 10,
      sourceIp: s.sourceIp,
    },
    steps: steps.slice(0, MAX_STEPS),
    canaries: cans.map((c) => ({
      kind: c.kind,
      used: c.triggeredAt !== null,
      crossSession: c.triggerSessionId !== null && c.triggerSessionId !== c.sessionId,
      triggerIp: c.triggerIp,
    })),
    interrogation: replies,
    truncatedSteps: Math.max(0, steps.length - MAX_STEPS),
  };
}

/** Serialisasi dosir + redaksi. Satu-satunya bentuk dosir yang boleh dikirim ke model. */
export function redactDossier(
  d: Dossier,
  extraHosts?: readonly string[],
): { text: RedactedText; stats: Record<string, number> } {
  const redactor = new Redactor(extraHosts);
  const text = redactor.redact(JSON.stringify(d));
  return { text, stats: redactor.stats() };
}
