import { z } from 'zod';

/** Klasifikasi sesi oleh detect/. */
export const CLASSIFICATIONS = ['legit', 'suspect', 'agent'] as const;
export const ClassificationSchema = z.enum(CLASSIFICATIONS);
export type Classification = z.infer<typeof ClassificationSchema>;

/**
 * Siklus hidup sesi.
 * - active: sesi sah yang sedang diamati
 * - suspect: sudah ditandai, belum disajikan labirin
 * - trapped: dibelokkan ke labirin
 * - exited: berakhir (idle timeout)
 */
export const SESSION_STATUSES = ['active', 'suspect', 'trapped', 'exited'] as const;
export const SessionStatusSchema = z.enum(SESSION_STATUSES);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const EVENT_KINDS = [
  'request',
  'bait_served',
  'honeylink_hit',
  'canary_issued',
  'canary_triggered',
  'interrogation_reply',
] as const;
export const EventKindSchema = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof EventKindSchema>;

export const CANARY_KINDS = ['credential', 'document', 'api_key'] as const;
export const CanaryKindSchema = z.enum(CANARY_KINDS);
export type CanaryKind = z.infer<typeof CanaryKindSchema>;

export const RULE_STATUSES = ['draft', 'approved', 'rejected', 'deployed'] as const;
export const RuleStatusSchema = z.enum(RULE_STATUSES);
export type RuleStatus = z.infer<typeof RuleStatusSchema>;

export const RULE_SOURCES = ['template', 'llm'] as const;
export const RuleSourceSchema = z.enum(RULE_SOURCES);
export type RuleSource = z.infer<typeof RuleSourceSchema>;

export const INTEL_SOURCES = ['llm', 'heuristic'] as const;
export const IntelSourceSchema = z.enum(INTEL_SOURCES);
export type IntelSource = z.infer<typeof IntelSourceSchema>;

export const INTEL_STATUSES = ['queued', 'done', 'skipped_budget', 'error'] as const;
export const IntelStatusSchema = z.enum(INTEL_STATUSES);
export type IntelStatus = z.infer<typeof IntelStatusSchema>;
