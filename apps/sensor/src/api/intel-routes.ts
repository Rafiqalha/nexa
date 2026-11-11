// GET /api/intel: hasil intel per sesi + status budget LLM harian.
import { IntelListSchema } from '@nexa/shared';
import { desc, inArray } from 'drizzle-orm';
import type { Hono } from 'hono';
import type { Db } from '../db/client';
import { intel, sessions } from '../db/schema';
import type { DailyBudget } from '../intel/budget';
import type { AdminEnv } from './http';
import { intelToApi, toSessionSummaries } from './queries';

export function registerIntelRoutes(api: Hono<AdminEnv>, db: Db, budget: DailyBudget): void {
  api.get('/intel', (c) => {
    const rows = db.select().from(intel).orderBy(desc(intel.updatedAt)).limit(100).all();
    const ids = rows.map((r) => r.sessionId);
    const sess =
      ids.length > 0 ? db.select().from(sessions).where(inArray(sessions.id, ids)).all() : [];
    const summaries = new Map(toSessionSummaries(db, sess).map((s) => [s.id, s]));
    const items = rows.flatMap((r) => {
      const session = summaries.get(r.sessionId);
      return session ? [{ intel: intelToApi(r), session }] : [];
    });
    return c.json(IntelListSchema.parse({ items, budget: budget.status() }));
  });
}
