// Titik status koneksi sensor. Teks label tetap wajib di sebelahnya (DESIGN.md §2.3:
// status tidak boleh hanya dibedakan warna).
import type { ConnectionState } from '../lib/stream';
import { cn } from '../lib/utils';

const TONE: Readonly<Record<ConnectionState, string>> = {
  open: 'text-accent',
  connecting: 'text-status-suspect',
  closed: 'text-status-trapped',
};

export function LiveDot({ state, className }: { state: ConnectionState; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('nx-live', TONE[state], className)}
      data-static={state === 'closed' ? '' : undefined}
    />
  );
}
