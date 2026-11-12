// Panel navigasi: tetap di tempat saat konten digulir (sticky), ikon Lucide per menu, grup
// Administrasi hanya untuk peran yang berizin, indikator aktif yang meluncur antar-menu,
// akun pengguna di bawah, dan loreng digital hidup di dasar panel.
import { can, type Principal, ROLE_LABELS } from '@nexa/shared';
import { CircleUserRound, LogOut } from 'lucide-react';
import { NAV, type NavItem } from '../lib/nav';
import type { AppPage } from '../lib/router';
import { HREF } from '../lib/router';
import { cn } from '../lib/utils';
import { LogoMark } from './LogoMark';
import { Loreng } from './Loreng';

/** Tinggi satu item menu & label grup (px); dipakai juga untuk posisi indikator aktif. */
const ITEM_H = 48;
const LABEL_H = 40;

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 px-4 text-[14px] transition-colors duration-200',
        active ? 'bg-line-subtle text-accent' : 'text-fg-2 hover:bg-line-subtle hover:text-fg',
      )}
      style={{ height: ITEM_H }}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={1.75}
        className={cn(
          'size-[18px] shrink-0 transition-transform duration-200 ease-out',
          active ? 'scale-110' : 'group-hover:translate-x-0.5 group-hover:scale-105',
        )}
      />
      <span className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">
        {item.label}
      </span>
    </a>
  );
}

export function Sidebar({
  active,
  principal,
  orgName,
  onSignOut,
}: {
  active: AppPage;
  principal: Principal;
  orgName: string;
  onSignOut: () => void;
}) {
  const visible = NAV.filter((n) => !n.permission || can(principal.role, n.permission));
  const main = visible.filter((n) => n.group === 'main');
  const admin = visible.filter((n) => n.group === 'admin');
  const mainIdx = main.findIndex((n) => n.page === active);
  const adminIdx = admin.findIndex((n) => n.page === active);
  const offset =
    mainIdx >= 0
      ? mainIdx * ITEM_H
      : adminIdx >= 0
        ? main.length * ITEM_H + LABEL_H + adminIdx * ITEM_H
        : null;
  const onAccount = active === 'akun';

  return (
    <aside className="flex min-w-0 flex-[1_1_220px] flex-col border-line bg-surface md:sticky md:top-[var(--titlebar-h,0px)] md:h-[calc(100vh-var(--titlebar-h,0px))] md:overflow-y-auto md:border-r">
      <div className="flex items-center gap-3 px-6 pt-8 pb-7">
        <LogoMark size={26} />
        <div className="min-w-0">
          <p className="font-sans text-[18px] leading-none font-semibold tracking-[0.16em] text-fg">
            NEXA
          </p>
          <p className="meta mt-1.5 truncate" title={orgName}>
            {orgName}
          </p>
        </div>
      </div>

      <nav
        aria-label="Navigasi utama"
        className="relative flex flex-row flex-wrap px-3 md:flex-col"
      >
        {offset !== null ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-3 hidden w-[2px] bg-accent transition-transform duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)] md:block"
            style={{ height: ITEM_H, transform: `translateY(${offset}px)` }}
          />
        ) : null}
        {main.map((item) => (
          <NavLink key={item.page} item={item} active={active === item.page} />
        ))}
        {admin.length > 0 ? (
          <>
            <p
              className="label-caps hidden items-end px-4 pb-2 md:flex"
              style={{ height: LABEL_H }}
            >
              Administrasi
            </p>
            {admin.map((item) => (
              <NavLink key={item.page} item={item} active={active === item.page} />
            ))}
          </>
        ) : null}
      </nav>

      <div className="mt-auto">
        <div className="flex items-center gap-2 border-t border-line px-3 py-3">
          <a
            href={HREF.akun}
            aria-current={onAccount ? 'page' : undefined}
            className={cn(
              'group flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 transition-colors duration-200',
              onAccount ? 'bg-line-subtle text-fg' : 'hover:bg-line-subtle',
            )}
          >
            <CircleUserRound
              aria-hidden="true"
              strokeWidth={1.75}
              className="size-[18px] shrink-0 text-muted transition-transform duration-200 group-hover:scale-105"
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] text-fg-2">{principal.name}</span>
              {/* Pemilik selalu Admin dan tidak bisa diturunkan, jadi "Pemilik" saja agar muat. */}
              <span
                className="meta block truncate"
                title={`${ROLE_LABELS[principal.role]}${principal.isOwner ? ' · Pemilik' : ''}`}
              >
                {principal.isOwner ? 'Pemilik' : ROLE_LABELS[principal.role]}
              </span>
            </span>
          </a>
          <button
            type="button"
            onClick={onSignOut}
            aria-label="Keluar"
            title="Keluar"
            className="group flex size-11 shrink-0 cursor-pointer items-center justify-center text-muted transition-colors duration-200 hover:bg-line-subtle hover:text-fg active:scale-95"
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
