import { LAB_LABEL } from '@nexa/shared';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatClockWib } from '../lib/format';
import { useAppState } from '../lib/store';
import { LiveDot } from './LiveDot';

const CONNECTION_LABEL = {
  open: 'Sensor aktif',
  connecting: 'Menghubungkan sensor',
  closed: 'Sensor terputus',
} as const;

export function PageHeader({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}) {
  const { connection } = useAppState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-3 text-[28px] leading-tight font-medium tracking-[-0.01em] text-fg">
          {Icon ? (
            <Icon aria-hidden="true" strokeWidth={1.5} className="size-7 shrink-0 text-muted" />
          ) : null}
          {title}
        </h1>
        <p className="meta mt-2 flex flex-wrap items-center gap-x-2">
          <LiveDot state={connection} />
          <span className={connection === 'closed' ? 'text-status-suspect' : undefined}>
            {CONNECTION_LABEL[connection]}
          </span>
          <span>·</span>
          <span>{formatClockWib(now)}</span>
          <span>·</span>
          <span>{LAB_LABEL}</span>
        </p>
      </div>
      {children}
    </header>
  );
}
