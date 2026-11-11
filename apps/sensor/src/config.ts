import { createHash } from 'node:crypto';
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
    /** lab = data simulasi; production = trafik internet nyata (label & cookie berbeda). */
    NEXA_MODE: opt(z.enum(['lab', 'production']).default('lab')),
    ORG_NAME: opt(z.string().trim().min(2).max(80).default('Organisasi NEXA')),
    /** Kunci turunan auth (enkripsi rahasia 2FA, tanda tangan tantangan login). */
    AUTH_SECRET: opt(z.string().min(32, 'minimal 32 karakter').optional()),
    /**
     * Opsional. Bila di-set, pendaftaran akun pertama (pemilik) meminta token ini; bila kosong,
     * pendaftar pertama langsung menjadi pemilik.
     */
    SETUP_TOKEN: opt(z.string().min(16, 'minimal 16 karakter').optional()),
    /** Origin publik dashboard di produksi, mis. https://nexa.example.org (CSRF & MCP). */
    DASHBOARD_ORIGIN: opt(z.url({ protocol: /^https?$/ }).optional()),
    /** URL publik situs yang dilindungi (ditampilkan di dashboard); bukan secret. */
    PUBLIC_SITE_URL: opt(z.url({ protocol: /^https?$/ }).optional()),

    SENSOR_HOST: opt(z.string().default('0.0.0.0')),
    SENSOR_PORT: opt(port.default(8080)),
    UPSTREAM_URL: opt(z.url({ protocol: /^https?$/, error: 'harus URL http(s) yang valid' })),
    TRUST_PROXY: opt(bool.default(false)),
    /**
     * Header IP klien saat TRUST_PROXY=true: `x-forwarded-for` (entri pertama, bawaan),
     * `x-forwarded-for-last` (entri terakhir = ditambahkan proxy tepercaya), atau nama header
     * lain yang ditimpa proxy, mis. `x-real-ip`.
     */
    CLIENT_IP_HEADER: opt(
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9-]{3,64}$/)
        .default('x-forwarded-for'),
    ),

    ADMIN_HOST: opt(z.string().default('127.0.0.1')),
    ADMIN_PORT: opt(port.default(8081)),
    /** Token layanan (lab & skrip). Opsional: kosong = hanya login akun. */
    DASHBOARD_TOKEN: opt(z.string().min(16, 'minimal 16 karakter').optional()),
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
    SURICATA_RUNNER: opt(z.enum(['none', 'exec', 'control']).default('none')),
    SURICATA_EXEC: opt(z.string().optional()),
    SURICATA_CONTROL_URL: opt(z.url().optional()),
    SURICATA_CONTROL_TOKEN: opt(z.string().min(16).optional()),
  })
  .refine((e) => e.AGENT_SCORE_THRESHOLD >= e.SUSPECT_SCORE_THRESHOLD, {
    path: ['AGENT_SCORE_THRESHOLD'],
    message: 'harus >= SUSPECT_SCORE_THRESHOLD',
  })
  .refine((e) => e.HONEYLINK_PATHS.every((p) => p.startsWith('/')), {
    path: ['HONEYLINK_PATHS'],
    message: 'setiap path harus diawali "/"',
  })
  .refine((e) => e.SURICATA_RUNNER !== 'exec' || Boolean(e.SURICATA_EXEC), {
    path: ['SURICATA_EXEC'],
    message: 'wajib di-set bila SURICATA_RUNNER=exec',
  })
  .refine((e) => e.SURICATA_RUNNER !== 'control' || Boolean(e.SURICATA_CONTROL_TOKEN), {
    path: ['SURICATA_CONTROL_TOKEN'],
    message: 'wajib di-set (min 16 karakter) bila SURICATA_RUNNER=control',
  })
  .refine((e) => e.NEXA_MODE !== 'production' || Boolean(e.DASHBOARD_ORIGIN), {
    path: ['DASHBOARD_ORIGIN'],
    message: 'wajib di-set di produksi (origin https dashboard)',
  });

export interface Config {
  env: 'development' | 'production' | 'test';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  mode: 'lab' | 'production';
  orgName: string;
  sensor: {
    host: string;
    port: number;
    upstreamUrl: URL;
    trustProxy: boolean;
    clientIpHeader: string;
    /** URL publik situs yang dilindungi (tanpa slash akhir); null = tidak ditampilkan. */
    publicSiteUrl: string | null;
  };
  admin: {
    host: string;
    port: number;
    /** Token layanan (DASHBOARD_TOKEN); null = nonaktif. */
    dashboardToken: string | null;
    dashboardDist?: string;
    /** Origin publik dashboard (tanpa slash akhir); null = diturunkan dari header Host. */
    publicOrigin: string | null;
  };
  /** secret null = dibuat & disimpan sekali di folder data oleh index.ts (produksi). */
  auth: { secret: string | null; setupToken: string | null };
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
  rules: {
    dir: string;
    suricataContainer: string;
    runner: 'none' | 'exec' | 'control';
    exec?: string;
    controlUrl?: string;
    controlToken?: string;
  };
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
  if (e.UPSTREAM_URL === undefined) {
    // Tidak terjangkau (zod sudah menolak), tapi menjaga tipe tetap ketat.
    throw new ConfigError(['UPSTREAM_URL: wajib di-set']);
  }
  // Lab tanpa AUTH_SECRET: turunkan secara deterministik dari DASHBOARD_TOKEN agar sesi
  // dan rahasia 2FA tetap valid setelah restart. Tanpa keduanya (mis. produksi), index.ts
  // membuat secret acak sekali dan menyimpannya di folder data (izin 0600).
  const authSecret =
    e.AUTH_SECRET ??
    (e.NEXA_MODE === 'lab' && e.DASHBOARD_TOKEN
      ? createHash('sha256').update(`nexa-auth:${e.DASHBOARD_TOKEN}`).digest('base64url')
      : null);
  // Token penyiapan hanya bila di-set eksplisit: tanpa itu pendaftar pertama menjadi pemilik.
  const setupToken = e.SETUP_TOKEN ?? null;
  return {
    env: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    mode: e.NEXA_MODE,
    orgName: e.ORG_NAME,
    sensor: {
      host: e.SENSOR_HOST,
      port: e.SENSOR_PORT,
      upstreamUrl: new URL(e.UPSTREAM_URL),
      trustProxy: e.TRUST_PROXY,
      clientIpHeader: e.CLIENT_IP_HEADER,
      publicSiteUrl: e.PUBLIC_SITE_URL ? e.PUBLIC_SITE_URL.replace(/\/+$/, '') : null,
    },
    admin: {
      host: e.ADMIN_HOST,
      port: e.ADMIN_PORT,
      dashboardToken: e.DASHBOARD_TOKEN ?? null,
      ...(e.DASHBOARD_DIST ? { dashboardDist: e.DASHBOARD_DIST } : {}),
      publicOrigin: e.DASHBOARD_ORIGIN ? new URL(e.DASHBOARD_ORIGIN).origin : null,
    },
    auth: { secret: authSecret, setupToken },
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
      runner: e.SURICATA_RUNNER,
      ...(e.SURICATA_EXEC ? { exec: e.SURICATA_EXEC } : {}),
      controlUrl: e.SURICATA_CONTROL_URL ?? `http://${e.SURICATA_CONTAINER}:9010`,
      ...(e.SURICATA_CONTROL_TOKEN ? { controlToken: e.SURICATA_CONTROL_TOKEN } : {}),
    },
  };
}
