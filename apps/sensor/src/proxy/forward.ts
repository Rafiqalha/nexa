import { request as httpRequest, type IncomingMessage, type OutgoingHttpHeaders } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';

/**
 * Meneruskan request sah ke upstream TANPA mengubah respons (FR-1).
 * Memakai node:http mentah (bukan fetch) agar body tidak didekompresi atau diubah:
 * byte yang diterima klien sama persis dengan akses langsung ke upstream.
 */

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

const UPSTREAM_TIMEOUT_MS = 30_000;

export interface ForwardInput {
  method: string;
  /** pathname + search dari request asli. */
  pathAndQuery: string;
  headers: Headers;
  /** Stream body request asli (null untuk GET/HEAD). */
  body: Readable | null;
}

export interface ForwardContext {
  clientIp: string;
  proto: string;
  originalHost: string | undefined;
}

export class UpstreamError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UpstreamError';
  }
}

function connectionTokens(headers: Headers): Set<string> {
  return new Set(
    (headers.get('connection') ?? '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function buildUpstreamHeaders(
  src: Headers,
  upstream: URL,
  ctx: ForwardContext,
): OutgoingHttpHeaders {
  const drop = connectionTokens(src);
  const out: OutgoingHttpHeaders = {};
  src.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'host' || HOP_BY_HOP.has(k) || drop.has(k)) return;
    out[k] = value;
  });
  out.host = upstream.host;
  const prior = src.get('x-forwarded-for');
  out['x-forwarded-for'] = prior ? `${prior}, ${ctx.clientIp}` : ctx.clientIp;
  out['x-forwarded-proto'] = ctx.proto;
  if (ctx.originalHost) out['x-forwarded-host'] = ctx.originalHost;
  return out;
}

export function buildResponseHeaders(res: IncomingMessage): Headers {
  const drop = new Set(
    String(res.headers.connection ?? '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );
  const out = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined || HOP_BY_HOP.has(key) || drop.has(key)) continue;
    if (Array.isArray(value)) {
      for (const v of value) out.append(key, v);
    } else {
      out.set(key, value);
    }
  }
  return out;
}

export function joinUpstreamPath(upstream: URL, pathAndQuery: string): string {
  const base = upstream.pathname.endsWith('/') ? upstream.pathname.slice(0, -1) : upstream.pathname;
  return `${base}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
}

export function forwardRequest(
  input: ForwardInput,
  upstream: URL,
  ctx: ForwardContext,
): Promise<Response> {
  const send = upstream.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise<Response>((resolve, reject) => {
    const upReq = send(
      {
        protocol: upstream.protocol,
        hostname: upstream.hostname,
        port: upstream.port || undefined,
        method: input.method,
        path: joinUpstreamPath(upstream, input.pathAndQuery),
        headers: buildUpstreamHeaders(input.headers, upstream, ctx),
      },
      (upRes) => {
        const status = upRes.statusCode ?? 502;
        const noBody = input.method === 'HEAD' || status === 204 || status === 304 || status < 200;
        if (noBody) upRes.resume();
        const body = noBody ? null : (Readable.toWeb(upRes) as ReadableStream<Uint8Array>);
        resolve(
          new Response(body, {
            status: status < 200 ? 502 : status,
            statusText: upRes.statusMessage ?? '',
            headers: buildResponseHeaders(upRes),
          }),
        );
      },
    );
    upReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
      upReq.destroy(new UpstreamError('upstream timeout'));
    });
    upReq.on('error', (err) =>
      reject(new UpstreamError('upstream request failed', { cause: err })),
    );
    if (input.body) {
      input.body.on('error', (err) => upReq.destroy(err));
      input.body.pipe(upReq);
    } else {
      upReq.end();
    }
  });
}
