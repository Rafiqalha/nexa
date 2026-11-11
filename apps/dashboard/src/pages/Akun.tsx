// Akun saya (semua peran): profil, kata sandi, 2FA (TOTP), sesi login aktif, dan token API
// pribadi untuk MCP/skrip. Nilai rahasia (token API, rahasia 2FA) hanya tampil sekali.
import {
  type ApiToken,
  ApiTokenCreatedSchema,
  ApiTokenListSchema,
  type LoginSession,
  LoginSessionListSchema,
  OkSchema,
  PrincipalSchema,
  ROLE_LABELS,
  type TokenScope,
  type TotpSetup,
  TotpSetupSchema,
} from '@nexa/shared';
import { KeyRound, LockKeyhole, MonitorSmartphone, Smartphone } from 'lucide-react';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  CopyField,
  Field,
  FormError,
  FormNotice,
  InfoList,
  inputClass,
  monoInputClass,
  Section,
} from '../components/form';
import { PageHeader } from '../components/PageHeader';
import { QrCode } from '../components/QrCode';
import { Button } from '../components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { apiDelete, apiGet, apiPatch, apiPost, ClientError, errorMessage } from '../lib/api';
import { refreshAuth, useCan, usePrincipal } from '../lib/auth';
import { formatDateTimeWib } from '../lib/format';
import { deviceLabel } from '../lib/labels';
import { navItem } from '../lib/nav';

/** Hasil aksi satu bagian: pesan sukses / galat yang muncul di bagian itu. */
function useStatus() {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await fn());
    } catch (err) {
      setError(errorMessage(err, 'Aksi gagal.'));
      setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  };
  const view: ReactNode = (
    <>
      <FormError message={error} attempt={attempt} />
      <FormNotice message={notice} />
    </>
  );
  return { busy, run, view };
}

function Profil() {
  const p = usePrincipal();
  const [name, setName] = useState(p?.name ?? '');
  const st = useStatus();
  if (!p) return null;
  return (
    <Section id="profil" title="Profil">
      <InfoList
        items={[
          { label: 'Email', value: p.email ?? '—' },
          {
            label: 'Peran',
            value: `${ROLE_LABELS[p.role]}${p.isOwner ? ' · Pemilik organisasi' : ''}`,
          },
        ]}
      />
      <form
        className="flex max-w-[560px] flex-wrap items-end gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void st.run(async () => {
            await apiPatch('/api/account/profile', { name }, PrincipalSchema);
            await refreshAuth();
            return 'Nama tersimpan.';
          });
        }}
      >
        <Field label="Nama tampilan" className="min-w-[240px] flex-1">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={st.busy}>
          Simpan nama
        </Button>
      </form>
      {st.view}
    </Section>
  );
}

function KataSandi() {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const st = useStatus();
  return (
    <Section
      id="sandi"
      title="Kata sandi"
      description="Mengganti kata sandi mengeluarkan sesi di perangkat lain."
    >
      <form
        className="grid max-w-[720px] gap-5 sm:grid-cols-3 sm:items-end"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void st.run(async () => {
            if (next !== confirm) throw new ClientError('Konfirmasi kata sandi tidak sama.');
            await apiPost(
              '/api/account/password',
              { currentPassword: cur, newPassword: next },
              OkSchema,
            );
            setCur('');
            setNext('');
            setConfirm('');
            return 'Kata sandi diganti; sesi di perangkat lain dikeluarkan.';
          });
        }}
      >
        <Field label="Kata sandi saat ini">
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            required
          />
        </Field>
        <Field label="Kata sandi baru">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </Field>
        <Field label="Ulangi kata sandi baru">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" variant="secondary" disabled={st.busy}>
            <LockKeyhole aria-hidden="true" strokeWidth={2} className="size-4" />
            Ganti kata sandi
          </Button>
        </div>
      </form>
      {st.view}
    </Section>
  );
}

