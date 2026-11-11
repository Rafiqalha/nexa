// Layar masuk: email + kata sandi, langkah 2FA bila aktif, dan penyiapan akun pemilik
// pertama (butuh SETUP_TOKEN dari environment sensor). Sesi = cookie httpOnly dari server.
import { type AuthStatus, LoginResultSchema } from '@nexa/shared';
import { KeyRound, LoaderCircle, LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { Field, FormError, inputClass, monoInputClass } from '../components/form';
import { Button } from '../components/ui/button';
import { apiPost, errorMessage } from '../lib/api';
import { refreshAuth } from '../lib/auth';
import { normalizeToken } from '../lib/token';

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
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <Button type="submit" disabled={busy} className="w-full">
      {busy ? (
        <LoaderCircle aria-hidden="true" strokeWidth={2} className="nx-spin size-4" />
      ) : (
        <LogIn aria-hidden="true" strokeWidth={2} className="size-4" />
      )}
      {busy ? busyLabel : label}
    </Button>
  );
}

function SetupForm({ status }: { status: AuthStatus }) {
  const [form, setForm] = useState({
    setupToken: '',
    orgName: '',
    name: '',
    email: '',
    password: '',
    confirm: '',
  });
  const s = useAttempt();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    s.setError(null);
    if (form.password !== form.confirm) return s.fail('Konfirmasi kata sandi tidak sama.');
    s.setBusy(true);
    try {
      await apiPost(
        '/api/auth/setup',
        {
          setupToken: normalizeToken(form.setupToken),
          orgName: form.orgName,
          name: form.name,
          email: form.email,
          password: form.password,
        },
        LoginResultSchema,
      );
      await refreshAuth();
    } catch (err) {
      s.fail(errorMessage(err, 'Penyiapan gagal.'));
    } finally {
      s.setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Penyiapan awal"
      label={status.label}
      subtitle="Belum ada akun. Buat akun pemilik organisasi: peran Admin, pengelola pengguna dan tagihan."
      footer={
        status.setupAvailable
          ? 'Token penyiapan = nilai SETUP_TOKEN di environment sensor (Railway: tab Variables; lab: pnpm token). Hanya bisa dipakai sekali.'
          : 'SETUP_TOKEN belum di-set di environment sensor, jadi penyiapan lewat layar ini tidak tersedia.'
      }
    >
      <form className="space-y-6" onSubmit={submit}>
        <Field label="Token penyiapan">
          <input
            className={monoInputClass}
            type="password"
            autoComplete="off"
            value={form.setupToken}
            onChange={set('setupToken')}
            required
            disabled={!status.setupAvailable}
          />
        </Field>
        <Field label="Nama organisasi">
          <input className={inputClass} value={form.orgName} onChange={set('orgName')} required />
        </Field>
        <Field label="Nama Anda">
          <input
            className={inputClass}
            autoComplete="name"
            value={form.name}
            onChange={set('name')}
            required
          />
        </Field>
        <Field label="Email">
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            value={form.email}
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
            value={form.password}
            onChange={set('password')}
            required
          />
        </Field>
        <Field label="Ulangi kata sandi">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={set('confirm')}
            required
          />
        </Field>
        <FormError message={s.error} attempt={s.attempt} />
        <SubmitButton busy={s.busy} label="Buat akun pemilik" busyLabel="Menyiapkan…" />
      </form>
    </AuthLayout>
  );
}

export function Login({ status }: { status: AuthStatus }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const s = useAttempt();

  if (status.needsSetup) return <SetupForm status={status} />;

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

  return (
    <AuthLayout
      title="Masuk ke Dashboard"
      label={status.label}
      subtitle={status.orgName}
      footer="Belum punya akun? Minta tautan undangan ke admin organisasi. Lupa kata sandi? Admin dapat membuat tautan reset."
    >
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
