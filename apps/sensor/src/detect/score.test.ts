import { describe, expect, it } from 'vitest';
import { classify, escalate, type ScoreConfig, type SessionSignals, scoreSession } from './score';
import { analyzeTiming } from './timing';

const cfg: ScoreConfig = { suspectThreshold: 0.6, agentThreshold: 0.85, timingFastMs: 2500 };

const noTiming = analyzeTiming([]);

function signals(over: Partial<SessionSignals> = {}): SessionSignals {
  return {
    honeylinkHits: 0,
    automationUa: false,
    missingBrowserHeaders: false,
    timing: noTiming,
    ...over,
  };
}

/** Timestamp dengan interval tetap. */
function every(ms: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => 1_000_000 + i * ms);
}

describe('scoreSession', () => {
  it('browser manusia yang membaca pelan = legit, skor 0', () => {
    const r = scoreSession(signals({ timing: analyzeTiming([0, 9_000, 31_000, 47_000]) }), cfg);
    expect(r.score).toBe(0);
    expect(r.classification).toBe('legit');
  });

  it('satu request curl (UA otomasi + tanpa header browser) belum ditandai', () => {
    const r = scoreSession(signals({ automationUa: true, missingBrowserHeaders: true }), cfg);
    expect(r.score).toBe(0.55);
    expect(r.classification).toBe('legit');
  });

  it('honeylink saja (UA mirip browser) = suspect', () => {
    const r = scoreSession(signals({ honeylinkHits: 1 }), cfg);
    expect(r.score).toBe(0.7);
    expect(r.classification).toBe('suspect');
    expect(r.reasons).toContain('honeylink');
  });

  it('honeylink + klien non-browser = agent', () => {
    const r = scoreSession(
      signals({ honeylinkHits: 1, automationUa: true, missingBrowserHeaders: true }),
      cfg,
    );
    expect(r.score).toBe(1);
    expect(r.classification).toBe('agent');
  });

  it('skrip cepat & teratur tanpa honeylink tetap tertangkap timing', () => {
    const r = scoreSession(
      signals({
        automationUa: true,
        missingBrowserHeaders: true,
        timing: analyzeTiming(every(800, 6)),
      }),
      cfg,
    );
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        'automation_ua',
        'missing_browser_headers',
        'fast_timing',
        'regular_timing',
      ]),
    );
    expect(r.score).toBe(0.9);
    expect(r.classification).toBe('agent');
  });

  it('timing cepat butuh sampel minimal sebelum dipercaya', () => {
    const r = scoreSession(signals({ timing: analyzeTiming(every(500, 3)) }), cfg);
    expect(r.reasons).not.toContain('fast_timing');
  });

  it('manusia membuka beberapa tab cepat (header browser ada) tidak jadi false positive', () => {
    const r = scoreSession(signals({ timing: analyzeTiming(every(1_000, 5)) }), cfg);
    expect(r.classification).toBe('legit');
  });

  it('skor dibatasi maksimal 1', () => {
    const r = scoreSession(
      signals({
        honeylinkHits: 3,
        automationUa: true,
        missingBrowserHeaders: true,
        timing: analyzeTiming(every(300, 8)),
      }),
      cfg,
    );
    expect(r.score).toBe(1);
  });

  it('ambang dapat dikonfigurasi', () => {
    const strict = { ...cfg, suspectThreshold: 0.5 };
    const r = scoreSession(signals({ automationUa: true, missingBrowserHeaders: true }), strict);
    expect(r.classification).toBe('suspect');
  });
});

describe('classify & escalate', () => {
  it('memetakan skor ke klasifikasi', () => {
    expect(classify(0.59, cfg)).toBe('legit');
    expect(classify(0.6, cfg)).toBe('suspect');
    expect(classify(0.85, cfg)).toBe('agent');
  });

  it('klasifikasi tidak pernah turun', () => {
    expect(escalate('agent', 'legit')).toBe('agent');
    expect(escalate('suspect', 'agent')).toBe('agent');
    expect(escalate('legit', 'suspect')).toBe('suspect');
  });
});
