import {
  CANARY_KINDS,
  CLASSIFICATIONS,
  EVENT_KINDS,
  INTEL_SOURCES,
  INTEL_STATUSES,
  INVOICE_STATUSES,
  ROLES,
  RULE_SOURCES,
  RULE_STATUSES,
  SESSION_STATUSES,
  TOKEN_SCOPES,
  USER_STATUSES,
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

// --- Akun, sesi login, dan administrasi (port admin) ---------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  /** Huruf kecil; unik. */
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ROLES }).notNull().default('viewer'),
  /** Pemilik organisasi (akun pertama): tidak bisa dinonaktifkan/diturunkan admin lain. */
  isOwner: integer('is_owner', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: USER_STATUSES }).notNull().default('active'),
  /** scrypt$N$r$p$salt$hash; kata sandi asli tidak pernah disimpan. */
  passwordHash: text('password_hash').notNull(),
  /** Rahasia TOTP terenkripsi AES-256-GCM (kunci dari AUTH_SECRET). */
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
  /** Langkah waktu TOTP terakhir yang diterima (kode tidak bisa dipakai ulang). */
  totpLastStep: integer('totp_last_step'),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: integer('locked_until'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  lastLoginAt: integer('last_login_at'),
});

export const loginSessions = sqliteTable(
  'login_sessions',
  {
    /** sha256(token) heksadesimal; token asli hanya ada di cookie pengguna. */
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    lastSeenAt: integer('last_seen_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    ip: text('ip').notNull().default(''),
    userAgent: text('user_agent').notNull().default(''),
  },
  (t) => [index('login_sessions_user_idx').on(t.userId)],
);

/** Tautan sekali pakai: undangan pengguna baru dan reset kata sandi. */
export const oneTimeTokens = sqliteTable(
  'one_time_tokens',
  {
    /** sha256(token) heksadesimal. */
    id: text('id').primaryKey(),
    /** Id publik untuk daftar & pencabutan (bukan token). */
    publicId: text('public_id').notNull().unique(),
    kind: text('kind', { enum: ['invite', 'password_reset'] }).notNull(),
    email: text('email').notNull(),
    role: text('role', { enum: ROLES }),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdBy: text('created_by'),
    createdByName: text('created_by_name').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('one_time_tokens_kind_idx').on(t.kind)],
);

export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** sha256(token) heksadesimal. */
    tokenHash: text('token_hash').notNull().unique(),
    /** Awalan token untuk dikenali di daftar (bukan rahasia). */
    prefix: text('prefix').notNull(),
    scope: text('scope', { enum: TOKEN_SCOPES }).notNull().default('read'),
    createdAt: integer('created_at').notNull(),
    lastUsedAt: integer('last_used_at'),
    expiresAt: integer('expires_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('api_tokens_user_idx').on(t.userId)],
);

/** Jejak audit: siapa melakukan apa, kapan, dari mana. Tidak pernah memuat secret. */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ts: integer('ts').notNull(),
    /** Tanpa foreign key agar riwayat tetap utuh walau akun berubah. */
    actorId: text('actor_id'),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull().default(''),
    ip: text('ip').notNull().default(''),
    meta: text('meta', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [index('audit_log_ts_idx').on(t.ts), index('audit_log_action_idx').on(t.action)],
);

/** Pengaturan organisasi (key -> JSON). Default berasal dari env saat kunci belum ada. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: integer('updated_at').notNull(),
  updatedBy: text('updated_by'),
});

/** Langganan organisasi (satu baris, id = 1). Periode = bulan kalender WIB. */
export const subscription = sqliteTable('subscription', {
  id: integer('id').primaryKey(),
  planId: text('plan_id').notNull(),
  /** Turun paket dijadwalkan untuk periode berikutnya. */
  scheduledPlanId: text('scheduled_plan_id'),
  /** Awal periode yang sudah diproses (pergantian bulan memicu invoice baru). */
  currentPeriodStart: integer('current_period_start').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const invoices = sqliteTable(
  'invoices',
  {
    id: text('id').primaryKey(),
    number: text('number').notNull().unique(),
    planId: text('plan_id').notNull(),
    planName: text('plan_name').notNull(),
    periodStart: integer('period_start').notNull(),
    periodEnd: integer('period_end').notNull(),
    amountIdr: integer('amount_idr').notNull(),
    status: text('status', { enum: INVOICE_STATUSES }).notNull().default('open'),
    issuedAt: integer('issued_at').notNull(),
    dueAt: integer('due_at').notNull(),
    paidAt: integer('paid_at'),
    paidBy: text('paid_by'),
    paidByName: text('paid_by_name'),
    paymentRef: text('payment_ref'),
    lines: text('lines', { mode: 'json' })
      .$type<{ description: string; amountIdr: number }[]>()
      .notNull()
      .default(sql`'[]'`),
  },
  (t) => [
    index('invoices_period_idx').on(t.periodStart),
    index('invoices_status_idx').on(t.status),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type LoginSessionRow = typeof loginSessions.$inferSelect;
export type OneTimeTokenRow = typeof oneTimeTokens.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;

export type SessionRow = typeof sessions.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type CanaryRow = typeof canaries.$inferSelect;
export type BanditArmRow = typeof banditArms.$inferSelect;
export type IntelRow = typeof intel.$inferSelect;
export type RuleRow = typeof rules.$inferSelect;
