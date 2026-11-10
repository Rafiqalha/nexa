// Label Bahasa Indonesia untuk nilai enum. Status selalu = warna teks + label (DESIGN.md §2.3).
import type { Classification, EventKind, SessionStatus } from '@nexa/shared';

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
