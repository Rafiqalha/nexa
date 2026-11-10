import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { type AllowEntry, assertAllowed, parseAllowlist } from './allowlist';

const opt = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema);

const EnvSchema = z.object({
  ATTACKER_TARGET_URL: opt(z.url().default('http://localhost:8080/')),
  ATTACKER_BASELINE_URL: opt(z.url().default('http://localhost:3000/')),
  LAB_TARGET_ALLOWLIST: opt(z.string().default('localhost:8080,localhost:3000')),
  ATTACKER_MODE: opt(z.enum(['auto', 'llm', 'scripted']).default('auto')),
  ATTACKER_LLM_BASE_URL: opt(z.url().default('https://api.deepseek.com')),
  ATTACKER_LLM_MODEL: opt(z.string().default('deepseek-flash')),
  ATTACKER_LLM_API_KEY: opt(z.string().default('')),
  ATTACKER_MAX_STEPS: opt(z.coerce.number().int().min(1).max(200).default(15)),
  ATTACKER_MAX_TOKENS: opt(z.coerce.number().int().min(1_000).default(250_000)),
  ATTACKER_STEP_DELAY_MS: opt(z.coerce.number().int().min(0).default(1_500)),
  ATTACKER_REPORT_DIR: opt(z.string().optional()),
});

export interface AgentConfig {
  target: string;
  allow: AllowEntry[];
  mode: 'llm' | 'scripted';
  llm: { baseUrl: string; model: string; apiKey: string };
  maxSteps: number;
  maxTokens: number;
  stepDelayMs: number;
  reportDir: string;
  baseline: boolean;
  label: string;
}

export interface CliFlags {
  baseline?: boolean;
  scripted?: boolean;
  model?: string;
  steps?: number;
  label?: string;
}

/** Hanya kunci ini yang dibaca dari .env: secret sensor (DEEPSEEK_API_KEY, DASHBOARD_TOKEN) tidak ikut. */
const ENV_KEYS = /^(ATTACKER_[A-Z_]+|LAB_TARGET_ALLOWLIST)$/;

export function readLabEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=(.*)$/);
    if (m?.[1] && ENV_KEYS.test(m[1])) out[m[1]] = (m[2] ?? '').trim();
  }
  return out;
}

export function findRepoRoot(start: string = import.meta.dirname): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

export function loadAgentConfig(
  env: Record<string, string | undefined>,
  flags: CliFlags = {},
  root = findRepoRoot(),
): AgentConfig {
  const e = EnvSchema.parse(env);
  const allow = parseAllowlist(e.LAB_TARGET_ALLOWLIST);
  const target = flags.baseline ? e.ATTACKER_BASELINE_URL : e.ATTACKER_TARGET_URL;
  // Target awal pun wajib ada di allowlist.
  assertAllowed(target, allow);
  const apiKey = e.ATTACKER_LLM_API_KEY;
  let mode: 'llm' | 'scripted' =
    e.ATTACKER_MODE === 'auto' ? (apiKey ? 'llm' : 'scripted') : e.ATTACKER_MODE;
  if (flags.scripted) mode = 'scripted';
  if (mode === 'llm' && !apiKey) {
    throw new Error('ATTACKER_MODE=llm tetapi ATTACKER_LLM_API_KEY kosong');
  }
  return {
    target,
    allow,
    mode,
    llm: { baseUrl: e.ATTACKER_LLM_BASE_URL, model: flags.model ?? e.ATTACKER_LLM_MODEL, apiKey },
    maxSteps: flags.steps ?? e.ATTACKER_MAX_STEPS,
    maxTokens: e.ATTACKER_MAX_TOKENS,
    stepDelayMs: e.ATTACKER_STEP_DELAY_MS,
    reportDir: e.ATTACKER_REPORT_DIR ?? join(root, 'lab', 'output'),
    baseline: Boolean(flags.baseline),
    label: flags.label ?? '',
  };
}
