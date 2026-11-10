// Composition root sensor: merangkai tracker, labirin, jalur publik, dan API admin.
import type { HttpBindings } from '@hono/node-server';
import type { Hono } from 'hono';
import { loadPricing, type Pricing } from './api/pricing';
import { computeOverview } from './api/queries';
import { createAdminApp } from './api/router';
import { StreamHub } from './api/stream';
import { Bus } from './bus';
import type { Config } from './config';
import type { Db } from './db/client';
import { SessionTracker } from './detect/tracker';
import { LabyrinthService } from './labyrinth/service';
import type { Logger } from './logger';
import { createPublicApp } from './public/handler';

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
}

export interface Sensor {
  publicApp: Hono<{ Bindings: HttpBindings }>;
  adminApp: Hono<{ Bindings: HttpBindings }>;
  tracker: SessionTracker;
  labyrinth: LabyrinthService;
  bus: Bus;
  hub: StreamHub;
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

  const publicApp = createPublicApp({ config, logger, tracker, labyrinth, now });

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
  const adminApp = createAdminApp({
    db,
    logger,
    token: config.admin.dashboardToken,
    hub,
    buildOverview,
    ...(deps.dashboardDist ? { dashboardDist: deps.dashboardDist } : {}),
  });

  return {
    publicApp,
    adminApp,
    tracker,
    labyrinth,
    bus,
    hub,
    tick: (t) => {
      tracker.sweep(t);
    },
    shutdown: () => {
      tracker.closeAll();
      hub.close();
    },
  };
}
