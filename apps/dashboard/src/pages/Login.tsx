import { LAB_LABEL } from '@nexa/shared';
import { LoaderCircle, LogIn } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { LogoMark } from '../components/LogoMark';
import { Button } from '../components/ui/button';
import { probeStatus } from '../lib/api';
import { signIn, signInViaProxy } from '../lib/auth';
import { loginErrorMessage, normalizeToken } from '../lib/token';

const inputClass =
  'mt-2 block min-h-11 w-full border border-line-strong bg-bg px-3 font-mono text-[13px] text-fg transition-colors duration-200 placeholder:text-muted hover:border-muted focus:border-fg-2';

export function Login({ proxyAuth = false }: { proxyAuth?: boolean }) {
  const [token, setToken] = useState('');
  const [operator, setOperator] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Naik setiap percobaan gagal agar animasi getar pesan error diputar ulang.
  const [attempt, setAttempt] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (operator.trim().length < 2) {
      setError('Isi nama operator (minimal 2 karakter); dicatat pada setiap keputusan aturan.');
      setAttempt((a) => a + 1);
      return;
    }
    if (proxyAuth) {
      signInViaProxy(operator.trim());
      return;
    }
    const clean = normalizeToken(token);
    setBusy(true);
    const status = await probeStatus({ authorization: `Bearer ${clean}` });
    setBusy(false);
    if (status !== 200) {
      setError(loginErrorMessage(status, window.location.origin));
      setAttempt((a) => a + 1);
      return;
    }
    signIn(clean, operator.trim());
  }

  return (
    <main className="nx-page mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-6 py-14">
      <div className="flex items-center gap-3">
        <LogoMark size={36} />
        <p className="font-sans text-[20px] font-semibold tracking-[0.16em] text-fg">NEXA</p>
      </div>
      <h1 className="mt-8 text-[28px] font-medium tracking-[-0.01em]">Masuk ke Dashboard</h1>
      <p className="meta mt-2">{LAB_LABEL}</p>
      <form className="mt-10 space-y-6" onSubmit={submit}>
        {proxyAuth ? (
          <p className="meta">Mode dev: token disisipkan proxy lokal (DASHBOARD_DEV_AUTOAUTH).</p>
        ) : (
          <label className="block text-[13px] text-fg-2">
            Token API sensor
            <input
              className={inputClass}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </label>
        )}
        <label className="block text-[13px] text-fg-2">
          Nama operator
          <input
            className={inputClass}
            type="text"
            autoComplete="name"
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            required
          />
        </label>
        {error ? (
          <p key={attempt} role="alert" className="nx-shake text-[13px] text-status-trapped">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? (
            <LoaderCircle aria-hidden="true" strokeWidth={2} className="nx-spin size-4" />
          ) : (
            <LogIn aria-hidden="true" strokeWidth={2} className="size-4" />
          )}
          {busy ? 'Memeriksa…' : 'Masuk'}
        </Button>
      </form>
      <p className="meta mt-8">
        Token = nilai DASHBOARD_TOKEN di .env sensor. Jalankan pnpm token di folder repo untuk
        menyalinnya ke clipboard tanpa menampilkannya.
      </p>
      <p className="meta mt-3">
        Token hanya disimpan di sessionStorage tab ini dan tidak pernah ditanam di aplikasi.
      </p>
    </main>
  );
}
