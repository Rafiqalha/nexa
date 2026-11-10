// Composition root sensor: merangkai tracker, labirin, jalur publik, dan API admin.
import type { HttpBindings } from '@hono/node-server';
import { Hono } from 'hono';
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
}

export interface Sensor {
  publicApp: Hono<{ Bindings: HttpBindings }>;
  adminApp: Hono<{ Bindings: HttpBindings }>;
  tracker: SessionTracker;
  labyrinth: LabyrinthService;
  bus: Bus;
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

  // Port admin: API dashboard (Fase 3). Tidak pernah dibuka di port jebakan.
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
    labyrinth,
    bus,
    tick: (t) => {
      tracker.sweep(t);
    },
    shutdown: () => tracker.closeAll(),
  };
}
