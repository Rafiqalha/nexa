// Log audit (Admin): siapa melakukan apa, kapan, dari mana. Tidak pernah memuat secret.
import { type AuditEntry, AuditListSchema } from '@nexa/shared';
import { useCallback, useEffect, useState } from 'react';
import { Field, inputClass, Section } from '../components/form';
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
import { apiGet, errorMessage } from '../lib/api';
import { formatDateTimeWib } from '../lib/format';
import { AUDIT_ACTIONS, AUDIT_CATEGORIES } from '../lib/labels';
import { staggerStyle } from '../lib/motion';
import { navItem } from '../lib/nav';

const FAILURE = /failed|blocked|locked/;

function metaText(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v === null || v === undefined) continue;
    parts.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(' · ');
}

export function Audit() {
  const [category, setCategory] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nav = navItem('audit');

  const load = useCallback(
    async (from: number | null) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (category) params.set('action', category.replace(/\.$/, ''));
      if (from) params.set('cursor', String(from));
      try {
        const r = await apiGet(`/api/audit?${params.toString()}`, AuditListSchema);
        setEntries((prev) => (from ? [...prev, ...r.entries] : r.entries));
        setCursor(r.nextCursor);
      } catch (err) {
        setError(errorMessage(err, 'Gagal memuat log audit.'));
      } finally {
        setLoading(false);
      }
    },
    [category],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={nav.title} icon={nav.icon} />
      <Section
        id="audit-log"
        title="Aktivitas"
        description="Login, perubahan pengguna, pengaturan, tagihan, dan keputusan aturan. Kata sandi, token, dan kode 2FA tidak pernah dicatat."
        action={
          <Field label="Kategori" className="min-w-[220px]">
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {AUDIT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        }
      >
        {error ? <p className="text-status-trapped">{error}</p> : null}
        {entries.length === 0 && !loading ? (
          <p className="text-[14px] text-muted">Belum ada aktivitas di kategori ini.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Aktor</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) => (
                <TableRow key={e.id} className="nx-row" style={staggerStyle(i)}>
                  <TableCell mono className="whitespace-nowrap text-fg-2">
                    {formatDateTimeWib(e.ts)}
                  </TableCell>
                  <TableCell>{e.actorName}</TableCell>
                  <TableCell>
                    <span className={FAILURE.test(e.action) ? 'text-status-suspect' : 'text-fg'}>
                      {AUDIT_ACTIONS[e.action] ?? e.action}
                    </span>
                    {Object.keys(e.meta).length > 0 ? (
                      <p className="meta mt-1">{metaText(e.meta)}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-fg-2 [overflow-wrap:anywhere]">
                    {e.target || '—'}
                  </TableCell>
                  <TableCell mono className="text-fg-2">
                    {e.ip || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {cursor ? (
          <div>
            <Button variant="secondary" disabled={loading} onClick={() => void load(cursor)}>
              {loading ? 'Memuat…' : 'Muat lebih banyak'}
            </Button>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
