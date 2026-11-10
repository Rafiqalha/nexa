import { z } from 'zod';
import { resolveFromRoot } from './paths';

/** Env kosong (`KEY=`) diperlakukan sama dengan tidak di-set agar default berlaku. */
const opt = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema);

const port = z.coerce.number().int().min(1).max(65535);
const ratio = z.coerce.number().min(0).max(1);
const bool = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');
const csv = z.string().transform((s) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0),
);

const EnvSchema = z
  .object({
    NODE_ENV: opt(z.enum(['development', 'production', 'test']).default('development')),
    LOG_LEVEL: opt(z.enum(['debug', 'info', 'warn', 'error']).default('info')),

    SENSOR_HOST: opt(z.string().default('0.0.0.0')),
    SENSOR_PORT: opt(port.default(8080)),
    UPSTREAM_URL: opt(z.url({ protocol: /^https?$/, error: 'harus URL http(s) yang valid' })),
    TRUST_PROXY: opt(bool.default(false)),

    ADMIN_HOST: opt(z.string().default('127.0.0.1')),
    ADMIN_PORT: opt(port.default(8081)),
    DASHBOARD_TOKEN: opt(z.string({ error: 'wajib di-set' }).min(16, 'minimal 16 karakter')),
    DASHBOARD_DIST: opt(z.string().optional()),

    DATABASE_PATH: opt(z.string().min(1).default('./data/nexa.db')),

    LLM_BASE_URL: opt(z.url().default('https://api.deepseek.com')),
    LLM_MODEL: opt(z.string().default('')),
    DEEPSEEK_API_KEY: opt(z.string().default('')),
    LLM_DAILY_TOKEN_BUDGET: opt(z.coerce.number().int().min(0).default(200_000)),

    SUSPECT_SCORE_THRESHOLD: opt(ratio.default(0.6)),
    AGENT_SCORE_THRESHOLD: opt(ratio.default(0.85)),
    TIMING_FAST_MS: opt(z.coerce.number().int().positive().default(2500)),
    HONEYLINK_PATHS: opt(csv.default(['/arsip-internal/'])),
    SESSION_IDLE_TIMEOUT_MS: opt(z.coerce.number().int().min(1000).default(60_000)),

    CHARS_PER_TOKEN: opt(z.coerce.number().positive().default(4)),
    BANDIT_EPSILON: opt(ratio.default(0.1)),
    /** Hanya untuk debugging/replay: semua sesi memakai seed labirin ini. */
    LABYRINTH_FIXED_SEED: opt(
      z
        .string()
        .regex(/^[0-9a-zA-Z_-]{4,64}$/)
        .optional(),
    ),
    BANDIT_MAX_HOLD_MS: opt(z.coerce.number().int().positive().default(120_000)),

    SURICATA_RULES_DIR: opt(z.string().min(1).default('./deploy/suricata/rules')),
    SURICATA_CONTAINER: opt(z.string().min(1).default('suricata')),
  })
  .refine((e) => e.AGENT_SCORE_THRESHOLD >= e.SUSPECT_SCORE_THRESHOLD, {
    path: ['AGENT_SCORE_THRESHOLD'],
    message: 'harus >= SUSPECT_SCORE_THRESHOLD',
  })
  .refine((e) => e.HONEYLINK_PATHS.every((p) => p.startsWith('/')), {
    path: ['HONEYLINK_PATHS'],
    message: 'setiap path harus diawali "/"',
  });

export interface Config {
  env: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  sensor: { host: string; port: number; upstreamUrl: URL; trustProxy: boolean };
  admin: { host: string; port: number; dashboardToken: string; dashboardDist?: string };
  db: { path: string };
  llm: { baseUrl: string; model: string; apiKey: string; dailyTokenBudget: number };
  detect: {
    suspectThreshold: number;
    agentThreshold: number;
    timingFastMs: number;
    honeylinkPaths: string[];
    sessionIdleTimeoutMs: number;
  };
  labyrinth: {
    charsPerToken: number;
    banditEpsilon: number;
    banditMaxHoldMs: number;
    fixedSeed?: string;
  };
  rules: { dir: string; suricataContainer: string };
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Konfigurasi tidak valid:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Membaca & memvalidasi env. Melempar ConfigError bila ada yang wajib hilang/tidak valid.
 * Pesan error hanya menyebut NAMA variabel, tidak pernah nilainya (bisa berisi secret).
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  opts: { baseDir?: string } = {},
): Config {
  const baseDir = opts.baseDir ?? process.cwd();
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => {
      const key = i.path.join('.') || '(env)';
      const message =
        i.code === 'invalid_type' && i.input === undefined ? 'wajib di-set' : i.message;
      return `${key}: ${message}`;
    });
    throw new ConfigError(problems);
  }
  const e = parsed.data;
  if (e.UPSTREAM_URL === undefined || e.DASHBOARD_TOKEN === undefined) {
    // Tidak terjangkau (zod sudah menolak), tapi menjaga tipe tetap ketat.
    throw new ConfigError(['UPSTREAM_URL/DASHBOARD_TOKEN: wajib di-set']);
  }
  return {
    env: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    sensor: {
      host: e.SENSOR_HOST,
      port: e.SENSOR_PORT,
      upstreamUrl: new URL(e.UPSTREAM_URL),
      trustProxy: e.TRUST_PROXY,
    },
    admin: {
      host: e.ADMIN_HOST,
      port: e.ADMIN_PORT,
      dashboardToken: e.DASHBOARD_TOKEN,
      ...(e.DASHBOARD_DIST ? { dashboardDist: e.DASHBOARD_DIST } : {}),
    },
    db: { path: resolveFromRoot(e.DATABASE_PATH, baseDir) },
    llm: {
      baseUrl: e.LLM_BASE_URL,
      model: e.LLM_MODEL,
      apiKey: e.DEEPSEEK_API_KEY,
      dailyTokenBudget: e.LLM_DAILY_TOKEN_BUDGET,
    },
    detect: {
      suspectThreshold: e.SUSPECT_SCORE_THRESHOLD,
      agentThreshold: e.AGENT_SCORE_THRESHOLD,
      timingFastMs: e.TIMING_FAST_MS,
      honeylinkPaths: e.HONEYLINK_PATHS,
      sessionIdleTimeoutMs: e.SESSION_IDLE_TIMEOUT_MS,
    },
    labyrinth: {
      charsPerToken: e.CHARS_PER_TOKEN,
      banditEpsilon: e.BANDIT_EPSILON,
      banditMaxHoldMs: e.BANDIT_MAX_HOLD_MS,
      ...(e.LABYRINTH_FIXED_SEED ? { fixedSeed: e.LABYRINTH_FIXED_SEED } : {}),
    },
    rules: {
      dir: resolveFromRoot(e.SURICATA_RULES_DIR, baseDir),
      suricataContainer: e.SURICATA_CONTAINER,
    },
  };
}
