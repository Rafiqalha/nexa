// Jalur request publik (semua trafik masuk, termasuk penyerang).
// ATURAN: modul ini dan semua yang di-import-nya TIDAK BOLEH memanggil LLM
// (AGENTS.md §2.2). Test regresi `no-llm-in-request-path.test.ts` menjaganya.
import type { Readable } from 'node:stream';
import type { HttpBindings } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { type Context, Hono } from 'hono';
import type { Config } from '../config';
import type { HeaderBag } from '../detect/signals';
import type { SessionTracker } from '../detect/tracker';
import type { LabyrinthService, ServeInput } from '../labyrinth/service';
import type { Logger } from '../logger';
import { forwardRequest } from '../proxy/forward';

export interface PublicDeps {
  config: Config;
  logger: Logger;
  tracker: SessionTracker;
  labyrinth: LabyrinthService;
  now: () => number;
  /** Hook opsional sebelum labirin menyajikan halaman (canary, interogasi). */
  beforeServe?: (c: Context<{ Bindings: HttpBindings }>, input: ServeInput) => ServeInput;
  /** Hook opsional untuk setiap request (mis. deteksi pemakaian canary). Tidak boleh lambat. */
  inspect?: (req: InspectInput) => void;
}

export interface InspectInput {
  sessionId: string;
  ip: string;
  ts: number;
  method: string;
  pathAndQuery: string;
  headers: HeaderBag;
  /** Body teks (dibatasi) untuk request non-GET, bila tersedia. */
  bodyText: string | null;
}

const MAX_INSPECT_BODY = 64 * 1024;

export function headersToBag(headers: Headers): HeaderBag {
  const bag: Record<string, string> = {};
  headers.forEach((value, key) => {
    bag[key.toLowerCase()] = value;
  });
  return bag;
}

function normalizeIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

export function clientIp(c: Context<{ Bindings: HttpBindings }>, trustProxy: boolean): string {
  if (trustProxy) {
    const first = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }
  try {
    return normalizeIp(getConnInfo(c).remote.address);
  } catch {
    return 'unknown';
  }
}

export function createPublicApp(deps: PublicDeps): Hono<{ Bindings: HttpBindings }> {
  const { config, logger, tracker, labyrinth, now } = deps;
  const app = new Hono<{ Bindings: HttpBindings }>();

  app.all('*', async (c) => {
    const started = performance.now();
    const url = new URL(c.req.url);
    const pathAndQuery = `${url.pathname}${url.search}`;
    const ip = clientIp(c, config.sensor.trustProxy);
    const headers = headersToBag(c.req.raw.headers);
    const ts = now();
    const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD';

    const obs = tracker.observe({
      ts,
      ip,
      userAgent: headers['user-agent'] ?? '',
      method: c.req.method,
      path: pathAndQuery,
      headers,
    });

    if (obs.diverted) {
      // Body sesi terjebak dibaca (dibatasi) untuk inspeksi; tidak pernah diteruskan ke upstream.
      const bodyText = hasBody ? (await c.req.text()).slice(0, MAX_INSPECT_BODY) : null;
      deps.inspect?.({
        sessionId: obs.session.id,
        ip,
        ts,
        method: c.req.method,
        pathAndQuery,
        headers,
        bodyText,
      });
      let input: ServeInput = {
        session: obs.session,
        method: c.req.method,
        pathAndQuery,
        ts,
        honeylinkHit: obs.isHoneylink && obs.newlyTrapped,
      };
      if (deps.beforeServe) input = deps.beforeServe(c, input);
      return labyrinth.serve(input).response;
    }

    deps.inspect?.({
      sessionId: obs.session.id,
      ip,
      ts,
      method: c.req.method,
      pathAndQuery,
      headers,
      bodyText: null,
    });
    const incoming = c.env?.incoming;
    try {
      const res = await forwardRequest(
        {
          method: c.req.method,
          pathAndQuery,
          headers: c.req.raw.headers,
          body: hasBody ? ((incoming as Readable | undefined) ?? null) : null,
        },
        config.sensor.upstreamUrl,
        { clientIp: ip, proto: url.protocol.replace(':', ''), originalHost: headers.host },
      );
      tracker.recordEvent(obs.session.id, {
        kind: 'request',
        ts,
        method: c.req.method,
        path: pathAndQuery,
        status: res.status,
        latencyMs: performance.now() - started,
      });
      return res;
    } catch (err) {
      logger.warn('upstream error', { err, path: url.pathname });
      tracker.recordEvent(obs.session.id, {
        kind: 'request',
        ts,
        method: c.req.method,
        path: pathAndQuery,
        status: 502,
        latencyMs: performance.now() - started,
      });
      return c.json({ error: 'bad_gateway' }, 502);
    }
  });

  app.onError((err, c) => {
    logger.error('public handler error', { err });
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
