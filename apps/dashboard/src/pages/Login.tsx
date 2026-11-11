// Layar tanpa login: masuk (email + kata sandi, lalu 2FA bila aktif), daftar mandiri
// (akun baru = Pemantau), dan akun pertama sensor (pemilik/Admin; token hanya diminta bila
// SETUP_TOKEN di-set). Setelah daftar atau buat akun, pengguna langsung masuk Dashboard.
// Sesi = cookie httpOnly dari server.
import { type AuthStatus, LoginResultSchema } from '@nexa/shared';
import { KeyRound, LoaderCircle, LogIn, type LucideIcon, UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { Field, FormError, inputClass, monoInputClass } from '../components/form';
import { Button } from '../components/ui/button';
import { ApiError, apiPost, errorMessage } from '../lib/api';
import { refreshAuth } from '../lib/auth';
import { REGISTER_HASH, useHash } from '../lib/router';
import { normalizeToken } from '../lib/token';
import { cn } from '../lib/utils';

function useAttempt() {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const fail = (message: string) => {
    setError(message);
    setAttempt((a) => a + 1);
  };
  return { error, setError, attempt, busy, setBusy, fail };
}

function SubmitButton({
  busy,
  label,
  busyLabel,
  icon: Icon = LogIn,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
  icon?: LucideIcon;
}) {
  return (
    <Button type="submit" disabled={busy} className="w-full">
      {busy ? (
        <LoaderCircle aria-hidden="true" strokeWidth={2} className="nx-spin size-4" />
      ) : (
        <Icon aria-hidden="true" strokeWidth={2} className="size-4" />
      )}
      {busy ? busyLabel : label}
    </Button>
  );
}

/** Akun baru langsung masuk: buka Dashboard (bukan tab Daftar), lalu muat ulang status. */
async function enterDashboard(): Promise<void> {
  if (window.location.hash === REGISTER_HASH) window.location.hash = '#/';
  await refreshAuth();
}

/** Status sensor berubah di tengah jalan (mis. akun pertama baru dibuat orang lain). */
function isStaleStatus(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'setup_done' || err.code === 'setup_required');
}

interface AccountFields {
  name: string;
  email: string;
  password: string;
  confirm: string;
}

const EMPTY_ACCOUNT: AccountFields = { name: '', email: '', password: '', confirm: '' };

/** Nama, email, kata sandi baru + konfirmasi (dipakai akun pertama dan daftar). */
function AccountInputs({
  value,
  onChange,
}: {
  value: AccountFields;
  onChange: (next: AccountFields) => void;
}) {
  const set = (k: keyof AccountFields) => (e: { target: { value: string } }) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <Field label="Nama Anda">
        <input
          className={inputClass}
          autoComplete="name"
          value={value.name}
          onChange={set('name')}
          required
        />
      </Field>
      <Field label="Email">
        <input
          className={inputClass}
          type="email"
          autoComplete="email"
          value={value.email}
          onChange={set('email')}
          required
        />
      </Field>
      <Field label="Kata sandi" hint="Minimal 10 karakter.">
        <input
          className={inputClass}
          type="password"
          autoComplete="new-password"
          minLength={10}
          value={value.password}
          onChange={set('password')}
          required
        />
      </Field>
      <Field label="Ulangi kata sandi">
        <input
          className={inputClass}
          type="password"
          autoComplete="new-password"
          value={value.confirm}
          onChange={set('confirm')}
          required
        />
      </Field>
    </>
  );
}

