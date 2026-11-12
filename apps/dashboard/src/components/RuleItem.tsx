import type { Rule } from '@nexa/shared';
import { Check, X } from 'lucide-react';
import { formatDateTimeWib } from '../lib/format';
import { useChangeCount } from '../lib/motion';
import { sessionHref } from '../lib/router';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const STATUS_LABEL: Record<Rule['status'], { label: string; className: string }> = {
  draft: { label: 'Menunggu persetujuan', className: 'text-status-suspect' },
  approved: { label: 'Disetujui', className: 'text-fg-2' },
  deployed: { label: 'Aktif di Suricata', className: 'text-fg' },
  rejected: { label: 'Ditolak', className: 'text-status-neutral' },
};

/** Satu segmen metadata rule, diawali pemisah "·" redup selebar 3 karakter mono. */
const META_SEGMENT =
  "inline-block whitespace-nowrap before:inline-block before:w-[3ch] before:text-center before:text-muted before:content-['·']";

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
  // Keputusan operator (setujui/tolak/deploy) ditandai kedipan singkat pada blok rule.
  const decided = useChangeCount(rule.status);
  return (
    <article
      key={decided}
      className={cn(
        'border-b border-line py-5 transition-colors duration-200',
        decided > 0 && 'nx-flash',
      )}
    >
      <p className="text-[14px] text-fg">{rule.title || `Draf rule #${rule.id}`}</p>
      <pre className="mt-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]">
        {rule.body}
      </pre>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/* Segmen tidak terpotong; baris digeser −3ch dan dipangkas, jadi pemisah "·" di awal
            tiap baris jatuh di luar kotak dan tidak pernah menggantung saat panel sempit. */}
        <div className="min-w-0 overflow-hidden">
          <p className="meta -ml-[3ch]">
            <span className={META_SEGMENT}>
              {rule.sessionId ? (
                <a href={sessionHref(rule.sessionId)} className="transition-colors hover:text-fg">
                  sesi {rule.sessionId.slice(0, 8)}
                </a>
              ) : (
                'tanpa sesi'
              )}
            </span>
            <span className={cn(META_SEGMENT, v.className)}>{v.text}</span>
            <span className={cn(META_SEGMENT, status.className)}>{status.label}</span>
            {rule.decidedBy && rule.decidedAt ? (
              <span className={META_SEGMENT}>
                {`${rule.decidedBy}, ${formatDateTimeWib(rule.decidedAt)}`}
              </span>
            ) : null}
          </p>
        </div>
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
              <Check aria-hidden="true" strokeWidth={2} className="nx-draw size-4" />
              Setujui
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => onReject?.(rule)}>
              <X aria-hidden="true" strokeWidth={2} className="size-4" />
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
