import { RuleListSchema } from '@nexa/shared';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { RuleItem } from '../components/RuleItem';
import { useRuleDecision } from '../components/RulesPanel';
import { ApiError, apiGet } from '../lib/api';
import { navItem } from '../lib/nav';
import { setRules, useAppState } from '../lib/store';

/** Aturan (DESIGN.md §7.4): semua draf, status validasi, riwayat setuju/tolak, siapa & kapan. */
export function Aturan() {
  const { rules } = useAppState();
  const [error, setError] = useState<string | null>(null);
  const { busyId, error: decisionError, decide } = useRuleDecision();

  useEffect(() => {
    apiGet('/api/rules', RuleListSchema)
      .then((r) => setRules(r.rules))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Gagal memuat aturan.'));
  }, []);

  const list = useMemo(() => [...rules.values()].sort((a, b) => b.id - a.id), [rules]);
  const pending = list.filter((r) => r.status === 'draft');
  const history = list.filter((r) => r.status !== 'draft');

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={navItem('aturan').title} icon={navItem('aturan').icon} />
      {error ? <p className="text-status-trapped">{error}</p> : null}
      {decisionError ? <p className="text-status-trapped">{decisionError}</p> : null}
      <section aria-labelledby="pending-title">
        <h2 id="pending-title" className="mb-4 text-[16px] font-medium">
          Menunggu persetujuan
        </h2>
        {pending.length === 0 ? (
          <p className="border-t border-line py-6 text-muted">Tidak ada draf yang menunggu.</p>
        ) : (
          <div className="border-t border-line">
            {pending.map((r) => (
              <RuleItem
                key={r.id}
                rule={r}
                busy={busyId === r.id}
                onApprove={(rule) => void decide(rule, 'approve')}
                onReject={(rule) => void decide(rule, 'reject')}
              />
            ))}
          </div>
        )}
      </section>
      <section aria-labelledby="history-title">
        <h2 id="history-title" className="mb-4 text-[16px] font-medium">
          Riwayat keputusan
        </h2>
        {history.length === 0 ? (
          <p className="border-t border-line py-6 text-muted">Belum ada keputusan.</p>
        ) : (
          <div className="border-t border-line">
            {history.map((r) => (
              <RuleItem key={r.id} rule={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
