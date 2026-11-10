// Jalur request publik (semua trafik masuk, termasuk penyerang).
// ATURAN: modul ini dan semua yang di-import-nya TIDAK BOLEH memanggil LLM
// (AGENTS.md §2.2). Test regresi `no-llm-in-request-path.test.ts` menjaganya.
import { Readable } from 'node:stream';
import type { HttpBindings } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { type Context, Hono } from 'hono';
import type { CanaryRegistry, CanaryUse } from '../canary/registry';
import type { Config } from '../config';
import type { HeaderBag } from '../detect/signals';
import type { SessionTracker, TrackedSession } from '../detect/tracker';
import type { Interrogation } from '../interrogate';
import { type LabyrinthPage, pageKey } from '../labyrinth/generator';
import { Rng } from '../labyrinth/prng';
import type { LabyrinthService, ServeInput } from '../labyrinth/service';
import type { Logger } from '../logger';
import { decoyMcpPath } from '../mcp/decoy';
import { forwardRequest } from '../proxy/forward';

export interface PublicDeps {
  config: Config;
  logger: Logger;
  tracker: SessionTracker;
  labyrinth: LabyrinthService;
  now: () => number;
  canaries?: CanaryRegistry;
  /** Dekorasi opsional halaman labirin (dipakai interrogate/, eksperimental). */
  decorate?: (page: LabyrinthPage, session: TrackedSession) => LabyrinthPage;
  /** Interogasi eksperimental: endpoint kalibrasi untuk menangkap balasan agen. */
  interrogation?: Interrogation;
}

/** Body request sah yang lebih kecil dari ini dibaca untuk inspeksi canary lalu diteruskan utuh. */
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

/**
 * "Fake victory": kredensial canary dipakai di sesi terjebak -> beri kesan login berhasil
 * agar agen terus menggali labirin (dan terus membakar token). Deterministik per seed.
 */
export function fakeVictory(
  page: LabyrinthPage,
  session: TrackedSession,
  root: string,
): LabyrinthPage {
  const rng = new Rng(`victory|${session.labyrinthSeed}|${page.key}`);
  const panel = `${root}/panel-admin-${rng.hex(4)}`;
  const banner = `> **Autentikasi berhasil.** Sesi layanan aktif (berlaku 8 jam). Lanjutkan ke [panel administrasi](${panel}) atau [unduh berkas konfigurasi](${root}/konfigurasi-${rng.hex(4)}).\n\n`;
  return { ...page, body: banner + page.body, links: [panel, ...page.links] };
}

async function readSmallBody(c: Context<{ Bindings: HttpBindings }>): Promise<Buffer | null> {
  const length = Number(c.req.header('content-length') ?? Number.NaN);
  if (!Number.isFinite(length) || length > MAX_INSPECT_BODY) return null;
  return Buffer.from(await c.req.raw.arrayBuffer());
}

export function createPublicApp(deps: PublicDeps): Hono<{ Bindings: HttpBindings }> {
  const { config, logger, tracker, labyrinth, now } = deps;
  const app = new Hono<{ Bindings: HttpBindings }>();
  const root = (config.detect.honeylinkPaths[0] ?? '/arsip-internal/').replace(/\/+$/, '');
  const mcpPath = decoyMcpPath(root);

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
      // Sesi terjebak: body dibaca (dibatasi) untuk inspeksi; tidak pernah diteruskan ke upstream.
      const bodyText = hasBody ? (await c.req.text()).slice(0, MAX_INSPECT_BODY) : null;
      const uses: CanaryUse[] =
        deps.canaries?.inspect({
          sessionId: obs.session.id,
          ip,
          ts,
          method: c.req.method,
          pathAndQuery,
          headers,
          bodyText,
        }) ?? [];
      const victory = uses.some(
        (u) => u.canary.kind === 'credential' || u.canary.kind === 'api_key',
      );
      const decorate = (page: LabyrinthPage, session: TrackedSession): LabyrinthPage => {
        let p = deps.decorate ? deps.decorate(page, session) : page;
        if (victory && p.status === 200) p = fakeVictory(p, session, root);
        return p;
      };
      const input: ServeInput = {
        session: obs.session,
        method: c.req.method,
        pathAndQuery,
        ts,
        honeylinkHit: obs.isHoneylink && obs.newlyTrapped,
        decorate,
      };
      const interrogation = deps.interrogation;
      if (interrogation?.enabled && pageKey(url.pathname) === interrogation.replyPath) {
        // EKSPERIMENTAL: balasan agen atas umpan kalibrasi (teks saja, tanpa LLM).
        const reply = interrogation.parseReply({
          query: url.searchParams,
          contentType: headers['content-type'] ?? '',
          bodyText,
        });
        const seed = obs.session.labyrinthSeed;
        return labyrinth.serveStatic({
          ...input,
          status: 200,
          contentType: 'text/markdown; charset=utf-8',
          body: interrogation.respond(seed, reply !== null),
          kind: reply ? 'interrogation_reply' : input.honeylinkHit ? 'honeylink_hit' : 'request',
          meta: reply
            ? {
                experimental: true,
                baitId: interrogation.variantFor(seed).id,
                fields: reply.fields,
                reply: reply.raw,
              }
            : { experimental: true, interrogation: 'petunjuk' },
        });
      }
      if (pageKey(url.pathname) === mcpPath) {
        // MCP umpan (bagian labirin): body yang sudah diinspeksi dipakai ulang.
        const served = await labyrinth.serveMcp({
          ...input,
          http: {
            url: c.req.url,
            method: c.req.method,
            headers: c.req.raw.headers,
            body: bodyText,
            signal: c.req.raw.signal,
          },
        });
        for (const page of served.pages) {
          if (page.canaries.length > 0) {
            deps.canaries?.recordIssued(obs.session.id, page.key, page.canaries, ts);
          }
        }
        return served.response;
      }
      const served = labyrinth.serve(input);
      if (served.page.canaries.length > 0) {
        deps.canaries?.recordIssued(obs.session.id, pathAndQuery, served.page.canaries, ts);
      }
      return served.response;
    }

    // Sesi sah: body kecil dibaca untuk inspeksi canary lalu diteruskan byte-per-byte.
    let body: Readable | null = null;
    let bodyText: string | null = null;
    if (hasBody) {
      const small = await readSmallBody(c);
      if (small) {
        bodyText = small.toString('utf8');
        body = Readable.from(small);
      } else {
        body = (c.env?.incoming as Readable | undefined) ?? null;
      }
    }
    deps.canaries?.inspect({
      sessionId: obs.session.id,
      ip,
      ts,
      method: c.req.method,
      pathAndQuery,
      headers,
      bodyText,
    });

    try {
      const res = await forwardRequest(
        { method: c.req.method, pathAndQuery, headers: c.req.raw.headers, body },
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
