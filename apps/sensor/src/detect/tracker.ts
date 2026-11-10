import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Classification, EventKind, SessionStatus } from '@nexa/shared';
import { and, eq, ne } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { type EventRow, events, type SessionRow, sessions } from '../db/schema';
import type { Logger } from '../logger';
import { escalate, type ScoreReason, scoreSession } from './score';
import {
  type HeaderBag,
  isAutomationUserAgent,
  isDocumentRequest,
  isHoneylinkPath,
  lacksBrowserHeaders,
} from './signals';
import { analyzeTiming } from './timing';

/** Jumlah timestamp request dokumen terakhir yang disimpan per sesi. */
const TIMING_WINDOW = 20;
const MAX_PATH_LEN = 2048;

export interface ObserveInput {
  ts: number;
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  headers: HeaderBag;
}

/** State sesi di memori (sumber kebenaran untuk sesi aktif; DB untuk riwayat). */
export interface TrackedSession {
  id: string;
  fingerprint: string;
  firstSeenAt: number;
  lastSeenAt: number;
  ip: string;
  userAgent: string;
  labyrinthSeed: string;
  docTimestamps: number[];
  honeylinkHits: number;
  automationUa: boolean;
  missingBrowserHeaders: boolean;
  classification: Classification;
  score: number;
  status: SessionStatus;
  reasons: ScoreReason[];
  requestCount: number;
  maxDepth: number;
  trappedAt: number | null;
}

export interface ObserveResult {
  session: TrackedSession;
  /** true bila sesi harus dibelokkan ke labirin (suspect/agent). */
  diverted: boolean;
  isHoneylink: boolean;
  /** true pada request yang membuat sesi pertama kali terjebak. */
  newlyTrapped: boolean;
}

export interface RecordEventInput {
  kind: EventKind;
  ts: number;
  method?: string;
  path: string;
  status?: number | null;
  charsServed?: number;
  estTokens?: number;
  latencyMs?: number;
  meta?: Record<string, unknown>;
}

export interface TrackerDeps {
  db: Db;
  bus: Bus;
  logger: Logger;
  config: Config['detect'];
  /** Pembuat seed labirin per sesi (default acak; seed tetap untuk replay/debug). */
  newSeed?: () => string;
}

export function fingerprintOf(ip: string, userAgent: string): string {
  return createHash('sha256').update(`${ip}\n${userAgent}`).digest('hex').slice(0, 32);
}

export class SessionTracker {
  private readonly active = new Map<string, TrackedSession>();
  private readonly byId = new Map<string, TrackedSession>();

  constructor(private readonly deps: TrackerDeps) {}

  /** Sesi yang tersimpan "aktif" di DB dari proses sebelumnya ditutup saat start. */
  recoverStale(): number {
    const { db } = this.deps;
    const stale = db.select().from(sessions).where(ne(sessions.status, 'exited')).all();
    for (const row of stale) {
      db.update(sessions)
        .set({ status: 'exited', endedAt: row.lastSeenAt })
        .where(eq(sessions.id, row.id))
        .run();
    }
    return stale.length;
  }

  get(sessionId: string): TrackedSession | undefined {
    return this.byId.get(sessionId);
  }

  activeSessions(): TrackedSession[] {
    return [...this.byId.values()];
  }

  observe(input: ObserveInput): ObserveResult {
    const { config } = this.deps;
    const fingerprint = fingerprintOf(input.ip, input.userAgent);

    let session = this.active.get(fingerprint);
    if (session && input.ts - session.lastSeenAt > config.sessionIdleTimeoutMs) {
      this.close(session, session.lastSeenAt);
      session = undefined;
    }
    if (!session) session = this.open(fingerprint, input);

    const honeylink = isHoneylinkPath(input.path, config.honeylinkPaths);
    session.lastSeenAt = input.ts;
    session.requestCount += 1;
    if (honeylink) session.honeylinkHits += 1;
    if (isDocumentRequest(input.path, input.headers)) {
      session.docTimestamps.push(input.ts);
      if (session.docTimestamps.length > TIMING_WINDOW) session.docTimestamps.shift();
      if (lacksBrowserHeaders(input.headers)) session.missingBrowserHeaders = true;
    }

    const result = scoreSession(
      {
        honeylinkHits: session.honeylinkHits,
        automationUa: session.automationUa,
        missingBrowserHeaders: session.missingBrowserHeaders,
        timing: analyzeTiming(session.docTimestamps),
      },
      {
        suspectThreshold: config.suspectThreshold,
        agentThreshold: config.agentThreshold,
        timingFastMs: config.timingFastMs,
      },
    );
    session.score = Math.max(session.score, result.score);
    session.reasons = [...new Set([...session.reasons, ...result.reasons])];
    session.classification = escalate(session.classification, result.classification);

    const diverted = session.classification !== 'legit';
    let newlyTrapped = false;
    if (diverted && session.status !== 'trapped') {
      session.status = 'trapped';
      session.trappedAt = input.ts;
      newlyTrapped = true;
      this.deps.logger.info('session trapped', {
        sessionId: session.id,
        classification: session.classification,
        score: session.score,
        reasons: session.reasons,
      });
    }

    this.persist(session);
    return { session, diverted, isHoneylink: honeylink, newlyTrapped };
  }