function DuaLangkah({ required }: { required: boolean }) {
  const p = usePrincipal();
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const st = useStatus();
  if (!p) return null;
  const secretGroups = setup?.secret.match(/.{1,4}/g)?.join(' ') ?? '';

  return (
    <Section
      id="dualangkah"
      title="Verifikasi dua langkah (2FA)"
      description={
        p.totpEnabled
          ? '2FA aktif: setiap masuk butuh kode 6 digit dari aplikasi authenticator.'
          : 'Lindungi akun dengan kode 6 digit dari aplikasi authenticator (Google Authenticator, Microsoft Authenticator, 1Password, dll.).'
      }
    >
      {required && !p.totpEnabled ? (
        <p role="alert" className="text-[14px] text-status-suspect">
          Kebijakan organisasi mewajibkan 2FA untuk admin. Aktifkan 2FA untuk membuka halaman lain.
        </p>
      ) : null}
      {p.totpEnabled ? (
        <form
          className="flex max-w-[720px] flex-wrap items-end gap-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void st.run(async () => {
              await apiPost('/api/account/totp/disable', { password, code }, OkSchema);
              setPassword('');
              setCode('');
              await refreshAuth();
              return '2FA dimatikan.';
            });
          }}
        >
          <Field label="Kata sandi" className="min-w-[200px] flex-1">
            <input
              className={inputClass}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Kode 2FA" className="w-[160px]">
            <input
              className={monoInputClass}
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={st.busy}>
            Matikan 2FA
          </Button>
        </form>
      ) : setup ? (
        <div className="flex flex-wrap items-start gap-8">
          <QrCode value={setup.otpauthUri} label="Kode QR untuk aplikasi authenticator" />
          <form
            className="flex min-w-[260px] flex-1 flex-col gap-5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void st.run(async () => {
                await apiPost('/api/account/totp/enable', { code }, OkSchema);
                setSetup(null);
                setCode('');
                await refreshAuth();
                return '2FA aktif. Simpan akses aplikasi authenticator Anda; admin dapat mereset 2FA bila perangkat hilang.';
              });
            }}
          >
            <p className="text-[14px] text-fg-2">
              1. Pindai kode QR dengan aplikasi authenticator, atau masukkan kunci ini secara
              manual:
            </p>
            <p className="font-mono text-[14px] tracking-[0.12em] text-fg [overflow-wrap:anywhere]">
              {secretGroups}
            </p>
            <p className="text-[14px] text-fg-2">
              2. Masukkan kode 6 digit yang muncul di aplikasi.
            </p>
            <Field label="Kode 2FA" className="w-[200px]">
              <input
                className={`${monoInputClass} tracking-[0.4em]`}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={st.busy || code.length !== 6}>
                <Smartphone aria-hidden="true" strokeWidth={2} className="size-4" />
                Aktifkan 2FA
              </Button>
              <Button variant="secondary" onClick={() => setSetup(null)}>
                Batal
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div>
          <Button
            disabled={st.busy}
            onClick={() =>
              void st.run(async () => {
                setSetup(await apiPost('/api/account/totp/setup', {}, TotpSetupSchema));
                return null;
              })
            }
          >
            <Smartphone aria-hidden="true" strokeWidth={2} className="size-4" />
            Siapkan 2FA
          </Button>
        </div>
      )}
      {st.view}
    </Section>
  );
}

