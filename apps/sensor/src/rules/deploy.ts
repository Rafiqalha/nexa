// Deploy rule ke Suricata HANYA bila ada record persetujuan operator di DB
// (AGENTS.md §2.5, FR-17). Tidak ada jalur lain yang menulis ke folder rule Suricata.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Bus } from '../bus';
import type { Db } from '../db/client';
import { type RuleRow, rules } from '../db/schema';
import type { Logger } from '../logger';
import type { SuricataRunner } from './suricata';

export const RULES_FILE = 'nexa.rules';

export class ApprovalRequiredError extends Error {
  constructor(ruleId: number) {
    super(`rule #${ruleId} tidak punya record persetujuan operator; deploy ditolak`);
    this.name = 'ApprovalRequiredError';
  }
}

export class RuleNotDeployableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleNotDeployableError';
  }
}

type ApprovalFields = Pick<RuleRow, 'id' | 'status' | 'decidedBy' | 'decidedAt' | 'syntaxValid'>;

/** Record persetujuan = status approved/deployed + siapa (decidedBy) + kapan (decidedAt). */
export function hasApprovalRecord(rule: ApprovalFields): boolean {
  return (
    (rule.status === 'approved' || rule.status === 'deployed') &&
    typeof rule.decidedBy === 'string' &&
    rule.decidedBy.trim().length > 0 &&
    typeof rule.decidedAt === 'number' &&
    rule.decidedAt > 0
  );
}

export function assertDeployable(rule: ApprovalFields): void {
  if (!hasApprovalRecord(rule)) throw new ApprovalRequiredError(rule.id);
  if (rule.syntaxValid !== true) {
    throw new RuleNotDeployableError(`rule #${rule.id} belum lolos validasi suricata -T`);
  }
}

/** Isi file rule aktif. Setiap rule diperiksa ulang punya approval (pertahanan berlapis). */
export function buildRulesFile(set: readonly RuleRow[], generatedAt: number): string {
  const lines = [
    '# NEXA — rule aktif hasil persetujuan operator. JANGAN diedit manual.',
    `# Dibuat ${new Date(generatedAt).toISOString()} · ${set.length} rule`,
    '',
  ];
  for (const r of [...set].sort((a, b) => a.id - b.id)) {
    assertDeployable(r);
    lines.push(
      `# #${r.id} ${r.title.replace(/[\r\n]/g, ' ')} | disetujui ${r.decidedBy} ${new Date(r.decidedAt ?? 0).toISOString()}`,
    );
    lines.push(r.body.replace(/[\r\n]+/g, ' '));
  }
  return `${lines.join('\n')}\n`;
}

export interface DeployDeps {
  db: Db;
  runner: SuricataRunner;
  rulesDir: string;
  logger: Logger;
  bus?: Bus;
  now?: () => number;
}

function writeAtomic(dir: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${RULES_FILE}.${process.pid}.tmp`);
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, join(dir, RULES_FILE));
}

/**
 * Menulis rule yang SUDAH disetujui ke folder Suricata lalu reload.
 * Melempar ApprovalRequiredError bila record persetujuan tidak ada.
 */
export async function deployRule(deps: DeployDeps, ruleId: number): Promise<RuleRow> {
  const now = deps.now ?? Date.now;
  const rule = deps.db.select().from(rules).where(eq(rules.id, ruleId)).get();
  if (!rule) throw new RuleNotDeployableError(`rule #${ruleId} tidak ditemukan`);
  assertDeployable(rule);

  const active = deps.db
    .select()
    .from(rules)
    .where(eq(rules.status, 'deployed'))
    .all()
    .filter((r) => r.id !== rule.id);
  const content = buildRulesFile([...active, rule], now());

  const target = join(deps.rulesDir, RULES_FILE);
  const previous = existsSync(target) ? readFileSync(target, 'utf8') : null;
  writeAtomic(deps.rulesDir, content);

  const result = await deps.runner
    .deploy(content)
    .catch((err: Error) => ({ ok: false, output: err.message }));

  if (!result.ok) {
    // Kembalikan file ke kondisi sebelumnya: rule yang gagal reload tidak dibiarkan menggantung.
    if (previous === null) writeAtomic(deps.rulesDir, buildRulesFile(active, now()));
    else writeAtomic(deps.rulesDir, previous);
    const failed = deps.db
      .update(rules)
      .set({ deployError: result.output.slice(0, 2_000) })
      .where(eq(rules.id, rule.id))
      .returning()
      .get();
    deps.logger.warn('rule deploy failed', { ruleId: rule.id });
    deps.bus?.emit('rule:changed', { ruleId: rule.id });
    return failed;
  }

  const deployed = deps.db
    .update(rules)
    .set({ status: 'deployed', deployedAt: now(), deployError: null })
    .where(eq(rules.id, rule.id))
    .returning()
    .get();
  deps.logger.info('rule deployed', {
    ruleId: rule.id,
    decidedBy: rule.decidedBy,
    active: active.length + 1,
  });
  deps.bus?.emit('rule:changed', { ruleId: rule.id });
  return deployed;
}
