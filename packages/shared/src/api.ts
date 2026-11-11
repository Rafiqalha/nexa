// Kontrak API sensor <-> dashboard. Server memvalidasi setiap respons dengan skema ini
// sebelum dikirim; klien memvalidasi ulang saat menerima.
import { z } from 'zod';
import {
  CanaryKindSchema,
  ClassificationSchema,
  EventKindSchema,
  IntelSourceSchema,
  IntelStatusSchema,
  RuleSourceSchema,
  RuleStatusSchema,
  SessionStatusSchema,
} from './enums';

export const LAB_LABEL = 'Data simulasi lab';

export const CostSchema = z.object({
  /** Estimasi token yang dibakar penyerang (karakter umpan / rasio karakter-per-token). */
  attackerTokens: z.number().int().nonnegative(),
  attackerIdr: z.number().nonnegative(),
  /** Token yang dipakai NEXA sendiri (intel LLM pasca-sesi). */
  nexaTokens: z.number().int().nonnegative(),
  nexaIdr: z.number().nonnegative(),
  attackerModel: z.string(),
  attackerPriceIdrPerMTok: z.number().nonnegative(),
  nexaModel: z.string(),
  nexaPriceIdrPerMTok: z.number().nonnegative(),
  charsPerToken: z.number().positive(),
  pricingNote: z.string(),
});
export type Cost = z.infer<typeof CostSchema>;

export const SummarySchema = z.object({
  trappedSessions: z.number().int().nonnegative(),
  avgHoldSeconds: z.number().nonnegative(),
  maxDepth: z.number().int().nonnegative(),
  rulesPending: z.number().int().nonnegative(),
  /** Draf yang masih menunggu `suricata -T`; tidak ditampilkan sampai tervalidasi (§2.5). */
  rulesValidating: z.number().int().nonnegative(),
});
export type Summary = z.infer<typeof SummarySchema>;

export const SessionSummarySchema = z.object({
  id: z.string(),
  sourceIp: z.string(),
  userAgent: z.string(),
  classification: ClassificationSchema,
  status: SessionStatusSchema,
  score: z.number(),
  reasons: z.array(z.string()),
  firstSeenAt: z.number(),
  lastSeenAt: z.number(),
  trappedAt: z.number().nullable(),
  endedAt: z.number().nullable(),
  requestCount: z.number().int(),
  maxDepth: z.number().int(),
  baitServed: z.number().int(),
  estTokens: z.number().int(),
  holdSeconds: z.number().nonnegative(),
  canariesIssued: z.number().int(),
  canariesTriggered: z.number().int(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const TimelineEventSchema = z.object({
  id: z.number().int(),
  sessionId: z.string(),
  ts: z.number(),
  kind: EventKindSchema,
  method: z.string(),
  path: z.string(),
  status: z.number().int().nullable(),
  charsServed: z.number().int(),
  estTokens: z.number().int(),
  latencyMs: z.number().int(),
  meta: z.record(z.string(), z.unknown()),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const CanarySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  kind: CanaryKindSchema,
  /** Token disamarkan sebagian di API (tidak pernah dikirim utuh ke dashboard). */
  tokenHint: z.string(),
  issuedAt: z.number(),
  issuedPath: z.string(),
  triggeredAt: z.number().nullable(),
  triggerIp: z.string().nullable(),
  triggerSessionId: z.string().nullable(),
  triggerCount: z.number().int(),
});
export type Canary = z.infer<typeof CanarySchema>;

export const RuleSchema = z.object({
  id: z.number().int(),
  sessionId: z.string().nullable(),
  kind: z.string(),
  source: RuleSourceSchema,
  title: z.string(),
  body: z.string(),
  syntaxValid: z.boolean().nullable(),
  validationOutput: z.string(),
  validatedAt: z.number().nullable(),
  status: RuleStatusSchema,
  decidedBy: z.string().nullable(),
  decidedAt: z.number().nullable(),
  deployedAt: z.number().nullable(),
  deployError: z.string().nullable(),
  createdAt: z.number(),
});
export type Rule = z.infer<typeof RuleSchema>;

export const IntelSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: IntelStatusSchema,
  source: IntelSourceSchema,
  summary: z.string(),
  suspectedModel: z.string(),
  confidence: z.number().min(0).max(1),
  capturedPrompt: z.string().nullable(),
  patterns: z.array(z.string()),
  tokensUsed: z.number().int(),
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Intel = z.infer<typeof IntelSchema>;

export const OverviewSchema = z.object({
  label: z.literal(LAB_LABEL),
  generatedAt: z.number(),
  sensor: z.object({ startedAt: z.number(), upstreamHost: z.string() }),
  cost: CostSchema,
  summary: SummarySchema,
  contacts: z.array(SessionSummarySchema),
  pendingRules: z.array(RuleSchema),
});
export type Overview = z.infer<typeof OverviewSchema>;

export const SessionListSchema = z.object({ sessions: z.array(SessionSummarySchema) });
export type SessionList = z.infer<typeof SessionListSchema>;

export const SessionDetailSchema = z.object({
  session: SessionSummarySchema,
  events: z.array(TimelineEventSchema),
  canaries: z.array(CanarySchema),
  rules: z.array(RuleSchema),
  intel: IntelSchema.nullable(),
});
export type SessionDetail = z.infer<typeof SessionDetailSchema>;

export const RuleListSchema = z.object({ rules: z.array(RuleSchema) });
export type RuleList = z.infer<typeof RuleListSchema>;

export const IntelListSchema = z.object({
  items: z.array(z.object({ intel: IntelSchema, session: SessionSummarySchema })),
  budget: z.object({ date: z.string(), tokensUsed: z.number().int(), limit: z.number().int() }),
});
export type IntelList = z.infer<typeof IntelListSchema>;

export const DecisionInputSchema = z.object({
  operator: z
    .string()
    .trim()
    .min(2, 'nama operator minimal 2 karakter')
    .max(64)
    .regex(/^[\p{L}\p{N} ._'-]+$/u, 'nama operator mengandung karakter tidak valid'),
});
export type DecisionInput = z.infer<typeof DecisionInputSchema>;

export const ApiErrorSchema = z.object({ error: z.string(), message: z.string().optional() });

/** Pesan SSE `/api/stream`. */
export const StreamMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('overview'), data: OverviewSchema }),
  z.object({ type: z.literal('session'), data: SessionSummarySchema }),
  z.object({ type: z.literal('event'), data: TimelineEventSchema }),
  z.object({ type: z.literal('rule'), data: RuleSchema }),
  z.object({ type: z.literal('intel'), data: z.object({ sessionId: z.string() }) }),
]);
export type StreamMessage = z.infer<typeof StreamMessageSchema>;
