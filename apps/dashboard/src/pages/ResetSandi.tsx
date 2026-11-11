// Atur ulang kata sandi (#/reset/<token>) dari tautan sekali pakai buatan admin.
import { OkSchema } from '@nexa/shared';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { AuthLayout } from '../components/AuthLayout';
import { Field, FormError, inputClass } from '../components/form';
import { Button } from '../components/ui/button';
import { apiPost, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

export function ResetSandi({ token }: { token: string | null }) {
  const label = useAuth().status?.label;
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

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
      await apiPost('/api/auth/reset', { token, password }, OkSchema);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, 'Gagal mengatur ulang kata sandi.'));
      setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Atur ulang kata sandi"
      {...(label ? { label } : {})}
      subtitle={
        done ? undefined : 'Semua sesi login akun ini akan dikeluarkan setelah kata sandi diganti.'
      }
      footer={
        <a className="underline" href="#/">
          Ke layar masuk
        </a>
      }
    >
      {done ? (
        <p role="status" className="text-[14px] text-fg-2">
          Kata sandi sudah diganti. Masuk lagi dengan kata sandi baru.
        </p>
      ) : (
        <form className="space-y-6" onSubmit={submit}>
          <Field label="Kata sandi baru" hint="Minimal 10 karakter.">
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
          <FormError message={error} attempt={attempt} />
          <Button type="submit" disabled={busy || !token} className="w-full">
            {busy ? (
              <LoaderCircle aria-hidden="true" strokeWidth={2} className="nx-spin size-4" />
            ) : (
              <KeyRound aria-hidden="true" strokeWidth={2} className="size-4" />
            )}
            {busy ? 'Menyimpan…' : 'Simpan kata sandi baru'}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
