// Hub SSE: mengubah peristiwa bus menjadi pesan dashboard. Ringkasan sesi & overview
// dikumpulkan lalu dikirim berkala (throttle) agar trafik penyerang yang deras tidak
// membanjiri dashboard maupun DB.
import { type Overview, type StreamMessage, StreamMessageSchema } from '@nexa/shared';
import { eq } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db/client';
import { rules } from '../db/schema';
import type { Logger } from '../logger';
import { eventToApi, isReviewableRule, ruleToApi, sessionSummary } from './queries';

export type StreamListener = (msg: StreamMessage) => void;

export interface StreamHubDeps {
  bus: Bus;
  db: Db;
  logger: Logger;
  buildOverview: () => Overview;
  flushMs?: number;
}

export class StreamHub {
  private readonly listeners = new Set<StreamListener>();
  private readonly dirtySessions = new Set<string>();
  private overviewDirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly flushMs: number;

  constructor(private readonly deps: StreamHubDeps) {
    this.flushMs = deps.flushMs ?? 750;
    const { bus } = deps;
    bus.on('event:new', (row) => {
      this.broadcast({ type: 'event', data: eventToApi(row) });
      this.markOverview();
    });
    bus.on('session:upsert', (row) => this.markSession(row.id));
    bus.on('session:closed', (row) => this.markSession(row.id));
    bus.on('rule:changed', ({ ruleId }) => {
      const row = deps.db.select().from(rules).where(eq(rules.id, ruleId)).get();
      // Draf yang belum divalidasi suricata -T tidak dikirim ke dashboard (§2.5).
      if (row && isReviewableRule(row)) this.broadcast({ type: 'rule', data: ruleToApi(row) });
      this.markOverview();
    });
    bus.on('canary:triggered', ({ sessionId }) => this.markSession(sessionId));
    bus.on('intel:changed', ({ sessionId }) => {
      this.broadcast({ type: 'intel', data: { sessionId } });
      this.markOverview();
    });
  }

  get size(): number {
    return this.listeners.size;
  }

  subscribe(listener: StreamListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Paksa kirim semua perubahan tertunda sekarang (dipakai test). */
  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ids = [...this.dirtySessions];
    this.dirtySessions.clear();
    const sendOverview = this.overviewDirty;
    this.overviewDirty = false;
    if (this.listeners.size === 0) return;
    try {
      for (const id of ids) {
        const summary = sessionSummary(this.deps.db, id);
        if (summary) this.broadcast({ type: 'session', data: summary });
      }
      if (sendOverview) this.broadcast({ type: 'overview', data: this.deps.buildOverview() });
    } catch (err) {
      this.deps.logger.warn('stream flush failed', { err });
    }
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private markSession(id: string): void {
    this.dirtySessions.add(id);
    this.markOverview();
  }

  private markOverview(): void {
    this.overviewDirty = true;
    if (!this.timer && this.listeners.size > 0) {
      this.timer = setTimeout(() => this.flush(), this.flushMs);
    }
  }

  private broadcast(msg: StreamMessage): void {
    if (this.listeners.size === 0) return;
    const valid = StreamMessageSchema.parse(msg);
    for (const listener of this.listeners) {
      try {
        listener(valid);
      } catch {
        // listener rusak (koneksi putus) dibersihkan oleh handler SSE
      }
    }
  }
}
