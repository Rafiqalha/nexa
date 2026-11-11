// Pengaturan organisasi yang bisa diubah admin saat sensor berjalan. Nilai awal dari env;
// perubahan disimpan di tabel settings dan langsung diterapkan (ambang deteksi, budget intel).
import { type Settings, SettingsSchema, type SettingsUpdateInput } from '@nexa/shared';
import type { Actor, AuditLog } from '../audit/log';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { settings as settingsTable } from '../db/schema';
import type { DailyBudget } from '../intel/budget';

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsError';
  }
}

export interface SettingsDeps {
  db: Db;
  config: Config;
  budget: DailyBudget;
  audit: AuditLog;
  /** Batas token intel harian dari paket langganan (null = tanpa batas). */
  planDailyTokenLimit: () => number | null;
  now?: () => number;
}

const SECTIONS = ['org', 'security', 'detection', 'intel'] as const;
type Section = (typeof SECTIONS)[number];

export class SettingsService {
  private cache: Settings | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: SettingsDeps) {
    this.now = deps.now ?? Date.now;
  }

  defaults(): Settings {
    const { config } = this.deps;
    return {
      org: { name: config.orgName },
      security: { sessionTtlHours: 12, idleTimeoutMinutes: 60, require2faForAdmins: false },
      detection: {
        suspectThreshold: config.detect.suspectThreshold,
        agentThreshold: config.detect.agentThreshold,
      },
      intel: { dailyTokenBudget: config.llm.dailyTokenBudget },
    };
  }

  get(): Settings {
    if (this.cache) return this.cache;
    const base = this.defaults();
    const rows = this.deps.db.select().from(settingsTable).all();
    const merged: Record<string, unknown> = { ...base };
    for (const row of rows) {
      if ((SECTIONS as readonly string[]).includes(row.key)) {
        merged[row.key] = { ...(base[row.key as Section] as object), ...(row.value as object) };
      }
    }
    const parsed = SettingsSchema.safeParse(merged);
    this.cache = parsed.success ? parsed.data : base;
    return this.cache;
  }

  /** Budget token intel harian efektif = min(pengaturan, batas paket). */
  effectiveDailyTokenBudget(): number {
    const own = this.get().intel.dailyTokenBudget;
    const plan = this.deps.planDailyTokenLimit();
    return plan === null ? own : Math.min(own, plan);
  }

  update(input: SettingsUpdateInput, actor: Actor, ip = ''): Settings {
    const current = this.get();
    const next: Settings = {
      org: { ...current.org, ...input.org },
      security: { ...current.security, ...input.security },
      detection: { ...current.detection, ...input.detection },
      intel: { ...current.intel, ...input.intel },
    };
    const parsed = SettingsSchema.safeParse(next);
    if (!parsed.success)
      throw new SettingsError(parsed.error.issues[0]?.message ?? 'nilai tidak valid');
    if (parsed.data.detection.agentThreshold < parsed.data.detection.suspectThreshold) {
      throw new SettingsError('ambang agen harus >= ambang curiga');
    }
    const t = this.now();
    const changed: string[] = [];
    for (const section of SECTIONS) {
      if (JSON.stringify(parsed.data[section]) === JSON.stringify(current[section])) continue;
      for (const [k, v] of Object.entries(parsed.data[section])) {
        if ((current[section] as Record<string, unknown>)[k] !== v) changed.push(`${section}.${k}`);
      }
      this.deps.db
        .insert(settingsTable)
        .values({ key: section, value: parsed.data[section], updatedAt: t, updatedBy: actor.id })
        .onConflictDoUpdate({
          target: settingsTable.key,
          set: { value: parsed.data[section], updatedAt: t, updatedBy: actor.id },
        })
        .run();
    }
    this.cache = parsed.data;
    this.apply();
    if (changed.length > 0) {
      const after: Record<string, unknown> = {};
      for (const key of changed) {
        const [s, f] = key.split('.') as [Section, string];
        after[key] = (parsed.data[s] as Record<string, unknown>)[f];
      }
      this.deps.audit.record(actor, 'settings.update', changed.join(', '), ip, { after });
    }
    return parsed.data;
  }

  /** Terapkan ke komponen yang berjalan: tracker membaca ambang dari objek config yang sama. */
  apply(): void {
    const s = this.get();
    this.deps.config.detect.suspectThreshold = s.detection.suspectThreshold;
    this.deps.config.detect.agentThreshold = s.detection.agentThreshold;
    this.deps.budget.setLimit(this.effectiveDailyTokenBudget());
  }
}
