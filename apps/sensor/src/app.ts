// Composition root sensor: merangkai tracker, labirin, jalur publik, dan API admin.
import type { HttpBindings } from '@hono/node-server';
import { dataLabel, type Plan } from '@nexa/shared';
import type { Hono } from 'hono';
import { registerAdminRoutes } from './api/admin-routes';
import { registerAccountRoutes, registerPublicAuthRoutes } from './api/auth-routes';
import { registerIntelRoutes } from './api/intel-routes';
import { loadPricing, type Pricing } from './api/pricing';
import { computeOverview } from './api/queries';
import { createAdminApp } from './api/router';
import { registerRuleRoutes } from './api/rules-routes';
import { StreamHub } from './api/stream';
import { AuditLog } from './audit/log';
import { SecretBox } from './auth/crypto';
import { type AuthHttpDeps, requestIp } from './auth/middleware';
import { AuthService } from './auth/service';
import { BillingService, loadPlans } from './billing/service';
import { Bus } from './bus';
import { CanaryRegistry } from './canary/registry';
import type { Config } from './config';
import type { Db } from './db/client';
import { SessionTracker } from './detect/tracker';
import { DailyBudget } from './intel/budget';
import { LlmClient } from './intel/llm';
import { IntelQueue } from './intel/queue';
import { Interrogation } from './interrogate';
import { type InterrogationConfig, loadInterrogationConfig } from './interrogate/config';
import { LabyrinthService } from './labyrinth/service';
import type { Logger } from './logger';
import { registerIntelMcp } from './mcp/intel';
import { createPublicApp } from './public/handler';
import { RulesService } from './rules/service';
import { createRunner, type SuricataRunner } from './rules/suricata';
import { SettingsService } from './settings/service';

