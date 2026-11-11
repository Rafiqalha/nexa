// Kontrak API administrasi: pengguna, undangan, audit, pengaturan, dan tagihan.
import { z } from 'zod';
import { EmailSchema, NexaModeSchema, RoleSchema } from './auth';

// --- Pengguna & undangan -----------------------------------------------------------

export const USER_STATUSES = ['active', 'disabled'] as const;
export const UserStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: RoleSchema,
  isOwner: z.boolean(),
  status: UserStatusSchema,
  totpEnabled: z.boolean(),
  createdAt: z.number(),
  lastLoginAt: z.number().nullable(),
});
export type User = z.infer<typeof UserSchema>;

export const SeatsSchema = z.object({ used: z.number().int(), limit: z.number().int().nullable() });
export type Seats = z.infer<typeof SeatsSchema>;

export const InviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: RoleSchema,
  createdAt: z.number(),
  expiresAt: z.number(),
  createdByName: z.string(),
});
export type Invite = z.infer<typeof InviteSchema>;

export const UserListSchema = z.object({
  users: z.array(UserSchema),
  invites: z.array(InviteSchema),
  seats: SeatsSchema,
});
export type UserList = z.infer<typeof UserListSchema>;

export const UserUpdateInputSchema = z
  .object({ role: RoleSchema.optional(), status: UserStatusSchema.optional() })
  .refine((v) => v.role !== undefined || v.status !== undefined, 'tidak ada perubahan');
export type UserUpdateInput = z.infer<typeof UserUpdateInputSchema>;

export const InviteCreateInputSchema = z.object({ email: EmailSchema, role: RoleSchema });
export type InviteCreateInput = z.infer<typeof InviteCreateInputSchema>;

/** Tautan sekali pakai (undangan / reset kata sandi). Token hanya muncul di respons ini. */
export const OneTimeLinkSchema = z.object({ path: z.string(), expiresAt: z.number() });
export type OneTimeLink = z.infer<typeof OneTimeLinkSchema>;

export const InviteCreatedSchema = z.object({ invite: InviteSchema, link: OneTimeLinkSchema });

// --- Audit ---------------------------------------------------------------------------

