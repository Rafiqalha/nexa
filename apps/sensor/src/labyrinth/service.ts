// Menyajikan labirin untuk sesi yang dibelokkan + mencatat event & reward bandit.
// Jalur ini deterministik/prosedural; TIDAK BOLEH meng-import intel/ (AGENTS.md §2.2).
import type { Bus } from '../bus';
import type { Db } from '../db/client';
import type { SessionTracker, TrackedSession } from '../detect/tracker';
import type { Logger } from '../logger';
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

  constructor(private readonly deps: LabyrinthDeps) {
    this.bandit = new EpsilonGreedy(
      ARMS,
      { epsilon: deps.config.epsilon, ...(deps.random ? { random: deps.random } : {}) },
      loadArmStats(deps.db),
    );
    deps.bus.on('session:closed', (row) => this.finalize(row.id));
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
