import type { Classification } from '@nexa/shared';
import type { TimingStats } from './timing';

/** Sinyal kumulatif satu sesi. */
export interface SessionSignals {
  honeylinkHits: number;
  automationUa: boolean;
  missingBrowserHeaders: boolean;
  timing: TimingStats;
}

export interface ScoreConfig {
  suspectThreshold: number;
  agentThreshold: number;
  timingFastMs: number;
}

export type ScoreReason =
  | 'honeylink'
  | 'automation_ua'
  | 'missing_browser_headers'
  | 'fast_timing'
  | 'regular_timing';

/**
 * Bobot sinyal. Honeylink adalah sinyal terkuat (tidak terlihat manusia); sinyal lain
 * hanya pendukung sehingga satu request curl/skrip tunggal tidak langsung ditandai.
 */
export const WEIGHTS: Readonly<Record<ScoreReason, number>> = {
  honeylink: 0.7,
  automation_ua: 0.35,
  missing_browser_headers: 0.2,
  fast_timing: 0.25,
  regular_timing: 0.1,
};

/** Minimal interval sebelum sinyal timing dipercaya. */
export const MIN_TIMING_SAMPLES = 3;
export const MIN_REGULARITY_SAMPLES = 4;
export const REGULAR_CV_MAX = 0.35;

export interface ScoreResult {
  score: number;
  classification: Classification;
  reasons: ScoreReason[];
}

export function classify(score: number, cfg: ScoreConfig): Classification {
  if (score >= cfg.agentThreshold) return 'agent';
  if (score >= cfg.suspectThreshold) return 'suspect';
  return 'legit';
}

export function scoreSession(s: SessionSignals, cfg: ScoreConfig): ScoreResult {
  const reasons: ScoreReason[] = [];
  if (s.honeylinkHits > 0) reasons.push('honeylink');
  if (s.automationUa) reasons.push('automation_ua');
  if (s.missingBrowserHeaders) reasons.push('missing_browser_headers');
  const { samples, medianIntervalMs, cv } = s.timing;
  if (
    samples >= MIN_TIMING_SAMPLES &&
    medianIntervalMs !== null &&
    medianIntervalMs < cfg.timingFastMs
  ) {
    reasons.push('fast_timing');
  }
  if (samples >= MIN_REGULARITY_SAMPLES && cv !== null && cv < REGULAR_CV_MAX) {
    reasons.push('regular_timing');
  }
  const raw = reasons.reduce((sum, r) => sum + WEIGHTS[r], 0);
  const score = Math.min(1, Math.round(raw * 100) / 100);
  return { score, classification: classify(score, cfg), reasons };
}

const RANK: Readonly<Record<Classification, number>> = { legit: 0, suspect: 1, agent: 2 };

/** Klasifikasi sesi hanya bisa naik, tidak pernah turun, selama sesi berjalan. */
export function escalate(prev: Classification, next: Classification): Classification {
  return RANK[next] > RANK[prev] ? next : prev;
}
