// Jejak audit administrasi: login, perubahan pengguna/pengaturan/tagihan, keputusan aturan.
// Meta tidak boleh memuat secret (kata sandi, token, kode 2FA); pemanggil hanya mengirim
// nama field yang berubah dan nilai non-rahasia.
import type { AuditEntry } from '@nexa/shared';
import { and, desc, like, lt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { type AuditRow, auditLog } from '../db/schema';

export interface Actor {
  id: string | null;
  name: string;
}

export const SYSTEM_ACTOR: Actor = { id: null, name: 'Sistem' };

export class AuditLog {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  record(
    actor: Actor,
    action: string,
    target = '',
    ip = '',
    meta: Record<string, unknown> = {},
  ): void {
    this.db
      .insert(auditLog)
      .values({
        ts: this.now(),
        actorId: actor.id,
        actorName: actor.name.slice(0, 120),
        action,
        target: target.slice(0, 200),
        ip: ip.slice(0, 64),
        meta,
      })
      .run();
  }

  list(opts: { cursor?: number | null; action?: string | null; limit?: number } = {}): {
    entries: AuditEntry[];
    nextCursor: number | null;
  } {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const conds = [];
    if (opts.cursor) conds.push(lt(auditLog.id, opts.cursor));
    if (opts.action) conds.push(like(auditLog.action, `${opts.action.replace(/[%_]/g, '')}%`));
    const rows = this.db
      .select()
      .from(auditLog)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(desc(auditLog.id))
      .limit(limit + 1)
      .all();
    const page = rows.slice(0, limit);
    return {
      entries: page.map(auditToApi),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}

export function auditToApi(r: AuditRow): AuditEntry {
  return {
    id: r.id,
    ts: r.ts,
    actorId: r.actorId,
    actorName: r.actorName,
    action: r.action,
    target: r.target,
    ip: r.ip,
    meta: r.meta,
  };
}