/** Versi sensor yang ditampilkan di Pengaturan (bukan rahasia). */
export const SENSOR_VERSION = '0.3.0';

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
  /** Konfigurasi interogasi (eksperimental); default dari config/interrogation.json, null = mati. */
  interrogation?: InterrogationConfig | null;
  /** Paket tagihan (default config/plans.json). */
  plans?: Plan[];
  /** AUTH_SECRET hasil index.ts (env, atau dibuat sekali di folder data). */
  authSecret?: string;
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
  auth: AuthService;
  settings: SettingsService;
  billing: BillingService;
  audit: AuditLog;
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
  // Interogasi kognitif (EKSPERIMENTAL): teks umpan dari file konfigurasi, tanpa LLM.
  const interrogationConfig =
    deps.interrogation === undefined ? loadInterrogationConfig() : deps.interrogation;
  const interrogation =
    interrogationConfig?.enabled === true
      ? new Interrogation(interrogationConfig, labyrinthRoot(config))
      : undefined;
  logger.info('interrogation (experimental)', { enabled: interrogation !== undefined });
  const publicApp = createPublicApp({
    config,
    logger,
    tracker,
    labyrinth,
    canaries,
    now,
    ...(interrogation ? { interrogation, decorate: interrogation.decorate } : {}),
  });

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

  const authSecret = deps.authSecret ?? config.auth.secret;
  if (!authSecret) throw new Error('AUTH_SECRET tidak tersedia (env atau folder data)');

  // Administrasi: audit, tagihan (paket & kursi), pengaturan berjalan, dan akun/sesi login.
  // Ketiganya saling membaca lewat closure (kursi <- akun, batas paket <- tagihan).
  const audit = new AuditLog(db, now);
  const plans = deps.plans ?? loadPlans();
  let authService: AuthService | null = null;
  let settingsService: SettingsService | null = null;
  const billing = new BillingService({
    db,
    audit,
    plans,
    // Pemantau (baca-saja) tidak memakai kursi paket.
    seatsUsed: () => authService?.seatUserCount() ?? 0,
    orgName: () => settingsService?.get().org.name ?? config.orgName,
    now,
  });
  const settings = new SettingsService({
    db,
    config,
    budget,
    audit,
    planDailyTokenLimit: () => billing.currentPlan().limits.intelTokensPerDay,
    now,
  });
  settingsService = settings;
  const auth = new AuthService({
    db,
    audit,
    box: new SecretBox(authSecret),
    setupToken: config.auth.setupToken,
    serviceToken: config.admin.dashboardToken,
    issuer: 'NEXA',
    security: () => settings.get().security,
    seatLimit: () => billing.currentPlan().limits.seats,
    registrationEnabled: () => settings.get().registration.enabled,
    onSetup: (orgName, actor) => settings.update({ org: { name: orgName } }, actor),
    now,
  });
  authService = auth;
  settings.apply();
  if (config.mode === 'production' && config.admin.dashboardToken) {
    logger.warn('DASHBOARD_TOKEN aktif di mode produksi: token layanan setara admin');
  }
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
  const label = dataLabel(config.mode);
  const buildOverview = () =>
    computeOverview(db, {
      label,
      pricing,
      charsPerToken: config.labyrinth.charsPerToken,
      llmBaseUrl: config.llm.baseUrl,
      llmModel: config.llm.model,
      startedAt,
      upstreamHost: config.sensor.upstreamUrl.host,
      publicSiteUrl: config.sensor.publicSiteUrl,
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
  const extraMcpHosts = [
    ...(adminHost && !['0.0.0.0', '::', '127.0.0.1', 'localhost', '::1'].includes(adminHost)
      ? [adminHost]
      : []),
    ...(config.admin.publicOrigin ? [new URL(config.admin.publicOrigin).host] : []),
  ];
  const http: AuthHttpDeps = {
    auth,
    mode: config.mode,
    trustProxy: config.sensor.trustProxy,
    clientIpHeader: config.sensor.clientIpHeader,
    publicOrigin: config.admin.publicOrigin,
  };
  const orgName = () => settings.get().org.name;
  let closeIntelMcp: (() => Promise<void>) | null = null;
  const adminApp = createAdminApp({
    db,
    logger,
    http,
    hub,
    buildOverview,
    ...(deps.dashboardDist ? { dashboardDist: deps.dashboardDist } : {}),
    registerPublic: (api) => registerPublicAuthRoutes(api, { ...http, orgName, now }),
    extend: (api) => {
      registerAccountRoutes(api, { ...http, orgName });
      registerRuleRoutes(api, rulesService, { db, audit, ip: (c) => requestIp(c, http) });
      registerIntelRoutes(api, db, budget);
      registerAdminRoutes(api, {
        ...http,
        settings,
        billing,
        audit,
        sensorInfo: () => ({
          mode: config.mode,
          version: SENSOR_VERSION,
          upstreamHost: config.sensor.upstreamUrl.host,
          publicSiteUrl: config.sensor.publicSiteUrl,
          honeylinkPaths: config.detect.honeylinkPaths,
          suricataRunner: config.rules.runner,
          llmModel: config.llm.model || '(bawaan penyedia)',
          llmEnabled: llm.enabled,
        }),
      });
      // MCP intel baca-saja (FR-19) di /api/mcp, di belakang login/token API yang sama.
      const mcp = registerIntelMcp(api, db, extraMcpHosts, label);
      closeIntelMcp = () => mcp.close();
    },
  });
  let lastBillingSync = 0;

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
    auth,
    settings,
    billing,
    audit,
    tick: (t) => {
      tracker.sweep(t);
      // Pergantian bulan: invoice baru & turun paket terjadwal (dicek tiap 10 menit).
      if (t - lastBillingSync > 10 * 60_000) {
        lastBillingSync = t;
        billing.sync();
        settings.apply();
      }
    },
    shutdown: () => {
      tracker.closeAll();
      hub.close();
      void labyrinth.close();
      void closeIntelMcp?.();
    },
  };
}
