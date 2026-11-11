import { type Rule, RuleSchema } from '@nexa/shared';
import { useState } from 'react';
import { ApiError, apiPost } from '../lib/api';
import { useCan } from '../lib/auth';
import { upsertRule } from '../lib/store';
import { RuleItem } from './RuleItem';

/**
 * Keputusan operator dikirim ke sensor; deploy hanya terjadi di sisi server setelah approval.
 * Nama pencatat diambil server dari akun yang masuk (bukan dari isian klien).
 */
export function useRuleDecision() {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(rule: Rule, action: 'approve' | 'reject') {
    setBusyId(rule.id);
    setError(null);
    try {
      const updated = await apiPost(`/api/rules/${rule.id}/${action}`, {}, RuleSchema);
      upsertRule(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Gagal mengirim keputusan.');
    } finally {
      setBusyId(null);
    }
  }
  return { busyId, error, decide };
}

export function RulesPanel({ rules }: { rules: readonly Rule[] }) {
  const { busyId, error, decide } = useRuleDecision();
  const canDecide = useCan('rules:decide');
  if (rules.length === 0) {
    return (
      <p className="border-t border-line py-6 text-[14px] text-muted">
        Belum ada draf aturan. Draf muncul otomatis setelah sesi jebakan berakhir dan lolos validasi
        suricata -T.
      </p>
    );
  }
  return (
    <div className="border-t border-line">
      {error ? (
        <p role="alert" className="py-3 text-[13px] text-status-trapped">
          {error}
        </p>
      ) : null}
      {rules.map((r) => (
        <RuleItem
          key={r.id}
          rule={r}
          busy={busyId === r.id}
          {...(canDecide
            ? {
                onApprove: (rule: Rule) => void decide(rule, 'approve'),
                onReject: (rule: Rule) => void decide(rule, 'reject'),
              }
            : {})}
        />
      ))}
    </div>
  );
}