/** Belum ada akun di sensor: pendaftar pertama menjadi pemilik organisasi (Admin). */
function FirstAccountForm({ status }: { status: AuthStatus }) {
  const [account, setAccount] = useState(EMPTY_ACCOUNT);
  const [setupToken, setSetupToken] = useState('');
  const s = useAttempt();

  async function submit(e: FormEvent) {
    e.preventDefault();
    s.setError(null);
    if (account.password !== account.confirm) return s.fail('Konfirmasi kata sandi tidak sama.');
    s.setBusy(true);
    try {
      await apiPost(
        '/api/auth/setup',
        {
          ...(status.setupTokenRequired ? { setupToken: normalizeToken(setupToken) } : {}),
          name: account.name,
          email: account.email,
          password: account.password,
        },
        LoginResultSchema,
      );
      await enterDashboard();
    } catch (err) {
      if (isStaleStatus(err)) {
        await refreshAuth();
        return;
      }
      s.fail(errorMessage(err, 'Gagal membuat akun.'));
    } finally {
      s.setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Mulai pakai NEXA"
      label={status.label}
      subtitle="Belum ada akun di sensor ini. Akun pertama menjadi pemilik organisasi (Admin) dan langsung masuk ke Dashboard."
      footer={
        status.setupTokenRequired
          ? 'Sensor ini memasang SETUP_TOKEN, jadi akun pertama memerlukannya (Railway: tab Variables; lab: pnpm token).'
          : 'Nama organisasi dan pengaturan lain bisa diubah nanti di Pengaturan.'
      }
    >
      <form className="space-y-6" onSubmit={submit}>
        {status.setupTokenRequired ? (
          <Field label="Token penyiapan">
            <input
              className={monoInputClass}
              type="password"
              autoComplete="off"
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              required
            />
          </Field>
        ) : null}
        <AccountInputs value={account} onChange={setAccount} />
        <FormError message={s.error} attempt={s.attempt} />
        <SubmitButton
          busy={s.busy}
          label="Buat akun dan masuk"
          busyLabel="Membuat akun…"
          icon={UserPlus}
        />
      </form>
    </AuthLayout>
  );
}

/** Pilihan Masuk / Daftar; hanya tampil bila pendaftaran mandiri dibuka. */
function AuthTabs({ active }: { active: 'masuk' | 'daftar' }) {
  const link = (key: 'masuk' | 'daftar', label: string, href: string) => (
    <a
      href={href}
      aria-current={active === key ? 'page' : undefined}
      className={cn(
        '-mb-px border-b-2 px-1 pb-3 text-[14px] transition-colors duration-200',
        active === key ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg',
      )}
    >
      {label}
    </a>
  );
  return (
    <nav aria-label="Masuk atau daftar" className="mb-8 flex gap-6 border-b border-line">
      {link('masuk', 'Masuk', '#/')}
      {link('daftar', 'Daftar', REGISTER_HASH)}
    </nav>
  );
}

/** Pendaftaran mandiri: akun baru berperan Pemantau (baca-saja) dan langsung masuk. */
function RegisterForm() {
  const [account, setAccount] = useState(EMPTY_ACCOUNT);
  const s = useAttempt();

  async function submit(e: FormEvent) {
    e.preventDefault();
    s.setError(null);
    if (account.password !== account.confirm) return s.fail('Konfirmasi kata sandi tidak sama.');
    s.setBusy(true);
    try {
      await apiPost(
        '/api/auth/register',
        { name: account.name, email: account.email, password: account.password },
        LoginResultSchema,
      );
      await enterDashboard();
    } catch (err) {
      if (isStaleStatus(err)) {
        await refreshAuth();
        return;
      }
      s.fail(errorMessage(err, 'Pendaftaran gagal.'));
    } finally {
      s.setBusy(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <AccountInputs value={account} onChange={setAccount} />
      <FormError message={s.error} attempt={s.attempt} />
      <SubmitButton
        busy={s.busy}
        label="Daftar dan masuk"
        busyLabel="Mendaftarkan…"
        icon={UserPlus}
      />
    </form>
  );
}

export function Login({ status }: { status: AuthStatus }) {
  const hash = useHash();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const s = useAttempt();

  if (status.needsSetup) return <FirstAccountForm status={status} />;

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    s.setError(null);
    s.setBusy(true);
    try {
      const r = await apiPost('/api/auth/login', { email, password }, LoginResultSchema);
      if (r.status === 'totp_required') {
        setChallenge(r.challenge);
        setPassword('');
      } else {
        await refreshAuth();
      }
    } catch (err) {
      s.fail(errorMessage(err, 'Gagal masuk.'));
    } finally {
      s.setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    s.setError(null);
    s.setBusy(true);
    try {
      await apiPost('/api/auth/login/totp', { challenge, code: code.trim() }, LoginResultSchema);
      await refreshAuth();
    } catch (err) {
      setCode('');
      s.fail(errorMessage(err, 'Kode 2FA ditolak.'));
      if (err instanceof Error && /masuk ulang/i.test(err.message)) setChallenge(null);
    } finally {
      s.setBusy(false);
    }
  }

  if (challenge) {
    return (
      <AuthLayout
        title="Verifikasi dua langkah"
        label={status.label}
        subtitle="Masukkan kode 6 digit dari aplikasi authenticator Anda."
      >
        <form className="space-y-6" onSubmit={submitCode}>
          <Field label="Kode 2FA">
            <input
              className={`${monoInputClass} tracking-[0.4em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              // biome-ignore lint/a11y/noAutofocus: satu-satunya kolom di langkah ini
              autoFocus
            />
          </Field>
          <FormError message={s.error} attempt={s.attempt} />
          <Button type="submit" disabled={s.busy || code.length !== 6} className="w-full">
            {s.busy ? (
              <LoaderCircle aria-hidden="true" strokeWidth={2} className="nx-spin size-4" />
            ) : (
              <KeyRound aria-hidden="true" strokeWidth={2} className="size-4" />
            )}
            {s.busy ? 'Memeriksa…' : 'Verifikasi'}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setChallenge(null);
              setCode('');
              s.setError(null);
            }}
          >
            Kembali
          </Button>
        </form>
      </AuthLayout>
    );
  }

  if (status.registrationOpen && hash === REGISTER_HASH) {
    return (
      <AuthLayout
        title="Daftar akun"
        label={status.label}
        subtitle={status.orgName}
        footer="Akun baru berperan Pemantau (baca-saja): bisa melihat Dashboard, Sesi, Intelijen, dan Aturan. Admin organisasi dapat menaikkan peran."
      >
        <AuthTabs active="daftar" />
        <RegisterForm />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Masuk ke Dashboard"
      label={status.label}
      subtitle={status.orgName}
      footer={
        status.registrationOpen
          ? 'Belum punya akun? Pilih Daftar. Lupa kata sandi? Admin dapat membuat tautan reset.'
          : 'Belum punya akun? Minta tautan undangan ke admin organisasi. Lupa kata sandi? Admin dapat membuat tautan reset.'
      }
    >
      {status.registrationOpen ? <AuthTabs active="masuk" /> : null}
      <form className="space-y-6" onSubmit={submitPassword}>
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Kata sandi">
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <FormError message={s.error} attempt={s.attempt} />
        <SubmitButton busy={s.busy} label="Masuk" busyLabel="Memeriksa…" />
      </form>
    </AuthLayout>
  );
}
