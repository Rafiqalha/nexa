import type { TimelineEvent } from '@nexa/shared';
import { formatDelta, formatInt, formatTimeWib } from '../lib/format';
import { ARM, EVENT_KIND } from '../lib/labels';
import { cn } from '../lib/utils';

function kindClass(kind: TimelineEvent['kind']): string {
  if (kind === 'honeylink_hit' || kind === 'canary_triggered') return 'text-status-trapped';
  if (kind === 'interrogation_reply') return 'text-status-suspect';
  if (kind === 'bait_served' || kind === 'canary_issued') return 'text-fg';
  return 'text-muted';
}

/**
 * Linimasa agen di dalam labirin (DESIGN.md §7.2): langkah, umpan yang disajikan,
 * token per langkah, canary. Daftar terurut (ol) agar urutan terbaca pembaca layar.
 */
export function SessionTimeline({ events }: { events: readonly TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="border-t border-line py-6 text-muted">Belum ada langkah tercatat.</p>;
  }
  let cumulative = 0;
  return (
    <ol className="border-t border-line">
      {events.map((e, i) => {
        cumulative += e.estTokens;
        const prev = events[i - 1];
        const arm = typeof e.meta.arm === 'string' ? (ARM[e.meta.arm] ?? e.meta.arm) : null;
        return (
          <li
            key={e.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-1 border-b border-line-subtle py-[14px] sm:grid-cols-[88px_minmax(0,1fr)_auto]"
          >
            <div className="font-mono text-[12px] text-muted">
              <span className="text-fg-2">{String(i + 1).padStart(2, '0')}</span>{' '}
              {formatTimeWib(e.ts)}
              <span className="block">{prev ? formatDelta(e.ts - prev.ts) : 'awal'}</span>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[13px] break-all text-fg">
                <span className="text-muted">{e.method}</span> {e.path}
              </p>
              <p className="mt-1 text-[12px]">
                <span className={cn(kindClass(e.kind))}>{EVENT_KIND[e.kind]}</span>
                {typeof e.meta.mcp === 'string' ? (
                  <span className="text-muted">
                    {' '}
                    · MCP umpan {e.meta.mcp}
                    {typeof e.meta.tool === 'string' ? ` ${e.meta.tool}` : ''}
                  </span>
                ) : null}
                {arm ? <span className="text-muted"> · {arm}</span> : null}
                {typeof e.meta.depth === 'number' ? (
                  <span className="text-muted"> · kedalaman {e.meta.depth}</span>
                ) : null}
                {e.status ? <span className="text-muted"> · HTTP {e.status}</span> : null}
              </p>
              {e.kind === 'canary_issued' || e.kind === 'canary_triggered' ? (
                <p className="mt-1 font-mono text-[12px] text-muted">
                  {String(e.meta.canaryKind ?? '')} {String(e.meta.tokenHint ?? '')}
                  {e.kind === 'canary_triggered'
                    ? ` · dipakai dari ${String(e.meta.triggerIp ?? '?')}${e.meta.crossSession ? ' (sesi lain)' : ''} · infrastruktur yang dipakai penyerang`
                    : ''}
                </p>
              ) : null}
            </div>
            <div className="col-start-2 row-start-1 text-right font-mono text-[13px] sm:col-start-3">
              <span className="text-fg">{formatInt(e.estTokens)}</span>
              <span className="block text-[12px] text-muted">Σ {formatInt(cumulative)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
