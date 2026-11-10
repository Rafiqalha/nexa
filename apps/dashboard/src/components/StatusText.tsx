import type { SessionStatus } from '@nexa/shared';
import { SESSION_STATUS, TONE_CLASS } from '../lib/labels';

/** Status = warna teks + label (bukan kapsul berlatar), DESIGN.md §1.3 & §2.3. */
export function StatusText({ status }: { status: SessionStatus }) {
  const s = SESSION_STATUS[status];
  return <span className={TONE_CLASS[s.tone]}>{s.label}</span>;
}
