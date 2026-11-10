import type { Rule } from '@nexa/shared';
import { formatDateTimeWib } from '../lib/format';
import { Button } from './ui/button';

const STATUS_LABEL: Record<Rule['status'], { label: string; className: string }> = {
  draft: { label: 'Menunggu persetujuan', className: 'text-status-suspect' },
  approved: { label: 'Disetujui', className: 'text-fg-2' },
  deployed: { label: 'Aktif di Suricata', className: 'text-fg' },
  rejected: { label: 'Ditolak', className: 'text-status-neutral' },
};

function validationText(rule: Rule): { text: string; className: string } {
  if (rule.syntaxValid === true)
    return { text: 'Sintaks valid (suricata -T)', className: 'text-fg-2' };
  if (rule.syntaxValid === false)
    return { text: 'Sintaks tidak valid', className: 'text-status-trapped' };
  return { text: 'Belum divalidasi', className: 'text-status-suspect' };
}

/** Blok rule (DESIGN.md §8.4): isi mono 12px, baris bawah sumber + validasi | Setujui/Tolak. */
export function RuleItem({
  rule,
  busy,
  onApprove,
  onReject,
}: {
  rule: Rule;
  busy?: boolean;
  onApprove?: (rule: Rule) => void;
  onReject?: (rule: Rule) => void;
}) {
  const v = validationText(rule);
  const status = STATUS_LABEL[rule.status];
  const canDecide = rule.status === 'draft' && onApprove && onReject;
  return (
    <article className="border-b border-line py-5">
      <p className="text-[14px] text-fg">{rule.title || `Draf rule #${rule.id}`}</p>
      <pre className="mt-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]">
        {rule.body}
      </pre>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="meta">
          {rule.sessionId ? (
            <a href={`#/kontak/${rule.sessionId}`} className="hover:text-fg">
              sesi {rule.sessionId.slice(0, 8)}
            </a>
          ) : (
            'tanpa sesi'
          )}
          {' · '}
          <span className={v.className}>{v.text}</span>
          {' · '}
          <span className={status.className}>{status.label}</span>
          {rule.decidedBy && rule.decidedAt
            ? ` · ${rule.decidedBy}, ${formatDateTimeWib(rule.decidedAt)}`
            : ''}
        </p>
        {canDecide ? (
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy || rule.syntaxValid !== true}
              onClick={() => onApprove?.(rule)}
              title={
                rule.syntaxValid !== true
                  ? 'Hanya rule bersintaks valid yang bisa disetujui'
                  : undefined
              }
            >
              Setujui
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onReject?.(rule)}>
              Tolak
            </Button>
          </div>
        ) : null}
      </div>
      {rule.deployError ? (
        <p className="meta mt-2 text-status-trapped">Gagal deploy: {rule.deployError}</p>
      ) : null}
    </article>
  );
}