function SesiLogin() {
  const [sessions, setSessions] = useState<LoginSession[] | null>(null);
  const st = useStatus();
  const load = useCallback(() => {
    apiGet('/api/account/sessions', LoginSessionListSchema)
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  }, []);
  useEffect(load, [load]);
  const others = sessions?.filter((s) => !s.current).length ?? 0;
  return (
    <Section
      id="sesi-login"
      title="Sesi login aktif"
      description="Perangkat yang sedang masuk ke akun ini. Keluarkan sesi yang tidak Anda kenali, lalu ganti kata sandi."
      action={
        others > 0 ? (
          <Button
            variant="secondary"
            disabled={st.busy}
            onClick={() =>
              void st.run(async () => {
                await apiPost('/api/account/sessions/revoke-others', {}, OkSchema);
                load();
                return 'Semua sesi lain dikeluarkan.';
              })
            }
          >
            Keluarkan semua sesi lain
          </Button>
        ) : undefined
      }
    >
      {sessions === null ? (
        <p className="meta">Memuat sesi…</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Perangkat</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Masuk</TableHead>
              <TableHead>Terakhir aktif</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <MonitorSmartphone
                      aria-hidden="true"
                      strokeWidth={1.75}
                      className="size-4 text-muted"
                    />
                    {deviceLabel(s.userAgent)}
                  </span>
                </TableCell>
                <TableCell mono className="text-fg-2">
                  {s.ip || '—'}
                </TableCell>
                <TableCell mono className="text-fg-2">
                  {formatDateTimeWib(s.createdAt)}
                </TableCell>
                <TableCell mono className="text-fg-2">
                  {formatDateTimeWib(s.lastSeenAt)}
                </TableCell>
                <TableCell>
                  {s.current ? (
                    <span className="meta">Sesi ini</span>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={st.busy}
                      onClick={() =>
                        void st.run(async () => {
                          await apiDelete(`/api/account/sessions/${s.id}`, OkSchema);
                          load();
                          return 'Sesi dikeluarkan.';
                        })
                      }
                    >
                      Keluarkan
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {st.view}
    </Section>
  );
}

const EXPIRY: readonly { value: string; label: string }[] = [
  { value: '30', label: '30 hari' },
  { value: '90', label: '90 hari' },
  { value: '365', label: '1 tahun' },
  { value: 'never', label: 'Tanpa kedaluwarsa' },
];

function TokenApi() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TokenScope>('read');
  const [expiry, setExpiry] = useState('90');
  const [secret, setSecret] = useState<string | null>(null);
  const st = useStatus();
  const load = useCallback(() => {
    apiGet('/api/account/tokens', ApiTokenListSchema)
      .then((r) => setTokens(r.tokens))
      .catch(() => setTokens([]));
  }, []);
  useEffect(load, [load]);

  return (
    <Section
      id="token-api"
      title="Token API"
      description="Untuk klien MCP intel (baca-saja) dan skrip. Kirim sebagai header Authorization: Bearer <token>. Token mengikuti peran Anda; cakupan baca-saja tidak bisa mengubah apa pun."
    >
      <form
        className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_200px_200px_auto] lg:items-end"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void st.run(async () => {
            const r = await apiPost(
              '/api/account/tokens',
              { name, scope, expiresInDays: expiry === 'never' ? null : Number(expiry) },
              ApiTokenCreatedSchema,
            );
            setSecret(r.secret);
            setName('');
            load();
            return null;
          });
        }}
      >
        <Field label="Nama token">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. MCP SOC"
            required
            minLength={2}
          />
        </Field>
        <Field label="Cakupan">
          <select
            className={inputClass}
            value={scope}
            onChange={(e) => setScope(e.target.value as TokenScope)}
          >
            <option value="read">Baca saja</option>
            <option value="write">Baca & tulis</option>
          </select>
        </Field>
        <Field label="Masa berlaku">
          <select className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            {EXPIRY.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={st.busy}>
          <KeyRound aria-hidden="true" strokeWidth={2} className="size-4" />
          Buat token
        </Button>
      </form>
      {secret ? (
        <div className="nx-row flex flex-col gap-3 border-l border-line-strong pl-4">
          <p className="text-[14px] text-fg">
            Salin token sekarang: nilainya tidak ditampilkan lagi.
          </p>
          <CopyField value={secret} label="Token" />
          <p className="meta">MCP intel: {window.location.origin}/api/mcp</p>
        </div>
      ) : null}
      {tokens && tokens.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Awalan</TableHead>
              <TableHead>Cakupan</TableHead>
              <TableHead>Terakhir dipakai</TableHead>
              <TableHead>Kedaluwarsa</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map((t) => {
              const expired = t.expiresAt !== null && t.expiresAt < Date.now();
              return (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell mono className="text-fg-2">
                    {t.prefix}…
                  </TableCell>
                  <TableCell className="text-fg-2">
                    {t.scope === 'read' ? 'Baca saja' : 'Baca & tulis'}
                  </TableCell>
                  <TableCell mono className="text-fg-2">
                    {t.lastUsedAt ? formatDateTimeWib(t.lastUsedAt) : 'belum'}
                  </TableCell>
                  <TableCell mono className={expired ? 'text-status-suspect' : 'text-fg-2'}>
                    {t.expiresAt ? formatDateTimeWib(t.expiresAt) : 'tidak'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="secondary"
                      disabled={st.busy}
                      onClick={() =>
                        void st.run(async () => {
                          await apiDelete(`/api/account/tokens/${t.id}`, OkSchema);
                          load();
                          return `Token "${t.name}" dicabut.`;
                        })
                      }
                    >
                      Cabut
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : tokens ? (
        <p className="text-[14px] text-muted">Belum ada token.</p>
      ) : null}
      {st.view}
    </Section>
  );
}

export function Akun({ mustEnable2fa }: { mustEnable2fa: boolean }) {
  const p = usePrincipal();
  const canTokens = useCan('tokens:manage');
  const nav = navItem('akun');
  if (!p) return null;
  if (p.kind !== 'user') {
    return (
      <div className="flex flex-col gap-12">
        <PageHeader title={nav.title} icon={nav.icon} />
        <p className="max-w-[72ch] text-[14px] text-fg-2">
          Anda masuk dengan{' '}
          {p.kind === 'service' ? 'token layanan lab (DASHBOARD_TOKEN)' : 'token API'}. Profil, kata
          sandi, 2FA, sesi, dan token API hanya tersedia untuk akun pengguna.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-14">
      <PageHeader title={nav.title} icon={nav.icon} />
      {mustEnable2fa ? null : <Profil />}
      <DuaLangkah required={mustEnable2fa} />
      {mustEnable2fa ? null : (
        <>
          <KataSandi />
          <SesiLogin />
          {canTokens ? <TokenApi /> : null}
        </>
      )}
    </div>
  );
}
