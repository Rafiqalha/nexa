// Tagihan & paket (Admin): paket aktif, pemakaian periode berjalan vs kuota, pilihan paket
// (naik = prorata langsung, turun = periode berikutnya), dan invoice dengan pencatatan
// pelunasan MANUAL (tanpa payment gateway; NEXA tidak menyimpan data kartu/rekening).
import {
  type BillingOverview,
  BillingOverviewSchema,
  type Invoice,
  InvoiceSchema,
  type Plan,
  SubscriptionSchema,
} from '@nexa/shared';
import { CircleCheck } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Field, FormNotice, inputClass, Section } from '../components/form';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { apiGet, apiPost, errorMessage } from '../lib/api';
import { formatDateWib, formatInt, formatRupiah } from '../lib/format';
import { INVOICE_STATUS, TONE_CLASS } from '../lib/labels';
import { staggerStyle } from '../lib/motion';
import { navItem } from '../lib/nav';
import { cn } from '../lib/utils';

function Meter({
  label,
  value,
  limit,
  unit,
  note,
  index,
}: {
  label: string;
  value: number;
  limit: number | null;
  unit: string;
  note?: string;
  index: number;
}) {
  const pct = limit ? Math.min(100, Math.round((value / limit) * 100)) : null;
  const over = limit !== null && value > limit;
  return (
    <div className="nx-row min-w-0 border-l border-line-subtle pl-4" style={staggerStyle(index)}>
      <p className="label-caps">{label}</p>
      <p className="mt-3 font-mono text-[24px] leading-none text-fg">
        {formatInt(value)}
        <span className="ml-2 font-sans text-[13px] text-muted">
          {limit === null ? unit : `/ ${formatInt(limit)} ${unit}`}
        </span>
      </p>
      {pct !== null ? (
        <div className="mt-3 h-[2px] w-full bg-line" aria-hidden="true">
          <div
            className={cn(
              'h-full transition-[width] duration-700 ease-out',
              over ? 'bg-status-trapped' : 'bg-fg-2',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
      <p className={cn('meta mt-2', over && 'text-status-trapped')}>
        {over
          ? 'Melebihi kuota paket (sensor tetap melindungi).'
          : (note ?? (pct === null ? 'tanpa batas' : `${pct}% kuota`))}
      </p>
    </div>
  );
}

function PayForm({ invoice, onPaid }: { invoice: Invoice; onPaid: () => void }) {
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/billing/invoices/${invoice.id}/pay`, { paymentRef: ref }, InvoiceSchema);
      onPaid();
    } catch (err) {
      setError(errorMessage(err, 'Gagal mencatat pelunasan.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <Field label="Referensi transfer" className="min-w-[180px] flex-1">
        <input
          className={inputClass}
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          required
          minLength={3}
        />
      </Field>
      <Button type="submit" disabled={busy}>
        <CircleCheck aria-hidden="true" strokeWidth={2} className="size-4" />
        Catat lunas
      </Button>
      {error ? <p className="w-full text-[13px] text-status-trapped">{error}</p> : null}
    </form>
  );
}

export function Tagihan() {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Plan | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = navItem('tagihan');

  const load = useCallback(() => {
    apiGet('/api/billing', BillingOverviewSchema)
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err, 'Gagal memuat tagihan.')));
  }, []);
  useEffect(load, [load]);

  if (!data) {
    return (
      <div className="flex flex-col gap-12">
        <PageHeader title={nav.title} icon={nav.icon} />
        {error ? (
          <p className="text-status-trapped">{error}</p>
        ) : (
          <p className="meta">Memuat tagihan…</p>
        )}
      </div>
    );
  }

  const { subscription: sub, usage, plans } = data;
  const current = plans.find((p) => p.id === sub.planId) ?? (plans[0] as Plan);
  const scheduled = plans.find((p) => p.id === sub.scheduledPlanId) ?? null;
  const price = (p: Plan) => p.priceIdr ?? 0;

  async function changePlan(p: Plan) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const s = await apiPost('/api/billing/plan', { planId: p.id }, SubscriptionSchema);
      setNotice(
        s.planId === p.id
          ? `Paket ${p.name} aktif. Invoice prorata untuk sisa periode sudah dibuat.`
          : s.scheduledPlanId === p.id
            ? `Paket ${p.name} berlaku mulai ${formatDateWib(s.periodEnd)}.`
            : 'Perubahan paket dibatalkan.',
      );
      setConfirm(null);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Gagal mengubah paket.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={nav.title} icon={nav.icon} />
      {error ? (
        <p role="alert" className="text-[13px] text-status-trapped">
          {error}
        </p>
      ) : null}
      <FormNotice message={notice} />

      <Section
        id="paket-aktif"
        title={`Paket ${current.name}`}
        description={`${data.orgName} · periode ${formatDateWib(sub.periodStart)} – ${formatDateWib(sub.periodEnd - 1)} (WIB)`}
        action={
          <p
            className={cn(
              'text-[14px]',
              sub.status === 'past_due' ? 'text-status-trapped' : 'text-fg-2',
            )}
          >
            {sub.status === 'past_due' ? 'Ada invoice lewat jatuh tempo' : 'Langganan aktif'}
          </p>
        }
      >
        {scheduled ? (
          <div className="flex flex-wrap items-center gap-3 text-[14px] text-fg-2">
            Turun ke paket {scheduled.name} dijadwalkan mulai {formatDateWib(sub.periodEnd)}.
            <Button variant="secondary" disabled={busy} onClick={() => void changePlan(current)}>
              Batalkan
            </Button>
          </div>
        ) : null}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-8">
          <Meter
            index={0}
            label="Sesi terjebak"
            value={usage.trappedSessions}
            limit={current.limits.trappedSessionsPerMonth}
            unit="sesi"
          />
          <Meter
            index={1}
            label="Kursi pengguna"
            value={usage.seatsUsed}
            limit={current.limits.seats}
            unit="pengguna"
            note="Pemantau tidak memakai kursi"
          />
          <Meter
            index={2}
            label="Token intel NEXA"
            value={usage.nexaTokens}
            limit={null}
            unit="token"
            note={
              current.limits.intelTokensPerDay === null
                ? 'tanpa batas harian'
                : `batas ${formatInt(current.limits.intelTokensPerDay)} token per hari`
            }
          />
          <Meter
            index={3}
            label="Token dibakar penyerang"
            value={usage.attackerTokens}
            limit={null}
            unit="token"
            note="estimasi batas bawah"
          />
          <Meter
            index={4}
            label="Aturan disetujui"
            value={usage.rulesApproved}
            limit={null}
            unit="aturan"
            note="periode berjalan"
          />
        </div>
      </Section>

      <Section
        id="pilihan-paket"
        title="Pilihan paket"
        description="Naik paket berlaku langsung dengan invoice prorata sisa periode. Turun paket berlaku di periode berikutnya, tanpa refund."
      >
        <div className="grid grid-cols-1 border-y border-line md:grid-cols-3">
          {plans.map((p, i) => {
            const active = p.id === current.id;
            const custom = p.priceIdr === null;
            const upgrade = !custom && price(p) > price(current);
            return (
              <div
                key={p.id}
                className={cn(
                  'flex flex-col gap-4 py-6 md:px-6',
                  i > 0 && 'border-t border-line md:border-t-0 md:border-l',
                  i === 0 && 'md:pl-0',
                )}
              >
                <div>
                  <p className="text-[16px] font-medium text-fg">
                    {p.name}
                    {active ? <span className="meta"> · paket aktif</span> : null}
                  </p>
                  <p className="mt-2 font-mono text-[22px] text-fg">
                    {custom
                      ? 'Kontrak khusus'
                      : p.priceIdr === 0
                        ? 'Gratis'
                        : formatRupiah(price(p))}
                    {!custom && price(p) > 0 ? (
                      <span className="font-sans text-[13px] text-muted"> / bulan</span>
                    ) : null}
                  </p>
                  <p className="meta mt-2">{p.description}</p>
                </div>
                <ul className="flex flex-col gap-2 text-[13px] text-fg-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <CircleCheck
                        aria-hidden="true"
                        strokeWidth={1.75}
                        className="mt-0.5 size-4 shrink-0 text-muted"
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto">
                  {active ? (
                    <p className="meta">Sedang dipakai.</p>
                  ) : custom ? (
                    <p className="meta">Hubungi tim NEXA untuk penawaran.</p>
                  ) : confirm?.id === p.id ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-[13px] text-fg-2">
                        {upgrade
                          ? `Naik ke ${p.name} sekarang? Invoice prorata sisa periode akan dibuat.`
                          : `Turun ke ${p.name} mulai ${formatDateWib(sub.periodEnd)}?`}
                      </p>
                      <div className="flex gap-2">
                        <Button disabled={busy} onClick={() => void changePlan(p)}>
                          Ya, ganti paket
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setConfirm(null)}
                        >
                          Batal
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant={upgrade ? 'primary' : 'secondary'}
                      disabled={busy}
                      onClick={() => setConfirm(p)}
                    >
                      {upgrade ? `Naik ke ${p.name}` : `Turun ke ${p.name}`}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        id="invoice"
        title="Invoice"
        description="Pembayaran manual: setelah dana diterima, admin mencatat referensi transfer. Tidak ada payment gateway; NEXA tidak menyimpan data kartu atau rekening."
      >
        {data.invoices.length === 0 ? (
          <p className="text-[14px] text-muted">
            Belum ada invoice. Paket gratis tidak menerbitkan invoice.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Rincian</TableHead>
                <TableHead numeric>Jumlah</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Jatuh tempo</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.map((inv, i) => {
                const st = INVOICE_STATUS[inv.status];
                return (
                  <TableRow key={inv.id} className="nx-row" style={staggerStyle(i)}>
                    <TableCell mono>{inv.number}</TableCell>
                    <TableCell>
                      {inv.lines.map((l) => (
                        <p key={l.description} className="text-[13px] text-fg-2">
                          {l.description}
                        </p>
                      ))}
                      {inv.paidAt ? (
                        <p className="meta mt-1">
                          Lunas {formatDateWib(inv.paidAt)} · ref {inv.paymentRef} · dicatat{' '}
                          {inv.paidByName}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell numeric>{formatRupiah(inv.amountIdr)}</TableCell>
                    <TableCell>
                      <span className={inv.overdue ? 'text-status-trapped' : TONE_CLASS[st.tone]}>
                        {inv.overdue ? 'Lewat jatuh tempo' : st.label}
                      </span>
                    </TableCell>
                    <TableCell mono className="text-fg-2">
                      {formatDateWib(inv.dueAt)}
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      {inv.status === 'open' ? (
                        paying === inv.id ? (
                          <PayForm
                            invoice={inv}
                            onPaid={() => {
                              setPaying(null);
                              setNotice(`Pelunasan ${inv.number} dicatat.`);
                              load();
                            }}
                          />
                        ) : (
                          <Button variant="secondary" onClick={() => setPaying(inv.id)}>
                            Catat pelunasan
                          </Button>
                        )
                      ) : (
                        <span className="meta">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}
