// Menyajikan labirin untuk sesi yang dibelokkan + mencatat event & reward bandit.
// Jalur ini deterministik/prosedural; TIDAK BOLEH meng-import intel/ (AGENTS.md §2.2).
import type { EventKind } from '@nexa/shared';
import type { Bus } from '../bus';
import type { Db } from '../db/client';
import type { SessionTracker, TrackedSession } from '../detect/tracker';
import type { Logger } from '../logger';
import { type DecoyHttpInput, DecoyMcp, peekRpc } from '../mcp/decoy';
import { type ArmStats, EpsilonGreedy, loadArmStats, saveArmStats } from './bandit';
import {
  ARMS,
  type ArmId,
  generateJson,
  generatePage,
  generateRobots,
  isApiPath,
  type LabyrinthPage,
  pageKey,
} from './generator';

const STATIC_ASSET = /\.(css|js|mjs|map|png|jpe?g|gif|svg|ico|webp|woff2?|ttf)$/i;
/** Batas body JSON-RPC untuk MCP umpan (byte). */
const MAX_MCP_BODY = 64 * 1024;

export interface LabyrinthConfig {
  /** Akar namespace labirin, mis. "/arsip-internal". */
  root: string;
  charsPerToken: number;
  epsilon: number;
  /** Batas atas reward per penarikan (ms). */
  maxHoldMs: number;
}

export interface LabyrinthDeps {
  db: Db;
  bus: Bus;
  tracker: SessionTracker;
  logger: Logger;
  config: LabyrinthConfig;
  random?: () => number;
}

export interface ServeInput {
  session: TrackedSession;
  method: string;
  pathAndQuery: string;
  ts: number;
  /** true bila request ini adalah hit honeylink yang menjebak sesi. */
  honeylinkHit: boolean;
  /** Teks tambahan opsional yang disisipkan ke halaman (dipakai interrogate/). */
  decorate?: (page: LabyrinthPage, session: TrackedSession) => LabyrinthPage;
}

export interface ServedPage {
  response: Response;
  page: LabyrinthPage;
}

export interface ServeStaticInput extends ServeInput {
  /** Halaman non-generator (mis. endpoint kalibrasi interogasi). */
  body: string;
  contentType: string;
  status: number;
  kind: EventKind;
  meta: Record<string, unknown>;
}

export interface ServeMcpInput extends ServeInput {
  /** Request MCP: header asli + body hasil inspeksi canary. */
  http: DecoyHttpInput;
}

export interface ServedMcp {
  response: Response;
  /** Konten umpan yang disajikan tool (0 untuk handshake/daftar tool). */
  pages: LabyrinthPage[];
}

export function estimateTokens(chars: number, charsPerToken: number): number {
  return Math.ceil(chars / charsPerToken);
}

function isArm(kind: string): kind is ArmId {
  return (ARMS as readonly string[]).includes(kind);
}

export class LabyrinthService {
  readonly bandit: EpsilonGreedy;
  /** sessionId -> (kunci halaman -> arm) agar kunjungan ulang konsisten. */
  private readonly memo = new Map<string, Map<string, ArmId>>();
  /** sessionId -> umpan terakhir yang menunggu reward. */
  private readonly pending = new Map<string, { arm: ArmId; servedAt: number }>();
  private readonly decoy: DecoyMcp;

  constructor(private readonly deps: LabyrinthDeps) {
    this.bandit = new EpsilonGreedy(
      ARMS,
      { epsilon: deps.config.epsilon, ...(deps.random ? { random: deps.random } : {}) },
      loadArmStats(deps.db),
    );
    this.decoy = new DecoyMcp({
      maxBodyBytes: MAX_MCP_BODY,
      onError: (err) => deps.logger.debug('decoy mcp rejected', { reason: err.message }),
    });
    deps.bus.on('session:closed', (row) => this.finalize(row.id));
  }

  /** Tutup handler MCP umpan (stream yang masih terbuka dihentikan). */
  close(): Promise<void> {
    return this.decoy.close();
  }

  armStats(): ArmStats[] {
    return this.bandit.snapshot();
  }

  /** Arm yang dipakai untuk (sesi, halaman); dipilih bandit pada kunjungan pertama. */
  armFor(sessionId: string, key: string): ArmId {
    let perSession = this.memo.get(sessionId);
    if (!perSession) {
      perSession = new Map();
      this.memo.set(sessionId, perSession);
    }
    const existing = perSession.get(key);
    if (existing) return existing;
    const chosen = this.bandit.select() as ArmId;
    perSession.set(key, chosen);
    return chosen;
  }

  serve(input: ServeInput): ServedPage {
    const started = performance.now();
    const { session, ts } = input;
    const { config, tracker } = this.deps;
    this.settle(session.id, ts);

    let page = this.render(session, input.pathAndQuery);
    if (input.decorate) page = input.decorate(page, session);

    const chars = page.body.length;
    const estTokens = page.status === 200 ? estimateTokens(chars, config.charsPerToken) : 0;
    tracker.recordEvent(session.id, {
      kind: input.honeylinkHit ? 'honeylink_hit' : page.status === 200 ? 'bait_served' : 'request',
      ts,
      method: input.method,
      path: input.pathAndQuery,
      status: page.status,
      charsServed: page.status === 200 ? chars : 0,
      estTokens,
      latencyMs: performance.now() - started,
      meta: {
        arm: page.kind,
        depth: page.depth,
        links: page.links.length,
        canaries: page.canaries.map((c) => c.kind),
        ...(page.interrogation ? { interrogation: page.interrogation } : {}),
      },
    });
    if (page.status === 200) tracker.noteDepth(session.id, page.depth);
    if (isArm(page.kind)) this.pending.set(session.id, { arm: page.kind, servedAt: ts });

    const response = new Response(input.method === 'HEAD' ? null : page.body, {
      status: page.status,
      headers: { 'content-type': page.contentType, 'cache-control': 'no-store' },
    });
    return { response, page };
  }

