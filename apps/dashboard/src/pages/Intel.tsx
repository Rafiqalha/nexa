import { type IntelList, IntelListSchema } from '@nexa/shared';
import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { ApiError, apiGet } from '../lib/api';
import { formatDateTimeWib, formatInt } from '../lib/format';
import { CLASSIFICATION } from '../lib/labels';
import { useAppState } from '../lib/store';

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  done: { text: 'selesai', className: 'text-fg-2' },
  queued: { text: 'dalam antrean', className: 'text-status-suspect' },
  skipped_budget: { text: 'dilewati: budget LLM harian habis', className: 'text-status-suspect' },
  error: { text: 'LLM gagal, memakai heuristik', className: 'text-status-trapped' },
};

/** Intel (DESIGN.md §7.3): dugaan model + keyakinan, pola serangan, tangkapan eksperimental. */
export function Intel() {
  const { intelVersion } = useAppState();
  const [data, setData] = useState<IntelList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void intelVersion;
    apiGet('/api/intel', IntelListSchema)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof ApiError ? e.message : 'Gagal memuat intel.'));
  }, [intelVersion]);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title="Intel" />
      {data ? (
        <p className="meta -mt-8">
          Budget LLM hari ini ({data.budget.date}): {formatInt(data.budget.tokensUsed)} /{' '}
          {formatInt(data.budget.limit)} token · ringkasan dibuat pasca-sesi lewat antrean, data
          disamarkan sebelum dikirim ke model
        </p>
      ) : null}
      {error ? <p className="text-status-trapped">{error}</p> : null}
      {data && data.items.length === 0 ? (
        <p className="border-t border-line py-6 text-muted">
          Belum ada intel. Ringkasan muncul setelah sesi jebakan berakhir.
        </p>
      ) : null}
      <div className="border-t border-line">
        {data?.items.map(({ intel, session }) => {
          const status = STATUS_LABEL[intel.status] ?? STATUS_LABEL.done;
          return (
            <article key={intel.id} className="border-b border-line py-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <a
                  href={`#/kontak/${session.id}`}
                  className="font-mono text-[13px] text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
                >
                  {session.sourceIp} · sesi {session.id.slice(0, 8)}
                </a>
                <span className="meta">
                  {CLASSIFICATION[session.classification]} · {formatDateTimeWib(intel.updatedAt)}
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
                <div>
                  <dt className="label-caps">Dugaan model / framework</dt>
                  <dd className="mt-2 text-[14px] text-fg">{intel.suspectedModel || '—'}</dd>
                </div>
                <div>
                  <dt className="label-caps">Keyakinan</dt>
                  <dd className="mt-2 font-mono text-[13px] text-fg">
                    {Math.round(intel.confidence * 100)}%
                  </dd>
                </div>
                <div>
                  <dt className="label-caps">Sumber</dt>
                  <dd className="mt-2 text-[14px] text-fg-2">
                    {intel.source === 'llm'
                      ? `LLM pasca-sesi · ${formatInt(intel.tokensUsed)} token`
                      : 'Heuristik (tanpa LLM)'}
                    <span className={`block text-[12px] ${status?.className ?? ''}`}>
                      {status?.text}
                    </span>
                  </dd>
                </div>
              </dl>
              <p className="mt-5 max-w-[72ch] text-[14px] text-fg-2">{intel.summary}</p>
              {intel.patterns.length > 0 ? (
                <ul className="mt-4 list-disc pl-5 text-[13px] text-fg-2">
                  {intel.patterns.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              ) : null}
              {intel.capturedPrompt ? (
                <div className="mt-5">
                  <p className="label-caps">Tangkapan interogasi · eksperimental</p>
                  <pre className="mt-2 font-mono text-[12px] whitespace-pre-wrap text-fg-2 [overflow-wrap:anywhere]">
                    {intel.capturedPrompt}
                  </pre>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
