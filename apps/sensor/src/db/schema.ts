import {
  CANARY_KINDS,
  CLASSIFICATIONS,
  EVENT_KINDS,
  INTEL_SOURCES,
  INTEL_STATUSES,
  RULE_SOURCES,
  RULE_STATUSES,
  SESSION_STATUSES,
} from '@nexa/shared';
import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Semua timestamp disimpan sebagai epoch milidetik (integer).

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    /** hash(IP + User-Agent); kunci pelacakan tanpa cookie. */
    fingerprint: text('fingerprint').notNull(),
    firstSeenAt: integer('first_seen_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    endedAt: integer('ended_at'),
    /** Disimpan apa adanya secara lokal; disamarkan saat diekspor ke model (intel/redact.ts). */
    sourceIp: text('source_ip').notNull(),
    userAgent: text('user_agent').notNull().default(''),
    classification: text('classification', { enum: CLASSIFICATIONS }).notNull().default('legit'),
    score: real('score').notNull().default(0),
    status: text('status', { enum: SESSION_STATUSES }).notNull().default('active'),
    labyrinthSeed: text('labyrinth_seed').notNull(),
    requestCount: integer('request_count').notNull().default(0),
    maxDepth: integer('max_depth').notNull().default(0),
    trappedAt: integer('trapped_at'),
    /** Alasan skor (sinyal yang memicu), JSON array string. */
    reasons: text('reasons', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  },
  (t) => [
    index('sessions_fingerprint_idx').on(t.fingerprint),
    index('sessions_status_idx').on(t.status),
    index('sessions_last_seen_idx').on(t.lastSeenAt),
  ],
);

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    ts: integer('ts').notNull(),
    kind: text('kind', { enum: EVENT_KINDS }).notNull(),
    method: text('method').notNull().default('GET'),
    path: text('path').notNull(),
    status: integer('status'),
    charsServed: integer('chars_served').notNull().default(0),
    estTokens: integer('est_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    meta: text('meta', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    index('events_session_ts_idx').on(t.sessionId, t.ts),
    index('events_kind_idx').on(t.kind),
  ],
);

export const canaries = sqliteTable(
  'canaries',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    kind: text('kind', { enum: CANARY_KINDS }).notNull(),
    issuedAt: integer('issued_at').notNull(),
    /** Path labirin tempat canary disajikan. */
    issuedPath: text('issued_path').notNull().default(''),
    triggeredAt: integer('triggered_at'),
    triggerIp: text('trigger_ip'),
    /** Sesi yang memakai canary (bisa berbeda dari sesi penerima). */
    triggerSessionId: text('trigger_session_id'),
    triggerCount: integer('trigger_count').notNull().default(0),
  },
  (t) => [index('canaries_session_idx').on(t.sessionId)],
);

export const banditArms = sqliteTable('bandit_arms', {
  /** Jenis umpan. */
  armId: text('arm_id').primaryKey(),
  pulls: integer('pulls').notNull().default(0),
  totalHoldMs: integer('total_hold_ms').notNull().default(0),
  meanReward: real('mean_reward').notNull().default(0),
});

export const intel = sqliteTable(
  'intel',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    status: text('status', { enum: INTEL_STATUSES }).notNull().default('queued'),
    source: text('source', { enum: INTEL_SOURCES }).notNull().default('heuristic'),
    summary: text('summary').notNull().default(''),
    suspectedModel: text('suspected_model').notNull().default(''),
    confidence: real('confidence').notNull().default(0),
    /** EKSPERIMENTAL: teks yang dibocorkan agen lewat interogasi. */
    capturedPrompt: text('captured_prompt'),
    patterns: text('patterns', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
    tokensUsed: integer('tokens_used').notNull().default(0),
    error: text('error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('intel_session_idx').on(t.sessionId), index('intel_status_idx').on(t.status)],
);

export const rules = sqliteTable(
  'rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    /** Jenis pola: honeylink | user_agent | canary | llm. */
    kind: text('kind').notNull(),
    source: text('source', { enum: RULE_SOURCES }).notNull().default('template'),
    title: text('title').notNull().default(''),
    body: text('body').notNull(),
    /** null = belum divalidasi (Suricata tidak tersedia). */
    syntaxValid: integer('syntax_valid', { mode: 'boolean' }),
    validationOutput: text('validation_output').notNull().default(''),
    validatedAt: integer('validated_at'),
    status: text('status', { enum: RULE_STATUSES }).notNull().default('draft'),
    decidedBy: text('decided_by'),
    decidedAt: integer('decided_at'),
    deployedAt: integer('deployed_at'),
    deployError: text('deploy_error'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('rules_status_idx').on(t.status), index('rules_session_idx').on(t.sessionId)],
);

export const llmBudget = sqliteTable('llm_budget', {
  /** YYYY-MM-DD (WIB). */
  date: text('date').primaryKey(),
  tokensUsed: integer('tokens_used').notNull().default(0),
  limit: integer('limit').notNull(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type CanaryRow = typeof canaries.$inferSelect;
export type BanditArmRow = typeof banditArms.$inferSelect;
export type IntelRow = typeof intel.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
