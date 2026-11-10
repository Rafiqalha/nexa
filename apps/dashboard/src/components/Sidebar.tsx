import { HREF, type Page } from '../lib/router';
import { cn } from '../lib/utils';
import { Loreng } from './Loreng';

const NAV: ReadonlyArray<{ page: Page; label: string }> = [
  { page: 'pos', label: 'Pos Komando' },
  { page: 'kontak', label: 'Kontak' },
  { page: 'intel', label: 'Intel' },
  { page: 'aturan', label: 'Aturan' },
];

export function Sidebar({
  active,
  operator,
  onSignOut,
}: {
  active: Page;
  operator: string;
  onSignOut: () => void;
}) {
  return (
    <aside className="flex min-w-0 flex-[1_1_220px] flex-col border-line bg-surface md:min-h-screen md:border-r">
      <div className="px-6 pt-8 pb-6">
        <p className="font-sans text-[20px] font-semibold tracking-[0.12em] text-fg">NEXA</p>
        <p className="meta mt-1">Deception defensif</p>
      </div>
      <nav aria-label="Navigasi utama" className="flex flex-row flex-wrap px-3 md:flex-col">
        {NAV.map((item) => (
          <a
            key={item.page}
            href={HREF[item.page]}
            aria-current={active === item.page ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center px-3 text-[14px] transition-colors duration-150',
              active === item.page ? 'text-accent' : 'text-fg-2 hover:text-fg',
            )}
          >
            {item.label}
          </a>
        ))}
      </nav>
      <div className="mt-auto">
        <div className="border-t border-line px-6 py-4">
          <p className="meta">Operator</p>
          <p className="truncate text-[13px] text-fg-2">{operator || '—'}</p>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 min-h-11 cursor-pointer text-[13px] text-muted hover:text-fg"
          >
            Keluar
          </button>
        </div>
        <Loreng className="hidden md:block" />
      </div>
    </aside>
  );
}
