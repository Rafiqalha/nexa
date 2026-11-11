// Tata letak layar tanpa login (masuk, penyiapan, undangan, reset kata sandi). Label data
// selalu tampil sesuai mode sensor (AGENTS.md §2.11).
import { LAB_LABEL } from '@nexa/shared';
import type { ReactNode } from 'react';
import { LogoMark } from './LogoMark';

export function AuthLayout({
  title,
  subtitle,
  label = LAB_LABEL,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  label?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="nx-page mx-auto flex min-h-screen max-w-[440px] flex-col justify-center px-6 py-14 pt-[calc(var(--titlebar-h,0px)+56px)]">
      <div className="flex items-center gap-3">
        <LogoMark size={36} />
        <p className="font-sans text-[20px] font-semibold tracking-[0.16em] text-fg">NEXA</p>
      </div>
      <h1 className="mt-8 text-[28px] font-medium tracking-[-0.01em]">{title}</h1>
      <p className="meta mt-2">{label}</p>
      {subtitle ? <div className="mt-4 text-[14px] text-fg-2">{subtitle}</div> : null}
      <div className="mt-10">{children}</div>
      {footer ? <div className="meta mt-8">{footer}</div> : null}
    </main>
  );
}
