// Panel navigasi: tetap di tempat saat konten digulir (sticky), ikon Lucide per menu,
// indikator aktif yang meluncur antar-menu, dan loreng digital hidup di dasar panel.
import { LogOut, UserRound } from 'lucide-react';
import { NAV } from '../lib/nav';
import type { Page } from '../lib/router';
import { cn } from '../lib/utils';
import { LogoMark } from './LogoMark';
import { Loreng } from './Loreng';

/** Tinggi satu item menu (px); dipakai juga untuk posisi indikator aktif. */
const ITEM_H = 48;

export function Sidebar({
  active,
  operator,
  onSignOut,
}: {
  active: Page;
  operator: string;
  onSignOut: () => void;
}) {
  const index = Math.max(
    0,
    NAV.findIndex((n) => n.page === active),
  );
  return (
    <aside className="flex min-w-0 flex-[1_1_220px] flex-col border-line bg-surface md:sticky md:top-[var(--titlebar-h,0px)] md:h-[calc(100vh-var(--titlebar-h,0px))] md:overflow-y-auto md:border-r">
      <div className="flex items-center gap-3 px-6 pt-8 pb-7">
        <LogoMark size={32} />
        <div className="min-w-0">
          <p className="font-sans text-[18px] leading-none font-semibold tracking-[0.16em] text-fg">
            NEXA
          </p>
          <p className="meta mt-1.5">Deception defensif</p>
        </div>
      </div>

      <nav
        aria-label="Navigasi utama"
        className="relative flex flex-row flex-wrap px-3 md:flex-col"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-3 hidden w-[2px] bg-accent transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] md:block"
          style={{ height: ITEM_H, transform: `translateY(${index * ITEM_H}px)` }}
        />
        {NAV.map((item) => {
          const isActive = active === item.page;
          const Icon = item.icon;
          return (
            <a
              key={item.page}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 px-4 text-[14px] transition-colors duration-200',
                isActive
                  ? 'bg-line-subtle text-accent'
                  : 'text-fg-2 hover:bg-line-subtle hover:text-fg',
              )}
              style={{ height: ITEM_H }}
            >
              <Icon
                aria-hidden="true"
                strokeWidth={1.75}
                className={cn(
                  'size-[18px] shrink-0 transition-transform duration-200 ease-out',
                  isActive ? 'scale-110' : 'group-hover:translate-x-0.5 group-hover:scale-105',
                )}
              />
              <span className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                {item.label}
              </span>
            </a>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div className="flex items-center gap-3 border-t border-line px-6 py-4">
          <UserRound aria-hidden="true" strokeWidth={1.75} className="size-[18px] text-muted" />
          <div className="min-w-0 flex-1">
            <p className="meta">Operator</p>
            <p className="truncate text-[13px] text-fg-2">{operator || '—'}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Keluar"
            title="Keluar"
            className="group flex size-11 cursor-pointer items-center justify-center text-muted transition-colors duration-200 hover:bg-line-subtle hover:text-fg active:scale-95"
          >
            <LogOut
              aria-hidden="true"
              strokeWidth={1.75}
              className="size-[18px] transition-transform duration-200 group-hover:translate-x-0.5"
            />
          </button>
        </div>
        <Loreng className="hidden md:block" />
      </div>
    </aside>
  );
}
