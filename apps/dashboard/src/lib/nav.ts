// Navigasi: label profesional + ikon Lucide (satu set ikon di seluruh aplikasi). Satu-satunya
// tempat label menu dan judul halaman (CLAUDE.md §5). Izin hanya menyembunyikan menu; server
// tetap menolak akses tanpa izin.
import type { Permission } from '@nexa/shared';
import {
  BrainCircuit,
  CircleUserRound,
  LayoutDashboard,
  type LucideIcon,
  Radar,
  ReceiptText,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import { type AppPage, HREF } from './router';

export type NavGroup = 'main' | 'admin' | 'account';

export interface NavItem {
  page: AppPage;
  label: string;
  /** Judul lengkap halaman (header & judul jendela). */
  title: string;
  href: string;
  icon: LucideIcon;
  group: NavGroup;
  permission?: Permission;
}

export const NAV: readonly NavItem[] = [
  {
    page: 'dashboard',
    label: 'Dashboard',
    title: 'Dashboard',
    href: HREF.dashboard,
    icon: LayoutDashboard,
    group: 'main',
  },
  {
    page: 'sesi',
    label: 'Sesi',
    title: 'Sesi terdeteksi',
    href: HREF.sesi,
    icon: Radar,
    group: 'main',
  },
  {
    page: 'intel',
    label: 'Intelijen',
    title: 'Intelijen ancaman',
    href: HREF.intel,
    icon: BrainCircuit,
    group: 'main',
  },
  {
    page: 'aturan',
    label: 'Aturan',
    title: 'Aturan deteksi',
    href: HREF.aturan,
    icon: ShieldCheck,
    group: 'main',
  },
  {
    page: 'pengguna',
    label: 'Pengguna',
    title: 'Pengguna & peran',
    href: HREF.pengguna,
    icon: Users,
    group: 'admin',
    permission: 'users:manage',
  },
  {
    page: 'tagihan',
    label: 'Tagihan',
    title: 'Tagihan & paket',
    href: HREF.tagihan,
    icon: ReceiptText,
    group: 'admin',
    permission: 'billing:manage',
  },
  {
    page: 'pengaturan',
    label: 'Pengaturan',
    title: 'Pengaturan',
    href: HREF.pengaturan,
    icon: SlidersHorizontal,
    group: 'admin',
    permission: 'settings:manage',
  },
  {
    page: 'audit',
    label: 'Audit',
    title: 'Log audit',
    href: HREF.audit,
    icon: ScrollText,
    group: 'admin',
    permission: 'audit:read',
  },
  {
    page: 'akun',
    label: 'Akun saya',
    title: 'Akun saya',
    href: HREF.akun,
    icon: CircleUserRound,
    group: 'account',
  },
];

export function navItem(page: AppPage): NavItem {
  return NAV.find((n) => n.page === page) ?? (NAV[0] as NavItem);
}

/** Judul halaman publik (tidak ada di menu). */
export const PUBLIC_TITLES = {
  undangan: 'Terima undangan',
  reset: 'Atur ulang kata sandi',
} as const;
