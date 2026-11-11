// Navigasi utama: label profesional + ikon Lucide (satu set ikon di seluruh aplikasi).
import { BrainCircuit, LayoutDashboard, type LucideIcon, Radar, ShieldCheck } from 'lucide-react';
import { HREF, type Page } from './router';

export interface NavItem {
  page: Page;
  label: string;
  /** Judul lengkap halaman (header & judul jendela). */
  title: string;
  href: string;
  icon: LucideIcon;
}

export const NAV: readonly NavItem[] = [
  {
    page: 'dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    href: HREF.dashboard,
    icon: LayoutDashboard,
  },
  { page: 'sesi', label: 'Sesi', title: 'Sesi terdeteksi', href: HREF.sesi, icon: Radar },
  {
    page: 'intel',
    label: 'Intelijen',
    title: 'Intelijen ancaman',
    href: HREF.intel,
    icon: BrainCircuit,
  },
  {
    page: 'aturan',
    label: 'Aturan',
    title: 'Aturan deteksi',
    href: HREF.aturan,
    icon: ShieldCheck,
  },
];

export function navItem(page: Page): NavItem {
  return NAV.find((n) => n.page === page) ?? (NAV[0] as NavItem);
}
