// Canary (FR-10, FR-11): mencatat token umpan yang disajikan dan mendeteksi pemakaiannya
// di request berikutnya, dari sesi mana pun. Deterministik, TANPA LLM (AGENTS.md §2.2).
// Pemakaian canary menandai "infrastruktur yang dipakai penyerang", bukan "C2 asli".
import { randomUUID } from 'node:crypto';
import type { CanaryKind } from '@nexa/shared';
import { eq } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db/client';
import { type CanaryRow, canaries } from '../db/schema';
import type { SessionTracker } from '../detect/tracker';
import { CANARY_TOKEN_PATTERN, type CanarySpec } from '../labyrinth/generator';
import type { Logger } from '../logger';

export interface CanaryUse {
  canary: CanaryRow;
  /** Bagian request tempat token ditemukan. */
  location: 'path' | 'header' | 'body';
}

export interface InspectRequest {
  sessionId: string;
  ip: string;
  ts: number;
  method: string;
  pathAndQuery: string;
  headers: Readonly<Record<string, string | undefined>>;
  bodyText: string | null;
}

/** Petunjuk token untuk log/UI (tidak pernah token utuh). */
export function hint(token: string): string {
  return token.length <= 12 ? '••••' : `${token.slice(0, 8)}…${token.slice(-4)}`;
}

/** Mencari semua token berpola canary dalam teks (murni). */
export function findCanaryTokens(text: string): string[] {
  return [...new Set(text.match(new RegExp(CANARY_TOKEN_PATTERN.source, 'g')) ?? [])];
}

export interface CanaryRegistryDeps {
  db: Db;
  bus: Bus;
  tracker: SessionTracker;
  logger: Logger;
}

export class CanaryRegistry {
  /** token -> baris canary (indeks O(1) untuk inspeksi setiap request). */
  private readonly byToken = new Map<string, CanaryRow>();

  constructor(private readonly deps: CanaryRegistryDeps) {
    for (const row of deps.db.select().from(canaries).all()) this.byToken.set(row.token, row);
  }

  get size(): number {
    return this.byToken.size;
  }

  /** Mencatat canary yang disajikan pada sebuah halaman labirin (sekali per token). */
  recordIssued(
    sessionId: string,
    path: string,
    specs: readonly CanarySpec[],
    ts: number,
  ): CanaryRow[] {
    const created: CanaryRow[] = [];
    for (const spec of specs) {
      if (this.byToken.has(spec.token)) continue;
      const row = this.deps.db
        .insert(canaries)
        .values({
          id: randomUUID(),
          sessionId,
          token: spec.token,
          kind: spec.kind,
          issuedAt: ts,
          issuedPath: path.slice(0, 1024),
        })
        .returning()
        .get();
      this.byToken.set(row.token, row);
      created.push(row);
      this.deps.tracker.recordEvent(sessionId, {
        kind: 'canary_issued',
        ts,
        method: 'GET',
        path,
        meta: { canaryId: row.id, canaryKind: spec.kind, tokenHint: hint(spec.token) },
      });
    }
    return created;
  }

  /**
   * Memeriksa request terhadap token canary yang pernah dikeluarkan. Dipanggil untuk SETIAP
   * request (sesi sah maupun terjebak) karena penyerang bisa memakai token dari infrastruktur lain.
   */
  inspect(req: InspectRequest): CanaryUse[] {
    if (this.byToken.size === 0) return [];
    const places: Array<[CanaryUse['location'], string]> = [['path', safeDecode(req.pathAndQuery)]];
    const headerText = Object.entries(req.headers)
      .filter(([k]) => k !== 'host' && k !== 'user-agent')
      .map(([, v]) => v ?? '')
      .join('\n');
    if (headerText) places.push(['header', headerText]);
    if (req.bodyText) places.push(['body', safeDecode(req.bodyText)]);

    const uses: CanaryUse[] = [];
    const seen = new Set<string>();
    for (const [location, text] of places) {
      for (const token of findCanaryTokens(text)) {
        const row = this.byToken.get(token);
        if (!row || seen.has(row.id)) continue;
        seen.add(row.id);
        uses.push({ canary: this.markTriggered(row, req), location });
      }
    }
    return uses;
  }

  private markTriggered(row: CanaryRow, req: InspectRequest): CanaryRow {
    const first = row.triggeredAt === null;
    const updated = this.deps.db
      .update(canaries)
      .set({
        triggeredAt: row.triggeredAt ?? req.ts,
        triggerIp: row.triggerIp ?? req.ip,
        triggerSessionId: row.triggerSessionId ?? req.sessionId,
        triggerCount: row.triggerCount + 1,
      })
      .where(eq(canaries.id, row.id))
      .returning()
      .get();
    this.byToken.set(updated.token, updated);
    const meta = {
      canaryId: updated.id,
      canaryKind: updated.kind as CanaryKind,
      tokenHint: hint(updated.token),
      issuedSessionId: updated.sessionId,
      triggerIp: req.ip,
      crossSession: updated.sessionId !== req.sessionId,
      label: 'infrastruktur yang dipakai penyerang',
    };
    this.deps.tracker.recordEvent(req.sessionId, {
      kind: 'canary_triggered',
      ts: req.ts,
      method: req.method,
      path: req.pathAndQuery,
      meta,
    });
    if (updated.sessionId !== req.sessionId) {
      // Juga tampil di linimasa sesi penerima canary.
      this.deps.tracker.recordEvent(updated.sessionId, {
        kind: 'canary_triggered',
        ts: req.ts,
        method: req.method,
        path: req.pathAndQuery,
        meta,
      });
    }
    if (first) {
      this.deps.logger.warn('canary triggered', {
        canaryId: updated.id,
        kind: updated.kind,
        tokenHint: hint(updated.token),
        issuedSession: updated.sessionId,
        triggerSession: req.sessionId,
        triggerIp: req.ip,
      });
    }
    this.deps.bus.emit('canary:triggered', {
      canaryId: updated.id,
      sessionId: updated.sessionId,
      triggerSessionId: req.sessionId,
    });
    return updated;
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}
