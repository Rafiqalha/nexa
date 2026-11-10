// Composition root sensor: merangkai tracker, labirin, jalur publik, dan API admin.
import type { HttpBindings } from '@hono/node-server';
import type { Hono } from 'hono';
import { registerIntelRoutes } from './api/intel-routes';
import { loadPricing, type Pricing } from './api/pricing';
import { computeOverview } from './api/queries';
import { createAdminApp } from './api/router';
import { registerRuleRoutes } from './api/rules-routes';
import { StreamHub } from './api/stream';
import { Bus } from './bus';
import { CanaryRegistry } from './canary/registry';
import type { Config } from './config';
import type { Db } from './db/client';
import { SessionTracker } from './detect/tracker';
import { DailyBudget } from './intel/budget';
import { LlmClient } from './intel/llm';
import { IntelQueue } from './intel/queue';
import { LabyrinthService } from './labyrinth/service';
import type { Logger } from './logger';
import { registerIntelMcp } from './mcp/intel';
import { createPublicApp } from './public/handler';
import { RulesService } from './rules/service';
import { createRunner, type SuricataRunner } from './rules/suricata';

export interface SensorDeps {
  config: Config;
  logger: Logger;
  db: Db;
  now?: () => number;
  random?: () => number;
  pricing?: Pricing;
  /** Folder build dashboard yang disajikan port admin (opsional). */
  dashboardDist?: string;
  streamFlushMs?: number;
  /** Runner Suricata (default dari config); test menyuntikkan runner palsu. */
  suricata?: SuricataRunner;
  /** fetch untuk klien LLM (test memeriksa payload keluar tanpa jaringan). */
  llmFetch?: typeof fetch;
}

export interface Sensor {
  publicApp: Hono<{ Bindings: HttpBindings }>;
  adminApp: Hono<{ Bindings: HttpBindings }>;
  tracker: SessionTracker;
  labyrinth: LabyrinthService;
  bus: Bus;
  hub: StreamHub;
  canaries: CanaryRegistry;
  rules: RulesService;
  intel: IntelQueue;
  budget: DailyBudget;
  /** Tutup sesi idle; dipanggil berkala oleh index.ts. */
  tick: (now: number) => void;
  shutdown: () => void;
}

/** Akar namespace labirin = honeylink pertama tanpa slash akhir. */
export function labyrinthRoot(config: Config): string {
  const first = config.detect.honeylinkPaths[0] ?? '/arsip-internal/';
  return first.replace(/\/+$/, '') || '/arsip-internal';
}

export function createSensor(deps: SensorDeps): Sensor {
  const { config, logger, db } = deps;
  const now = deps.now ?? Date.now;
  const bus = new Bus();
  const fixedSeed = config.labyrinth.fixedSeed;
  if (fixedSeed)
    logger.warn('LABYRINTH_FIXED_SEED aktif: semua sesi memakai seed yang sama (debug)');
  const tracker = new SessionTracker({
    db,
    bus,
    logger,
    config: config.detect,
    ...(fixedSeed ? { newSeed: () => fixedSeed } : {}),
  });
  const recovered = tracker.recoverStale();
  if (recovered > 0) logger.info('stale sessions closed at startup', { count: recovered });

  const labyrinth = new LabyrinthService({
    db,
    bus,
    tracker,
    logger,
    config: {
      root: labyrinthRoot(config),
      charsPerToken: config.labyrinth.charsPerToken,
      epsilon: config.labyrinth.banditEpsilon,
      maxHoldMs: config.labyrinth.banditMaxHoldMs,
    },
    ...(deps.random ? { random: deps.random } : {}),
  });

  const canaries = new CanaryRegistry({ db, bus, tracker, logger });
  const publicApp = createPublicApp({ config, logger, tracker, labyrinth, canaries, now });

  // Herd immunity: draf rule pasca-sesi, validasi suricata -T, deploy hanya dengan approval.
  const runner = deps.suricata ?? createRunner(config.rules);
  logger.info('suricata runner', { runner: runner.kind });
  const rulesService = new RulesService({
    db,
    bus,
    logger,
    runner,
    rulesDir: config.rules.dir,
    honeylinkPaths: config.detect.honeylinkPaths,
    now,
  });

  // Intel LLM PASCA-SESI: antrean + redaksi + budget harian. Tidak pernah di jalur request.
  const budget = new DailyBudget(db, config.llm.dailyTokenBudget, now);
  const llm = new LlmClient(
    { baseUrl: config.llm.baseUrl, model: config.llm.model, apiKey: config.llm.apiKey },
    { budget, logger, ...(deps.llmFetch ? { fetch: deps.llmFetch } : {}) },
  );
  logger.info('intel llm', { enabled: llm.enabled, model: llm.model || null });
  const intelQueue = new IntelQueue({
    db,
    bus,
    logger,
    llm,
    budget,
    rules: rulesService,
    internalHosts: [
      'localhost',
      'target-app',
      'sensor',
      'suricata',
      config.sensor.upstreamUrl.hostname,
    ],
    now,
  });
  const backfilled = intelQueue.backfill(5);
  if (backfilled > 0) logger.info('intel backfill queued', { sessions: backfilled });

  // Port admin: API dashboard + SSE. Tidak pernah dibuka di port jebakan.
  const pricing = deps.pricing ?? loadPricing();
  const startedAt = now();
  const buildOverview = () =>
    computeOverview(db, {
      pricing,
      charsPerToken: config.labyrinth.charsPerToken,
      llmBaseUrl: config.llm.baseUrl,
      llmModel: config.llm.model,
      startedAt,
      upstreamHost: config.sensor.upstreamUrl.host,
      now: now(),
    });
  const hub = new StreamHub({
    bus,
    db,
    logger,
    buildOverview,
    ...(deps.streamFlushMs !== undefined ? { flushMs: deps.streamFlushMs } : {}),
  });
  // Host tambahan untuk MCP intel bila port admin sengaja diikat ke alamat non-loopback.
  const adminHost = config.admin.host;
  const extraMcpHosts =
    adminHost && !['0.0.0.0', '::', '127.0.0.1', 'localhost', '::1'].includes(adminHost)
      ? [adminHost]
      : [];
  let closeIntelMcp: (() => Promise<void>) | null = null;
  const adminApp = createAdminApp({
    db,
    logger,
    token: config.admin.dashboardToken,
    hub,
    buildOverview,
    ...(deps.dashboardDist ? { dashboardDist: deps.dashboardDist } : {}),
    extend: (api) => {
      registerRuleRoutes(api, rulesService);
      registerIntelRoutes(api, db, budget);
      // MCP intel baca-saja (FR-19) di /api/mcp, di belakang token yang sama.
      const mcp = registerIntelMcp(api, db, extraMcpHosts);
      closeIntelMcp = () => mcp.close();
    },
  });

  return {
    publicApp,
    adminApp,
    tracker,
    labyrinth,
    bus,
    hub,
    canaries,
    rules: rulesService,
    intel: intelQueue,
    budget,
    tick: (t) => {
      tracker.sweep(t);
    },
    shutdown: () => {
      tracker.closeAll();
      hub.close();
      void labyrinth.close();
      void closeIntelMcp?.();
    },
  };
}
