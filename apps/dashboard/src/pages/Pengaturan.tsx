// Pengaturan (Admin): organisasi, pendaftaran mandiri, kebijakan keamanan login, ambang
// deteksi, budget intel.
// Disimpan di sensor dan langsung berlaku tanpa restart. Info sensor baca-saja, tanpa secret.
import { type Settings, type SettingsResponse, SettingsResponseSchema } from '@nexa/shared';
import { Save } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Field, FormError, FormNotice, InfoList, inputClass, Section } from '../components/form';
import { PageHeader } from '../components/PageHeader';
import { Button } from '../components/ui/button';
import { apiGet, apiPatch, errorMessage } from '../lib/api';
import { refreshAuth } from '../lib/auth';
import { formatInt } from '../lib/format';
import { navItem } from '../lib/nav';

const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v));

export function Pengaturan() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const nav = navItem('pengaturan');

  useEffect(() => {
    apiGet('/api/settings', SettingsResponseSchema)
      .then((r) => {
        setData(r);
        setForm(r.settings);
      })
      .catch((err: unknown) => setError(errorMessage(err, 'Gagal memuat pengaturan.')));
  }, []);

  if (!data || !form) {
    return (
      <div className="flex flex-col gap-12">
        <PageHeader title={nav.title} icon={nav.icon} />
        {error ? (
          <p className="text-status-trapped">{error}</p>
        ) : (
          <p className="meta">Memuat pengaturan…</p>
        )}
      </div>
    );
  }

  const patch = <K extends keyof Settings>(section: K, value: Partial<Settings[K]>) =>
    setForm((f) => (f ? { ...f, [section]: { ...f[section], ...value } } : f));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await apiPatch('/api/settings', form, SettingsResponseSchema);
      setData(r);
      setForm(r.settings);
      setNotice('Pengaturan tersimpan dan sudah berlaku.');
      void refreshAuth();
    } catch (err) {
      setError(errorMessage(err, 'Gagal menyimpan pengaturan.'));
      setAttempt((a) => a + 1);
    } finally {
      setBusy(false);
    }
  }

  const s = data.sensor;
  return (
    <form className="flex flex-col gap-12" onSubmit={save}>
      <PageHeader title={nav.title} icon={nav.icon}>
        <Button type="submit" disabled={busy}>
          <Save aria-hidden="true" strokeWidth={2} className="size-4" />
          {busy ? 'Menyimpan…' : 'Simpan perubahan'}
        </Button>
      </PageHeader>
      <FormError message={error} attempt={attempt} />
      <FormNotice message={notice} />

      <Section id="org" title="Organisasi">
        <Field label="Nama organisasi" className="max-w-[480px]">
          <input
            className={inputClass}
            value={form.org.name}
            onChange={(e) => patch('org', { name: e.target.value })}
            required
            minLength={2}
            maxLength={80}
          />
        </Field>
      </Section>

      <Section
        id="pendaftaran"
        title="Pendaftaran akun"
        description="Siapa pun yang membuka dashboard bisa mendaftar dan langsung masuk sebagai Pemantau (baca-saja, tidak memakai kursi paket). Peran lain tetap lewat undangan atau dinaikkan Admin di Pengguna."
      >
        <label className="flex max-w-[720px] items-start gap-3 text-[14px] text-fg-2">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={form.registration.enabled}
            onChange={(e) => patch('registration', { enabled: e.target.checked })}
          />
          <span>
            Izinkan pendaftaran mandiri
            <span className="meta mt-1 block">
              Tautan daftar: {window.location.origin}/#/daftar. Bila dimatikan, akun baru hanya
              lewat undangan.
            </span>
          </span>
        </label>
      </Section>

      <Section
        id="keamanan"
        title="Keamanan login"
        description="Berlaku untuk sesi baru dan pemeriksaan berikutnya. Sesi yang melewati batas idle harus masuk lagi."
      >
        <div className="grid max-w-[720px] gap-6 sm:grid-cols-2">
          <Field label="Masa berlaku sesi (jam)" hint="1–168 jam.">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={168}
              value={form.security.sessionTtlHours}
              onChange={(e) => patch('security', { sessionTtlHours: num(e.target.value) })}
              required
            />
          </Field>
          <Field label="Batas idle (menit)" hint="5–1440 menit tanpa aktivitas.">
            <input
              className={inputClass}
              type="number"
              min={5}
              max={1440}
              value={form.security.idleTimeoutMinutes}
              onChange={(e) => patch('security', { idleTimeoutMinutes: num(e.target.value) })}
              required
            />
          </Field>
        </div>
        <label className="flex max-w-[720px] items-start gap-3 text-[14px] text-fg-2">
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={form.security.require2faForAdmins}
            onChange={(e) => patch('security', { require2faForAdmins: e.target.checked })}
          />
          <span>
            Wajibkan 2FA untuk semua admin
            <span className="meta mt-1 block">
              Admin tanpa 2FA hanya bisa membuka halaman Akun sampai 2FA diaktifkan.
            </span>
          </span>
        </label>
      </Section>

      <Section
        id="deteksi"
        title="Deteksi"
        description="Skor sesi 0–1 dari sinyal (honeylink, UA otomasi, header browser, ritme). Berlaku langsung untuk permintaan berikutnya."
      >
        <div className="grid max-w-[720px] gap-6 sm:grid-cols-2">
          <Field label="Ambang curiga" hint="Sesi ditandai Dicurigai.">
            <input
              className={inputClass}
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              value={form.detection.suspectThreshold}
              onChange={(e) => patch('detection', { suspectThreshold: num(e.target.value) })}
              required
            />
          </Field>
          <Field label="Ambang agen" hint="Sesi diklasifikasikan Agen AI; harus ≥ ambang curiga.">
            <input
              className={inputClass}
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              value={form.detection.agentThreshold}
              onChange={(e) => patch('detection', { agentThreshold: num(e.target.value) })}
              required
            />
          </Field>
        </div>
      </Section>

      <Section
        id="intel"
        title="Intel pasca-sesi"
        description="Batas token LLM per hari (WIB) untuk ringkasan intel. Labirin tidak pernah memakai LLM."
      >
        <Field
          label="Budget token harian"
          className="max-w-[360px]"
          hint={`Efektif: ${formatInt(data.effectiveDailyTokenBudget)} token/hari${
            data.planDailyTokenLimit === null
              ? ''
              : ` (batas paket ${formatInt(data.planDailyTokenLimit)})`
          }.`}
        >
          <input
            className={inputClass}
            type="number"
            min={0}
            max={10_000_000}
            step={1000}
            value={form.intel.dailyTokenBudget}
            onChange={(e) => patch('intel', { dailyTokenBudget: num(e.target.value) })}
            required
          />
        </Field>
      </Section>

      <Section
        id="sensor"
        title="Sensor"
        description="Baca-saja. Secret (API key model, token) hanya ada di environment sensor dan tidak pernah dikirim ke dashboard."
      >
        <InfoList
          items={[
            {
              label: 'Mode',
              value: s.mode === 'production' ? 'Produksi (trafik nyata)' : 'Lab (data simulasi)',
            },
            { label: 'Versi sensor', value: s.version },
            { label: 'Aplikasi dilindungi', value: s.upstreamHost },
            ...(s.publicSiteUrl ? [{ label: 'Alamat publik situs', value: s.publicSiteUrl }] : []),
            { label: 'Honeylink', value: s.honeylinkPaths.join(', ') },
            {
              label: 'Validasi Suricata',
              value:
                s.suricataRunner === 'none'
                  ? 'tidak aktif (draf tidak ditampilkan)'
                  : s.suricataRunner,
            },
            {
              label: 'Model intel',
              value: `${s.llmModel}${s.llmEnabled ? '' : ' · nonaktif (intel heuristik)'}`,
            },
          ]}
        />
      </Section>
    </form>
  );
}