export const AuditEntrySchema = z.object({
  id: z.number().int(),
  ts: z.number(),
  actorId: z.string().nullable(),
  actorName: z.string(),
  action: z.string(),
  target: z.string(),
  ip: z.string(),
  meta: z.record(z.string(), z.unknown()),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
export const AuditListSchema = z.object({
  entries: z.array(AuditEntrySchema),
  nextCursor: z.number().int().nullable(),
});
export type AuditList = z.infer<typeof AuditListSchema>;

// --- Pengaturan ----------------------------------------------------------------------

export const SettingsSchema = z.object({
  org: z.object({ name: z.string().trim().min(2).max(80) }),
  security: z.object({
    /** Umur maksimum sesi login (jam). */
    sessionTtlHours: z.number().int().min(1).max(168),
    /** Sesi berakhir bila tidak dipakai selama ini (menit). */
    idleTimeoutMinutes: z.number().int().min(5).max(1440),
    require2faForAdmins: z.boolean(),
  }),
  detection: z.object({
    suspectThreshold: z.number().min(0.1).max(1),
    agentThreshold: z.number().min(0.1).max(1),
  }),
  intel: z.object({ dailyTokenBudget: z.number().int().min(0).max(10_000_000) }),
  /** Pendaftaran mandiri di layar masuk; akun baru berperan Pemantau. */
  registration: z.object({ enabled: z.boolean() }),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const SettingsUpdateInputSchema = z
  .object({
    org: SettingsSchema.shape.org.partial(),
    security: SettingsSchema.shape.security.partial(),
    detection: SettingsSchema.shape.detection.partial(),
    intel: SettingsSchema.shape.intel.partial(),
    registration: SettingsSchema.shape.registration.partial(),
  })
  .partial();
export type SettingsUpdateInput = z.infer<typeof SettingsUpdateInputSchema>;

/** Info sensor baca-saja (tanpa secret apa pun). */
export const SensorInfoSchema = z.object({
  mode: NexaModeSchema,
  version: z.string(),
  upstreamHost: z.string(),
  publicSiteUrl: z.string().nullable(),
  honeylinkPaths: z.array(z.string()),
  suricataRunner: z.enum(['none', 'exec', 'control']),
  llmModel: z.string(),
  llmEnabled: z.boolean(),
});
export type SensorInfo = z.infer<typeof SensorInfoSchema>;

export const SettingsResponseSchema = z.object({
  settings: SettingsSchema,
  sensor: SensorInfoSchema,
  /** Budget intel harian efektif = min(pengaturan, batas paket). */
  effectiveDailyTokenBudget: z.number().int(),
  planDailyTokenLimit: z.number().int().nullable(),
});
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;

// --- Tagihan -------------------------------------------------------------------------

export const PlanLimitsSchema = z.object({
  seats: z.number().int().positive().nullable(),
  intelTokensPerDay: z.number().int().nonnegative().nullable(),
  trappedSessionsPerMonth: z.number().int().positive().nullable(),
});
export type PlanLimits = z.infer<typeof PlanLimitsSchema>;

export const PlanSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{2,32}$/),
  name: z.string(),
  /** Harga per bulan (Rupiah). null = harga khusus (tidak bisa dipilih sendiri). */
  priceIdr: z.number().int().nonnegative().nullable(),
  description: z.string(),
  limits: PlanLimitsSchema,
  features: z.array(z.string()),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PlansFileSchema = z.object({ plans: z.array(PlanSchema).min(1) });

export const SUBSCRIPTION_STATUSES = ['active', 'past_due'] as const;
export const SubscriptionSchema = z.object({
  planId: z.string(),
  status: z.enum(SUBSCRIPTION_STATUSES),
  periodStart: z.number(),
  periodEnd: z.number(),
  /** Turun paket berlaku di periode berikutnya. */
  scheduledPlanId: z.string().nullable(),
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const UsageSchema = z.object({
  periodStart: z.number(),
  periodEnd: z.number(),
  trappedSessions: z.number().int(),
  attackerTokens: z.number().int(),
  nexaTokens: z.number().int(),
  rulesApproved: z.number().int(),
  seatsUsed: z.number().int(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const INVOICE_STATUSES = ['open', 'paid', 'void'] as const;
export const InvoiceStatusSchema = z.enum(INVOICE_STATUSES);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const InvoiceLineSchema = z.object({ description: z.string(), amountIdr: z.number().int() });

export const InvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  planId: z.string(),
  planName: z.string(),
  periodStart: z.number(),
  periodEnd: z.number(),
  amountIdr: z.number().int(),
  status: InvoiceStatusSchema,
  issuedAt: z.number(),
  dueAt: z.number(),
  paidAt: z.number().nullable(),
  paidByName: z.string().nullable(),
  paymentRef: z.string().nullable(),
  lines: z.array(InvoiceLineSchema),
  overdue: z.boolean(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const BillingOverviewSchema = z.object({
  orgName: z.string(),
  plans: z.array(PlanSchema),
  subscription: SubscriptionSchema,
  usage: UsageSchema,
  invoices: z.array(InvoiceSchema),
  /** Pembayaran manual: admin mencatat pelunasan setelah transfer diterima. */
  paymentMethod: z.literal('manual'),
});
export type BillingOverview = z.infer<typeof BillingOverviewSchema>;

export const ChangePlanInputSchema = z.object({ planId: z.string().regex(/^[a-z0-9-]{2,32}$/) });
export const MarkPaidInputSchema = z.object({
  paymentRef: z
    .string()
    .trim()
    .min(3, 'referensi pembayaran minimal 3 karakter')
    .max(64)
    .regex(/^[\p{L}\p{N} ./#_-]+$/u, 'referensi mengandung karakter tidak valid'),
});
