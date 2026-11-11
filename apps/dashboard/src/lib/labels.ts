// Label Bahasa Indonesia untuk nilai enum. Status selalu = warna teks + label (DESIGN.md §2.3).
import type {
  Classification,
  EventKind,
  InvoiceStatus,
  SessionStatus,
  UserStatus,
} from '@nexa/shared';

export type StatusTone = 'trapped' | 'suspect' | 'neutral';

export const SESSION_STATUS: Readonly<Record<SessionStatus, { label: string; tone: StatusTone }>> =
  {
    trapped: { label: 'Terjebak', tone: 'trapped' },
    suspect: { label: 'Dicurigai', tone: 'suspect' },
    exited: { label: 'Keluar', tone: 'neutral' },
    active: { label: 'Diamati', tone: 'neutral' },
  };

export const CLASSIFICATION: Readonly<Record<Classification, string>> = {
  agent: 'Agen AI',
  suspect: 'Dicurigai',
  legit: 'Sah',
};

export const REASONS: Readonly<Record<string, string>> = {
  honeylink: 'Honeylink',
  automation_ua: 'UA otomasi',
  missing_browser_headers: 'Header browser hilang',
  fast_timing: 'Ritme cepat',
  regular_timing: 'Ritme teratur',
};

export const EVENT_KIND: Readonly<Record<EventKind, string>> = {
  request: 'Permintaan',
  bait_served: 'Umpan',
  honeylink_hit: 'Honeylink',
  canary_issued: 'Canary diberikan',
  canary_triggered: 'Canary dipakai',
  interrogation_reply: 'Balasan interogasi',
};

export const ARM: Readonly<Record<string, string>> = {
  directory_index: 'Indeks arsip',
  api_docs: 'Dokumentasi API',
  credentials: 'Kredensial',
  incident_report: 'Laporan insiden',
  network_inventory: 'Inventaris jaringan',
  json_api: 'API JSON',
  robots: 'robots.txt',
};

export const TONE_CLASS: Readonly<Record<StatusTone, string>> = {
  trapped: 'text-status-trapped',
  suspect: 'text-status-suspect',
  neutral: 'text-status-neutral',
};

export const USER_STATUS: Readonly<Record<UserStatus, { label: string; tone: StatusTone }>> = {
  active: { label: 'Aktif', tone: 'neutral' },
  disabled: { label: 'Nonaktif', tone: 'suspect' },
};

export const INVOICE_STATUS: Readonly<Record<InvoiceStatus, { label: string; tone: StatusTone }>> =
  {
    open: { label: 'Belum dibayar', tone: 'suspect' },
    paid: { label: 'Lunas', tone: 'neutral' },
    void: { label: 'Dibatalkan', tone: 'neutral' },
  };

/** Kategori filter log audit (awalan aksi). */
export const AUDIT_CATEGORIES: readonly { value: string; label: string }[] = [
  { value: '', label: 'Semua aktivitas' },
  { value: 'auth.', label: 'Masuk & keluar' },
  { value: 'user.', label: 'Pengguna' },
  { value: 'account.', label: 'Akun pribadi' },
  { value: 'settings.', label: 'Pengaturan' },
  { value: 'billing.', label: 'Tagihan' },
  { value: 'rule.', label: 'Aturan' },
];

export const AUDIT_ACTIONS: Readonly<Record<string, string>> = {
  'auth.setup': 'Penyiapan pemilik',
  'auth.setup_failed': 'Token penyiapan salah',
  'auth.login': 'Masuk',
  'auth.login_failed': 'Gagal masuk',
  'auth.login_blocked': 'Masuk diblokir',
  'auth.locked': 'Akun dikunci sementara',
  'auth.logout': 'Keluar',
  'auth.password_reset': 'Kata sandi direset',
  'user.invited': 'Undangan dibuat',
  'user.invite_revoked': 'Undangan dicabut',
  'user.invite_accepted': 'Undangan diterima',
  'user.role_changed': 'Peran diubah',
  'user.disabled': 'Pengguna dinonaktifkan',
  'user.enabled': 'Pengguna diaktifkan',
  'user.reset_link': 'Tautan reset dibuat',
  'user.2fa_reset': '2FA direset admin',
  'account.profile_updated': 'Profil diubah',
  'account.password_changed': 'Kata sandi diganti',
  'account.2fa_enabled': '2FA diaktifkan',
  'account.2fa_disabled': '2FA dimatikan',
  'account.session_revoked': 'Sesi dikeluarkan',
  'account.sessions_revoked': 'Sesi lain dikeluarkan',
  'account.token_created': 'Token API dibuat',
  'account.token_revoked': 'Token API dicabut',
  'settings.update': 'Pengaturan diubah',
  'billing.upgrade': 'Naik paket',
  'billing.downgrade_scheduled': 'Turun paket dijadwalkan',
  'billing.downgrade_canceled': 'Turun paket dibatalkan',
  'billing.invoice_paid': 'Pelunasan dicatat',
  'rule.approved': 'Aturan disetujui',
  'rule.rejected': 'Aturan ditolak',
  'rule.exported': 'Aturan diekspor',
};

/** Ringkas User-Agent jadi "Browser · OS" untuk daftar sesi login. */
export function deviceLabel(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Electron\//.test(ua)
      ? 'Aplikasi desktop NEXA'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Klien lain';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return os ? `${browser} · ${os}` : browser;
}
