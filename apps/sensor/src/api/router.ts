// API dashboard (port admin): REST + SSE, wajib token. Tidak pernah dipasang di port jebakan.
import type { HttpBindings } from '@hono/node-server';
import type { Overview } from '@nexa/shared';
import { RuleListSchema, SessionListSchema, type StreamMessage } from '@nexa/shared';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Db } from '../db/client';
import type { Logger } from '../logger';
import { clientIp } from '../public/handler';
import { requireToken } from './auth';
import { listRules, listSessions, sessionDetail } from './queries';
import { SECURITY_HEADERS, serveDashboardFile } from './static';
import type { StreamHub } from './stream';

export interface AdminDeps {
  db: Db;
  logger: Logger;
  token: string;
  hub: StreamHub;
  buildOverview: () => Overview;
  dashboardDist?: string;
  /** Rute tambahan dari modul lain (rules, intel) di bawah /api. */
  extend?: (api: Hono<{ Bindings: HttpBindings }>) => void;
}

const HEARTBEAT_MS = 15_000;

export function createAdminApp(deps: AdminDeps): Hono<{ Bindings: HttpBindings }> {
  const { db, logger } = deps;
  const app = new Hono<{ Bindings: HttpBindings }>();

  app.use('*', async (c, next) => {
    await next();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!c.res.headers.has(k)) c.res.headers.set(k, v);
    }
  });

  app.get('/healthz', (c) => c.json({ ok: true }));

  const api = new Hono<{ Bindings: HttpBindings }>();
  api.use(
    '*',
    requireToken(deps.token, (c) => clientIp(c, false)),
  );

  api.get('/overview', (c) => c.json(deps.buildOverview()));

  api.get('/sessions', (c) => {
    const limit = Number(c.req.query('limit') ?? 100);
    const flagged = c.req.query('flagged') === '1';
    return c.json(
      SessionListSchema.parse({
        sessions: listSessions(db, { limit: Number.isFinite(limit) ? limit : 100, flagged }),
      }),
    );
  });

  api.get('/sessions/:id', (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/.test(id)) return c.json({ error: 'not_found' }, 404);
    const detail = sessionDetail(db, id);
    return detail ? c.json(detail) : c.json({ error: 'not_found' }, 404);
  });

  api.get('/rules', (c) => c.json(RuleListSchema.parse({ rules: listRules(db) })));

  api.get('/stream', (c) =>
    streamSSE(c, async (stream) => {
      const queue: StreamMessage[] = [{ type: 'overview', data: deps.buildOverview() }];
      let wake: (() => void) | null = null;
      const unsubscribe = deps.hub.subscribe((msg) => {
        queue.push(msg);
        wake?.();
      });
      stream.onAbort(() => {
        unsubscribe();
        wake?.();
      });
      let lastBeat = Date.now();
      try {
        while (!stream.aborted) {
          while (queue.length > 0 && !stream.aborted) {
            const msg = queue.shift() as StreamMessage;
            await stream.writeSSE({ event: msg.type, data: JSON.stringify(msg.data) });
          }
          if (Date.now() - lastBeat >= HEARTBEAT_MS) {
            await stream.write(': ping\n\n');
            lastBeat = Date.now();
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            setTimeout(resolve, HEARTBEAT_MS);
          });
          wake = null;
        }
      } catch (err) {
        logger.debug('sse closed', { err });
      } finally {
        unsubscribe();
      }
    }),
  );

  deps.extend?.(api);

  api.notFound((c) => c.json({ error: 'not_found' }, 404));
  app.route('/api', api);

  // Build dashboard (opsional) disajikan dari port admin yang sama: satu origin, tanpa CORS.
  app.get('*', (c) => {
    const res = deps.dashboardDist ? serveDashboardFile(deps.dashboardDist, c.req.path) : null;
    return res ?? c.json({ error: 'not_found' }, 404);
  });

  app.onError((err, c) => {
    logger.error('admin handler error', { err });
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
