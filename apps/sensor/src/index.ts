import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createSensor } from './app';
import { type Config, ConfigError, loadConfig } from './config';
import { openDb, runMigrations } from './db/client';
import { createLogger } from './logger';
import { findRepoRoot, loadRootEnv } from './paths';

const SWEEP_INTERVAL_MS = 2_000;

function bootConfig(): Config {
  const root = findRepoRoot();
  loadRootEnv(root);
  try {
    return loadConfig(process.env, { baseDir: root });
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(
        `${JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'invalid configuration', problems: err.problems })}\n`,
      );
      process.exit(1);
    }
    throw err;
  }
}

const config = bootConfig();
const logger = createLogger(config.logLevel, { svc: 'sensor' });
const handle = openDb(config.db.path);
runMigrations(handle.db);

const dashboardDist =
  config.admin.dashboardDist ?? join(findRepoRoot(), 'apps', 'dashboard', 'dist');
const sensor = createSensor({ config, logger, db: handle.db, dashboardDist });

const publicServer = serve(
  { fetch: sensor.publicApp.fetch, port: config.sensor.port, hostname: config.sensor.host },
  (info) =>
    logger.info('public listener up', {
      port: info.port,
      upstream: config.sensor.upstreamUrl.origin,
    }),
);
const adminServer = serve(
  { fetch: sensor.adminApp.fetch, port: config.admin.port, hostname: config.admin.host },
  (info) => logger.info('admin listener up', { host: config.admin.host, port: info.port }),
);

const sweeper = setInterval(() => sensor.tick(Date.now()), SWEEP_INTERVAL_MS);

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  logger.info('shutting down', { signal });
  clearInterval(sweeper);
  sensor.shutdown();
  publicServer.close();
  adminServer.close();
  handle.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
