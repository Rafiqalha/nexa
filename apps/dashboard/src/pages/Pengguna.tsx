// Pengguna & peran (Admin): undang pengguna lewat tautan sekali pakai, ubah peran,
// nonaktifkan, buat tautan reset kata sandi, reset 2FA. Kursi dibatasi paket.
import {
  InviteCreatedSchema,
  OkSchema,
  type OneTimeLink,
  OneTimeLinkSchema,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLES,
  type Role,
  type User,
  type UserList,
  UserListSchema,
  UserSchema,
} from '@nexa/shared';
import { Ban, KeyRound, RotateCcw, UserPlus } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { CopyField, Field, FormError, FormNotice, inputClass, Section } from '../components/form';
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
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from '../lib/api';
import { usePrincipal } from '../lib/auth';
import { formatDateTimeWib, formatInt } from '../lib/format';
import { TONE_CLASS, USER_STATUS } from '../lib/labels';
import { staggerStyle } from '../lib/motion';
import { navItem } from '../lib/nav';
import { absoluteLink } from '../lib/token';

interface IssuedLink {
  kind: 'invite' | 'reset';
  who: string;
  link: OneTimeLink;
}

function LinkResult({ issued }: { issued: IssuedLink }) {
  const url = absoluteLink(issued.link.path, window.location.origin);
  return (
    <div className="nx-row flex flex-col gap-3 border-l border-line-strong pl-4">
      <p className="text-[14px] text-fg">
        {issued.kind === 'invite' ? 'Tautan undangan' : 'Tautan reset kata sandi'} untuk{' '}
        {issued.who}
      </p>
      <CopyField value={url} label="Tautan" />
      <p className="meta">
        Berlaku sampai {formatDateTimeWib(issued.link.expiresAt)} dan hanya bisa dipakai sekali.
        Kirim lewat kanal yang aman; tautan tidak ditampilkan lagi setelah halaman ini ditutup.
      </p>
    </div>
  );
}

