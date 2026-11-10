import { LAB_LABEL } from '@nexa/shared';
import { useEffect, useState } from 'react';
import { formatClockWib } from '../lib/format';
import { useAppState } from '../lib/store';

const CONNECTION_LABEL = {
  open: 'Sensor aktif',
  connecting: 'Menghubungkan sensor',
  closed: 'Sensor terputus',
} as const;

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const { connection } = useAppState();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.01em] text-fg">
          {title}
        </h1>
        <p className="meta mt-2">
          <span className={connection === 'closed' ? 'text-status-suspect' : undefined}>
            {CONNECTION_LABEL[connection]}
          </span>
          {' · '}
          {formatClockWib(now)}
          {' · '}
          {LAB_LABEL}
        </p>
      </div>
      {children}
    </header>
  );
}
