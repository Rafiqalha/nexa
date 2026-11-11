// Terima undangan (#/undangan/<token>): buat kata sandi lalu langsung masuk.
import { type InviteInfo, InviteInfoSchema, LoginResultSchema, ROLE_LABELS } from '@nexa/shared';
import { LoaderCircle, UserPlus } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { Field, FormError, inputClass } from '../components/form';
import { Button } from '../components/ui/button';
import { apiGet, apiPost, errorMessage } from '../lib/api';
import { refreshAuth, useAuth } from '../lib/auth';
import { formatDateTimeWib } from '../lib/format';

export function Undangan({ token }: { token: string | null }) {
  const label = useAuth().status?.label;
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('Tautan undangan tidak lengkap.');
      return;
    }
    apiGet(`/api/auth/invites/${encodeURIComponent(token)}`, InviteInfoSchema)
      .then(setInfo)
      .catch((err: unknown) => setLoadError(errorMessage(err, 'Undangan tidak dapat dimuat.')));
  }, [token]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Konfirmasi kata sandi tidak sama.');
      setAttempt((a) => a + 1);
      return;
    }
    setBusy(true);
    try {
      await apiPost('/api/auth/invites/accept', { token, name, password }, LoginResultSchema);
      window.location.hash = '#/';
      await refreshAuth();
    } catch (err) {
      setError(errorMessage(err, 'Gagal menerima undangan.'));
      setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  }

  if (loadError || !info) {
    return (
      <AuthLayout
        title="Terima undangan"
        {...(label ? { label } : {})}
        footer={
          <a className="underline" href="#/">
            Ke layar masuk
          </a>
        }
      >
        {loadError ? (
          <p role="alert" className="text-[14px] text-status-trapped">
            {loadError}
          </p>
        ) : (
          <p className="meta">Memuat undangan…</p>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Terima undangan"
      {...(label ? { label } : {})}
      subtitle={
        <>
          Anda diundang ke <span className="text-fg">{info.orgName}</span> sebagai{' '}
          <span className="text-fg">{ROLE_LABELS[info.role]}</span>. Berlaku sampai{' '}
          {formatDateTimeWib(info.expiresAt)}.
        </>
      }
    >
      <form className="space-y-6" onSubmit={submit}>
        <Field label="Email">
          <input className={inputClass} value={info.email} readOnly disabled />
        </Field>
        <Field label="Nama Anda">
          <input
            className={inputClass}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Kata sandi" hint="Minimal 10 karakter.">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="Ulangi kata sandi">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        <FormError message={error} attempt={attempt} />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? (
            <LoaderCircle aria-hidden="true" strokeWidth={2} className="nx-spin size-4" />
          ) : (
            <UserPlus aria-hidden="true" strokeWidth={2} className="size-4" />
          )}
          {busy ? 'Membuat akun…' : 'Buat akun & masuk'}
        </Button>
      </form>
    </AuthLayout>
  );
}