  /** Mencatat event setelah respons diketahui (status, karakter, latensi). */
  recordEvent(sessionId: string, e: RecordEventInput): EventRow {
    const row = this.deps.db
      .insert(events)
      .values({
        sessionId,
        ts: e.ts,
        kind: e.kind,
        method: e.method ?? 'GET',
        path: e.path.slice(0, MAX_PATH_LEN),
        status: e.status ?? null,
        charsServed: e.charsServed ?? 0,
        estTokens: e.estTokens ?? 0,
        latencyMs: Math.max(0, Math.round(e.latencyMs ?? 0)),
        meta: e.meta ?? {},
      })
      .returning()
      .get();
    this.deps.bus.emit('event:new', row);
    return row;
  }

  /** Memperbarui kedalaman labirin maksimum yang dicapai sesi. */
  noteDepth(sessionId: string, depth: number): void {
    const s = this.byId.get(sessionId);
    if (!s || depth <= s.maxDepth) return;
    s.maxDepth = depth;
    this.persist(s);
  }

  /** Menutup sesi yang idle melebihi timeout. Mengembalikan sesi yang ditutup. */
  sweep(now: number): TrackedSession[] {
    const closed: TrackedSession[] = [];
    for (const s of this.active.values()) {
      if (now - s.lastSeenAt > this.deps.config.sessionIdleTimeoutMs) {
        this.close(s, s.lastSeenAt);
        closed.push(s);
      }
    }
    return closed;
  }

  /** Menutup semua sesi aktif (dipakai saat shutdown). */
  closeAll(): void {
    for (const s of [...this.active.values()]) this.close(s, s.lastSeenAt);
  }

  private open(fingerprint: string, input: ObserveInput): TrackedSession {
    const session: TrackedSession = {
      id: randomUUID(),
      fingerprint,
      firstSeenAt: input.ts,
      lastSeenAt: input.ts,
      ip: input.ip,
      userAgent: input.userAgent.slice(0, 512),
      labyrinthSeed: this.deps.newSeed?.() ?? randomBytes(8).toString('hex'),
      docTimestamps: [],
      honeylinkHits: 0,
      automationUa: isAutomationUserAgent(input.userAgent),
      missingBrowserHeaders: false,
      classification: 'legit',
      score: 0,
      status: 'active',
      reasons: [],
      requestCount: 0,
      maxDepth: 0,
      trappedAt: null,
    };
    this.deps.db
      .insert(sessions)
      .values({
        id: session.id,
        fingerprint,
        firstSeenAt: session.firstSeenAt,
        lastSeenAt: session.lastSeenAt,
        sourceIp: session.ip,
        userAgent: session.userAgent,
        labyrinthSeed: session.labyrinthSeed,
      })
      .run();
    this.active.set(fingerprint, session);
    this.byId.set(session.id, session);
    return session;
  }

  private close(session: TrackedSession, endedAt: number): void {
    session.status = 'exited';
    this.active.delete(session.fingerprint);
    this.byId.delete(session.id);
    const row = this.deps.db
      .update(sessions)
      .set({ status: 'exited', endedAt })
      .where(and(eq(sessions.id, session.id), ne(sessions.status, 'exited')))
      .returning()
      .get();
    if (row) {
      this.deps.logger.info('session closed', {
        sessionId: row.id,
        classification: row.classification,
        requests: row.requestCount,
        maxDepth: row.maxDepth,
      });
      this.deps.bus.emit('session:closed', row);
    }
  }

  private persist(session: TrackedSession): void {
    const row: SessionRow | undefined = this.deps.db
      .update(sessions)
      .set({
        lastSeenAt: session.lastSeenAt,
        classification: session.classification,
        score: session.score,
        status: session.status,
        reasons: session.reasons,
        requestCount: session.requestCount,
        maxDepth: session.maxDepth,
        trappedAt: session.trappedAt,
      })
      .where(eq(sessions.id, session.id))
      .returning()
      .get();
    if (row) this.deps.bus.emit('session:upsert', row);
  }
}
