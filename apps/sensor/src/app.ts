import type { Readable } from 'node:stream';
import type { HttpBindings } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { type Context, Hono } from 'hono';
import { Bus } from './bus';
import type { Config } from './config';
import type { Db } from './db/client';
import { stubDecoyResponse } from './decoy/stub';
import type { HeaderBag } from './detect/signals';
import { SessionTracker } from './detect/tracker';
import type { Logger } from './logger';
import { forwardRequest } from './proxy/forward';

export interface SensorDeps {
  config: Config;
  logger: Logger;
  db: Db;
  now?: () => number;
}

export interface Sensor {
  publicApp: Hono<{ Bindings: HttpBindings }>;
  adminApp: Hono<{ Bindings: HttpBindings }>;
  tracker: SessionTracker;
  bus: Bus;
  /** Tutup sesi idle; dipanggil berkala oleh index.ts. */
  tick: (now: number) => void;
  shutdown: () => void;
}

function headersToBag(headers: Headers): HeaderBag {
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
    const xff = c.req.header('x-forwarded-for');
    const first = xff?.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }
  try {
    return normalizeIp(getConnInfo(c).remote.address);
  } catch {
    return 'unknown';
  }
}

export function createSensor(deps: SensorDeps): Sensor {
  const { config, logger, db } = deps;
  const now = deps.now ?? Date.now;
  const bus = new Bus();
  const tracker = new SessionTracker({ db, bus, logger, config: config.detect });
  const recovered = tracker.recoverStale();
  if (recovered > 0) logger.info('stale sessions closed at startup', { count: recovered });

  // ---------------------------------------------------------------------------
  // Port publik: semua trafik masuk lewat sini. TIDAK ADA pemanggilan LLM di jalur ini.
  // ---------------------------------------------------------------------------
  const publicApp = new Hono<{ Bindings: HttpBindings }>();

  publicApp.all('*', async (c) => {
    const started = performance.now();
    const url = new URL(c.req.url);
    const pathAndQuery = `${url.pathname}${url.search}`;
    const ip = clientIp(c, config.sensor.trustProxy);
    const headers = headersToBag(c.req.raw.headers);
    const ts = now();

    const obs = tracker.observe({
      ts,
      ip,
      userAgent: headers['user-agent'] ?? '',
      method: c.req.method,
      path: pathAndQuery,
      headers,
    });

    if (obs.diverted) {
      const res = stubDecoyResponse();
      const text = await res.clone().text();
      tracker.recordEvent(obs.session.id, {
        kind: obs.isHoneylink ? 'honeylink_hit' : 'bait_served',
        ts,
        method: c.req.method,
        path: pathAndQuery,
        status: res.status,
        charsServed: text.length,
        estTokens: Math.ceil(text.length / config.labyrinth.charsPerToken),
        latencyMs: performance.now() - started,
        meta: { stub: true },
      });
      return res;
    }

    const incoming = c.env?.incoming;
    const hasBody = c.req.method !== 'GET' && c.req.method !== 'HEAD';
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

  publicApp.onError((err, c) => {
    logger.error('public handler error', { err });
    return c.json({ error: 'internal_error' }, 500);
  });

  // ---------------------------------------------------------------------------
  // Port admin: API dashboard (Fase 3). Tidak pernah dibuka di port jebakan.
  // ---------------------------------------------------------------------------
  const adminApp = new Hono<{ Bindings: HttpBindings }>();
  adminApp.get('/healthz', (c) => c.json({ ok: true }));
  adminApp.onError((err, c) => {
    logger.error('admin handler error', { err });
    return c.json({ error: 'internal_error' }, 500);
  });

  return {
    publicApp,
    adminApp,
    tracker,
    bus,
    tick: (t) => {
      tracker.sweep(t);
    },
    shutdown: () => tracker.closeAll(),
  };
}
