// Dua tool agen: http_request & read_response. Tidak ada kemampuan lain
// (tanpa eksekusi, tanpa pemindaian port, tanpa spoofing header) — AGENTS.md §2.8.
import { type AllowEntry, assertAllowed, TargetNotAllowedError } from './allowlist';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'HEAD']);
/** Hanya header fungsional; header yang bisa dipakai untuk penyamaran (X-Forwarded-For, dll.) ditolak. */
const ALLOWED_HEADERS = new Set(['accept', 'content-type', 'authorization']);
const MAX_BODY_CHARS = 200_000;
const PREVIEW_CHARS = 1_500;
const READ_CHUNK = 3_000;

export interface HttpRequestArgs {
  method?: string;
  url: string;
  body?: string;
  headers?: Record<string, string>;
}

export interface ReadResponseArgs {
  response_id: string;
  offset?: number;
  length?: number;
}

export interface ToolStats {
  requests: number;
  rejected: number;
  bytesReceived: number;
  visited: string[];
}

interface Stored {
  url: string;
  status: number;
  contentType: string;
  text: string;
}

export interface HttpToolsOptions {
  allow: readonly AllowEntry[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class HttpTools {
  private readonly store = new Map<string, Stored>();
  private counter = 0;
  readonly stats: ToolStats = { requests: 0, rejected: 0, bytesReceived: 0, visited: [] };
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: HttpToolsOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /** Mengirim request HTTP ke target lab. Allowlist dicek sebelum koneksi dibuat. */
  async httpRequest(args: HttpRequestArgs): Promise<Record<string, unknown>> {
    const method = (args.method ?? 'GET').toUpperCase();
    let url: URL;
    try {
      if (!ALLOWED_METHODS.has(method))
        throw new TargetNotAllowedError(`metode ${method} tidak diizinkan`);
      url = assertAllowed(args.url, this.opts.allow);
    } catch (err) {
      this.stats.rejected += 1;
      return { error: err instanceof Error ? err.message : String(err) };
    }

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(args.headers ?? {})) {
      if (ALLOWED_HEADERS.has(k.toLowerCase()))
        headers[k.toLowerCase()] = String(v).slice(0, 2_000);
    }
    this.stats.requests += 1;
    this.stats.visited.push(`${method} ${url.pathname}${url.search}`);
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: method === 'POST' ? (args.body ?? '').slice(0, 20_000) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 20_000),
      });
      const text = method === 'HEAD' ? '' : (await res.text()).slice(0, MAX_BODY_CHARS);
      this.stats.bytesReceived += text.length;
      const id = `r${++this.counter}`;
      const contentType = res.headers.get('content-type') ?? '';
      this.store.set(id, { url: url.toString(), status: res.status, contentType, text });
      const location = res.headers.get('location');
      return {
        response_id: id,
        status: res.status,
        content_type: contentType,
        length: text.length,
        ...(location ? { location } : {}),
        preview: text.slice(0, PREVIEW_CHARS),
        truncated: text.length > PREVIEW_CHARS,
      };
    } catch (err) {
      return { error: `request gagal: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** Membaca potongan teks respons yang sudah diterima. */
  readResponse(args: ReadResponseArgs): Record<string, unknown> {
    const stored = this.store.get(args.response_id);
    if (!stored) return { error: `response_id tidak dikenal: ${args.response_id}` };
    const offset = Math.max(0, Math.floor(args.offset ?? 0));
    const length = Math.min(READ_CHUNK, Math.max(1, Math.floor(args.length ?? READ_CHUNK)));
    return {
      response_id: args.response_id,
      url: stored.url,
      offset,
      total: stored.text.length,
      text: stored.text.slice(offset, offset + length),
      has_more: offset + length < stored.text.length,
    };
  }

  fullText(responseId: string): string {
    return this.store.get(responseId)?.text ?? '';
  }
}

/** Definisi tool format OpenAI-compatible (function calling). */
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'http_request',
      description:
        'Send an HTTP request to the lab target. Returns status, content type, a preview of the body and a response_id for read_response.',
      parameters: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'HEAD'] },
          url: { type: 'string', description: 'Absolute URL on the lab target.' },
          body: { type: 'string', description: 'Request body for POST (e.g. form-encoded).' },
          headers: {
            type: 'object',
            description: 'Optional headers: accept, content-type, authorization.',
            additionalProperties: { type: 'string' },
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_response',
      description: 'Read more text from a previous response, starting at offset.',
      parameters: {
        type: 'object',
        properties: {
          response_id: { type: 'string' },
          offset: { type: 'integer', minimum: 0 },
          length: { type: 'integer', minimum: 1, maximum: READ_CHUNK },
        },
        required: ['response_id'],
      },
    },
  },
] as const;