  /**
   * Endpoint MCP umpan (bagian labirin). Tool memakai arm tetap, jadi tidak ikut reward
   * bandit; reward umpan sebelumnya tetap diselesaikan. Respons JSON dihitung karakternya
   * untuk estimasi token penyerang, sama seperti halaman labirin.
   */
  async serveMcp(input: ServeMcpInput): Promise<ServedMcp> {
    const started = performance.now();
    const { session, ts } = input;
    const { config, tracker } = this.deps;
    this.settle(session.id, ts);

    const pages: LabyrinthPage[] = [];
    const raw = await this.decoy.handle(input.http, {
      session,
      root: config.root,
      ...(input.decorate ? { decorate: input.decorate } : {}),
      onServe: (_tool, page) => {
        pages.push(page);
      },
    });

    // Respons dibaca utuh untuk dihitung (JSON, atau SSE legacy yang langsung ditutup);
    // hanya stream langganan (subscriptions/listen) yang dibiarkan mengalir.
    const { rpc, tool } = peekRpc(input.http.body);
    let response = raw;
    let chars = 0;
    if (raw.body && rpc !== 'subscriptions/listen') {
      const text = await raw.text();
      chars = text.length;
      const headers = new Headers(raw.headers);
      headers.set('cache-control', 'no-store');
      response = new Response(text, { status: raw.status, headers });
    }
    const ok = response.status >= 200 && response.status < 300;
    const first = pages[0];
    tracker.recordEvent(session.id, {
      kind: input.honeylinkHit ? 'honeylink_hit' : first ? 'bait_served' : 'request',
      ts,
      method: input.method,
      path: input.pathAndQuery,
      status: response.status,
      charsServed: ok ? chars : 0,
      estTokens: ok ? estimateTokens(chars, config.charsPerToken) : 0,
      latencyMs: performance.now() - started,
      meta: {
        channel: 'mcp',
        mcp: rpc,
        tool,
        ...(first ? { arm: first.kind, depth: first.depth } : {}),
        canaries: pages.flatMap((p) => p.canaries.map((c) => c.kind)),
        ...(first?.interrogation ? { interrogation: first.interrogation } : {}),
      },
    });
    for (const p of pages) tracker.noteDepth(session.id, p.depth);
    return { response, pages };
  }

  /** Respons non-generator di dalam labirin, dicatat seperti umpan (estimasi token). */
  serveStatic(input: ServeStaticInput): Response {
    const started = performance.now();
    const { session, ts } = input;
    const { config, tracker } = this.deps;
    this.settle(session.id, ts);
    const ok = input.status >= 200 && input.status < 300;
    const chars = ok ? input.body.length : 0;
    tracker.recordEvent(session.id, {
      kind: input.kind,
      ts,
      method: input.method,
      path: input.pathAndQuery,
      status: input.status,
      charsServed: chars,
      estTokens: estimateTokens(chars, config.charsPerToken),
      latencyMs: performance.now() - started,
      meta: input.meta,
    });
    return new Response(input.method === 'HEAD' ? null : input.body, {
      status: input.status,
      headers: { 'content-type': input.contentType, 'cache-control': 'no-store' },
    });
  }

  private render(session: TrackedSession, pathAndQuery: string): LabyrinthPage {
    const { root } = this.deps.config;
    const seed = session.labyrinthSeed;
    const key = pageKey(pathAndQuery);
    const pathname = key.split('?')[0] ?? '/';
    if (pathname === '/robots.txt') return generateRobots({ seed, root });
    if (STATIC_ASSET.test(pathname)) {
      return {
        kind: 'robots',
        key,
        depth: 0,
        status: 404,
        contentType: 'text/plain; charset=utf-8',
        title: 'Not Found',
        body: 'Not Found\n',
        links: [],
        canaries: [],
      };
    }
    if (isApiPath(key)) return generateJson({ seed, path: key, root });
    return generatePage({ seed, path: key, root, arm: this.armFor(session.id, key) });
  }

  /** Reward untuk umpan sebelumnya = waktu sampai request berikutnya (dibatasi maxHoldMs). */
  private settle(sessionId: string, now: number): void {
    const prev = this.pending.get(sessionId);
    if (!prev) return;
    this.pending.delete(sessionId);
    this.reward(prev.arm, Math.min(Math.max(0, now - prev.servedAt), this.deps.config.maxHoldMs));
  }

  /** Sesi berakhir: umpan terakhir tidak menahan agen lebih lama -> reward 0. */
  private finalize(sessionId: string): void {
    const prev = this.pending.get(sessionId);
    if (prev) {
      this.pending.delete(sessionId);
      this.reward(prev.arm, 0);
    }
    this.memo.delete(sessionId);
  }

  private reward(arm: ArmId, holdMs: number): void {
    const stats = this.bandit.update(arm, holdMs);
    try {
      saveArmStats(this.deps.db, stats);
    } catch (err) {
      this.deps.logger.warn('failed to persist bandit arm', { err, arm });
    }
  }
}