export function Pengguna() {
  const me = usePrincipal();
  const [data, setData] = useState<UserList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [attempt, setAttempt] = useState(0);
  const nav = navItem('pengguna');

  const load = useCallback(() => {
    apiGet('/api/users', UserListSchema)
      .then(setData)
      .catch((err: unknown) => setError(errorMessage(err, 'Gagal memuat pengguna.')));
  }, []);
  useEffect(load, [load]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await fn();
      load();
    } catch (err) {
      setError(errorMessage(err, 'Aksi gagal.'));
      setAttempt((a) => a + 1);
    } finally {
      setBusy(null);
    }
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    await run('invite', async () => {
      const r = await apiPost('/api/invites', { email, role }, InviteCreatedSchema);
      setIssued({ kind: 'invite', who: r.invite.email, link: r.link });
      setEmail('');
    });
  }

  const update = (u: User, body: { role?: Role; status?: 'active' | 'disabled' }) =>
    run(`u:${u.id}`, async () => {
      await apiPatch(`/api/users/${u.id}`, body, UserSchema);
      setNotice(`Perubahan untuk ${u.name} tersimpan.`);
    });

  const seats = data?.seats;
  const seatsText = seats
    ? `${formatInt(seats.used)} dari ${seats.limit === null ? 'tanpa batas' : formatInt(seats.limit)} kursi terpakai`
    : '';

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={nav.title} icon={nav.icon} />
      <FormError message={error} attempt={attempt} />
      <FormNotice message={notice} />

      <Section
        id="undang-title"
        title="Undang pengguna"
        description={`Undangan berupa tautan sekali pakai (berlaku 72 jam). ${seatsText}${seatsText ? ' (pengguna aktif + undangan tertunda dibatasi paket).' : ''}`}
      >
        <form
          className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end"
          onSubmit={invite}
        >
          <Field label="Email">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Peran">
            <select
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <Button type="submit" disabled={busy === 'invite'}>
            <UserPlus aria-hidden="true" strokeWidth={2} className="size-4" />
            Buat tautan undangan
          </Button>
        </form>
        <p className="meta">{ROLE_DESCRIPTIONS[role]}</p>
        {issued ? <LinkResult issued={issued} /> : null}
      </Section>

      <Section
        id="pengguna-title"
        title="Pengguna"
        description="Peran menentukan akses; server menolak aksi di luar peran."
      >
        {data ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>2FA</TableHead>
                <TableHead>Login terakhir</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map((u, i) => {
                const self = me?.userId === u.id;
                const locked = u.isOwner || self;
                const st = USER_STATUS[u.status];
                return (
                  <TableRow
                    key={u.id}
                    className="nx-row transition-colors duration-200 hover:bg-line-subtle"
                    style={staggerStyle(i)}
                  >
                    <TableCell>
                      <p className="text-[14px] text-fg">
                        {u.name}
                        {u.isOwner ? <span className="meta"> · Pemilik</span> : null}
                        {self ? <span className="meta"> · Anda</span> : null}
                      </p>
                      <p className="meta">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      {locked ? (
                        <span className="text-fg-2">{ROLE_LABELS[u.role]}</span>
                      ) : (
                        <select
                          aria-label={`Peran ${u.name}`}
                          className={`${inputClass} mt-0 min-w-[140px]`}
                          value={u.role}
                          disabled={busy === `u:${u.id}`}
                          onChange={(e) => void update(u, { role: e.target.value as Role })}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={TONE_CLASS[st.tone]}>{st.label}</span>
                    </TableCell>
                    <TableCell className="text-fg-2">{u.totpEnabled ? 'Aktif' : '—'}</TableCell>
                    <TableCell mono className="text-fg-2">
                      {u.lastLoginAt ? formatDateTimeWib(u.lastLoginAt) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={busy !== null}
                          onClick={() =>
                            void run(`r:${u.id}`, async () => {
                              const link = await apiPost(
                                `/api/users/${u.id}/reset-link`,
                                {},
                                OneTimeLinkSchema,
                              );
                              setIssued({ kind: 'reset', who: u.email, link });
                            })
                          }
                        >
                          <KeyRound aria-hidden="true" strokeWidth={2} className="size-4" />
                          Tautan reset
                        </Button>
                        {u.totpEnabled && !self ? (
                          <Button
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() =>
                              void run(`t:${u.id}`, async () => {
                                await apiPost(`/api/users/${u.id}/reset-2fa`, {}, UserSchema);
                                setNotice(
                                  `2FA ${u.name} direset; pengguna dapat mengaktifkannya lagi.`,
                                );
                              })
                            }
                          >
                            <RotateCcw aria-hidden="true" strokeWidth={2} className="size-4" />
                            Reset 2FA
                          </Button>
                        ) : null}
                        {!locked ? (
                          <Button
                            variant="secondary"
                            disabled={busy !== null}
                            onClick={() =>
                              void update(u, {
                                status: u.status === 'active' ? 'disabled' : 'active',
                              })
                            }
                          >
                            <Ban aria-hidden="true" strokeWidth={2} className="size-4" />
                            {u.status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="meta">Memuat pengguna…</p>
        )}
      </Section>

      <Section id="undangan-title" title="Undangan tertunda">
        {data && data.invites.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Dibuat oleh</TableHead>
                <TableHead>Berlaku sampai</TableHead>
                <TableHead>Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invites.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell>{inv.email}</TableCell>
                  <TableCell className="text-fg-2">{ROLE_LABELS[inv.role]}</TableCell>
                  <TableCell className="text-fg-2">{inv.createdByName || '—'}</TableCell>
                  <TableCell mono className="text-fg-2">
                    {formatDateTimeWib(inv.expiresAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() =>
                        void run(`i:${inv.id}`, async () => {
                          await apiDelete(`/api/invites/${inv.id}`, OkSchema);
                          setNotice(`Undangan untuk ${inv.email} dicabut.`);
                        })
                      }
                    >
                      Cabut
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-[14px] text-muted">Tidak ada undangan tertunda.</p>
        )}
      </Section>
    </div>
  );
}
