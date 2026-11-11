import {
  type Rule,
  SessionDetailSchema,
  SessionListSchema,
  type SessionSummary,
} from '@nexa/shared';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ContactsTable } from '../components/ContactsTable';
import { PageHeader } from '../components/PageHeader';
import { RuleItem } from '../components/RuleItem';
import { useRuleDecision } from '../components/RulesPanel';
import { SessionTimeline } from '../components/SessionTimeline';
import { StatusText } from '../components/StatusText';
import { ApiError, apiGet } from '../lib/api';
import { useCan } from '../lib/auth';
import { formatDateTimeWib, formatDuration, formatInt, formatScore } from '../lib/format';
import { CLASSIFICATION, REASONS } from '../lib/labels';
import { navItem } from '../lib/nav';
import { HREF } from '../lib/router';
import { setDetail, setSessions, useAppState } from '../lib/store';

function SessionList() {
  const { sessions } = useAppState();
  const [showLegit, setShowLegit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet(`/api/sessions?limit=200${showLegit ? '' : '&flagged=1'}`, SessionListSchema)
      .then((r) => setSessions(r.sessions))
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Gagal memuat sesi.'));
  }, [showLegit]);

  const list = useMemo(
    () =>
      [...sessions.values()]
        .filter((s) => showLegit || s.classification !== 'legit')
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [sessions, showLegit],
  );

  return (
    <section aria-label="Daftar sesi" className="flex flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3 text-[13px] text-fg-2">
        <input
          type="checkbox"
          className="size-4 accent-[var(--text-2)]"
          checked={showLegit}
          onChange={(e) => setShowLegit(e.target.checked)}
        />
        Tampilkan juga sesi sah
      </label>
      {error ? <p className="text-status-trapped">{error}</p> : null}
      <ContactsTable sessions={list} empty="Belum ada sesi terdeteksi." />
    </section>
  );
}

function Fact({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="label-caps">{label}</dt>
      <dd
        className={
          mono ? 'mt-2 font-mono text-[13px] break-all text-fg' : 'mt-2 text-[14px] text-fg'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function SessionDetailView({ id }: { id: string }) {
  const { details } = useAppState();
  const detail = details.get(id);
  const [error, setError] = useState<string | null>(null);
  const { busyId, error: decisionError, decide } = useRuleDecision();
  const canDecide = useCan('rules:decide');

  useEffect(() => {
    apiGet(`/api/sessions/${id}`, SessionDetailSchema)
      .then(setDetail)
      .catch((e: unknown) =>
        setError(
          e instanceof ApiError && e.status === 404
            ? 'Sesi tidak ditemukan.'
            : 'Gagal memuat sesi.',
        ),
      );
  }, [id]);

  if (error) return <p className="text-status-trapped">{error}</p>;
  if (!detail) return <p className="text-muted">Memuat linimasa…</p>;
  const s: SessionSummary = detail.session;
  const triggered = detail.canaries.filter((c) => c.triggeredAt !== null);

  return (
    <div className="flex flex-col gap-12">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-8">
        <Fact label="Alamat" value={s.sourceIp} />
        <Fact label="Status" value={<StatusText status={s.status} />} mono={false} />
        <Fact
          label="Klasifikasi"
          value={`${CLASSIFICATION[s.classification]} · skor ${formatScore(s.score)}`}
          mono={false}
        />
        <Fact label="Tertahan" value={formatDuration(s.holdSeconds)} />
        <Fact label="Kedalaman maks." value={formatInt(s.maxDepth)} />
        <Fact label="Token dibakar (est.)" value={formatInt(s.estTokens)} />
        <Fact label="Umpan disajikan" value={formatInt(s.baitServed)} />
        <Fact label="Canary dipakai" value={`${s.canariesTriggered} dari ${s.canariesIssued}`} />
      </dl>
      <div className="grid gap-6 border-t border-line pt-6 md:grid-cols-2">
        <Fact label="User-Agent" value={s.userAgent || '(kosong)'} />
        <Fact
          label="Sinyal deteksi"
          value={s.reasons.map((r) => REASONS[r] ?? r).join(' · ') || '—'}
          mono={false}
        />
        <Fact label="Pertama terlihat" value={formatDateTimeWib(s.firstSeenAt)} />
        <Fact label="Terakhir terlihat" value={formatDateTimeWib(s.lastSeenAt)} />
      </div>

      {triggered.length > 0 ? (
        <section aria-labelledby="canary-title">
          <h2 id="canary-title" className="mb-4 text-[16px] font-medium">
            Canary dipakai — infrastruktur yang dipakai penyerang
          </h2>
          <ul className="border-t border-line">
            {triggered.map((c) => (
              <li
                key={c.id}
                className="border-b border-line-subtle py-[14px] font-mono text-[13px]"
              >
                <span className="text-status-trapped">{c.kind}</span> {c.tokenHint} · dari{' '}
                {c.triggerIp ?? '?'} · {c.triggeredAt ? formatDateTimeWib(c.triggeredAt) : ''} ·{' '}
                {c.triggerCount}×
              </li>
            ))}
          </ul>
          <p className="meta mt-2">
            Alamat pemakai canary menandai infrastruktur yang dipakai penyerang (bisa proxy atau
            korban lain), bukan "C2 asli".
          </p>
        </section>
      ) : null}

      <section aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="mb-4 text-[16px] font-medium">
          Linimasa di dalam labirin
        </h2>
        <SessionTimeline events={detail.events} />
      </section>

      {detail.rules.length > 0 ? (
        <section aria-labelledby="rules-title">
          <h2 id="rules-title" className="mb-4 text-[16px] font-medium">
            Draf aturan dari sesi ini
          </h2>
          {decisionError ? <p className="text-status-trapped">{decisionError}</p> : null}
          <div className="border-t border-line">
            {detail.rules.map((r) => (
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
        </section>
      ) : null}
    </div>
  );
}

export function Sesi({ id }: { id: string | null }) {
  const nav = navItem('sesi');
  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={id ? 'Linimasa sesi' : nav.title} icon={nav.icon}>
        {id ? (
          <a
            href={HREF.sesi}
            className="group flex min-h-11 items-center gap-2 py-3 text-[13px] text-fg-2 transition-colors hover:text-fg"
          >
            <ArrowLeft
              aria-hidden="true"
              strokeWidth={1.75}
              className="size-4 transition-transform duration-200 group-hover:-translate-x-1"
            />
            Semua sesi
          </a>
        ) : null}
      </PageHeader>
      {id ? <SessionDetailView id={id} /> : <SessionList />}
    </div>
  );
}
