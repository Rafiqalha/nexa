import type { SessionSummary } from '@nexa/shared';
import { formatDuration, formatInt, formatScore, formatTimeWib } from '../lib/format';
import { CLASSIFICATION } from '../lib/labels';
import { staggerStyle, useChangeCount } from '../lib/motion';
import { sessionHref } from '../lib/router';
import { cn } from '../lib/utils';
import { StatusText } from './StatusText';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

/** Satu baris sesi: masuk bertahap, lalu berkedip singkat saat sensor melaporkan aktivitas baru. */
function SessionRow({ s, index }: { s: SessionSummary; index: number }) {
  const changes = useChangeCount(s.lastSeenAt);
  return (
    <TableRow
      key={changes}
      className={cn(
        'transition-colors duration-200 hover:bg-line-subtle',
        changes > 0 ? 'nx-flash' : 'nx-row',
      )}
      style={changes > 0 ? undefined : staggerStyle(index)}
    >
      <TableCell mono>
        <a
          href={sessionHref(s.id)}
          className="text-fg underline decoration-line-strong underline-offset-4 transition-colors duration-200 hover:decoration-fg"
        >
          {s.sourceIp}
        </a>
        <span className="block font-sans text-[12px] text-muted">
          {CLASSIFICATION[s.classification]}
        </span>
      </TableCell>
      <TableCell>
        <StatusText status={s.status} />
      </TableCell>
      <TableCell numeric className="text-fg-2">
        {formatScore(s.score)}
      </TableCell>
      <TableCell numeric>{formatInt(s.maxDepth)}</TableCell>
      <TableCell numeric>{formatInt(s.estTokens)}</TableCell>
      <TableCell numeric>{formatDuration(s.holdSeconds)}</TableCell>
      <TableCell numeric className="text-fg-2">
        {formatTimeWib(s.lastSeenAt)}
      </TableCell>
    </TableRow>
  );
}

export function ContactsTable({
  sessions,
  empty,
}: {
  sessions: readonly SessionSummary[];
  empty: string;
}) {
  if (sessions.length === 0) {
    return <p className="nx-page border-t border-line py-6 text-[14px] text-muted">{empty}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <tr>
          <TableHead>Sumber</TableHead>
          <TableHead>Status</TableHead>
          <TableHead numeric>Skor</TableHead>
          <TableHead numeric>Kedalaman</TableHead>
          <TableHead numeric>Token est.</TableHead>
          <TableHead numeric>Tertahan</TableHead>
          <TableHead numeric>Terakhir</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {sessions.map((s, i) => (
          <SessionRow key={s.id} s={s} index={i} />
        ))}
      </TableBody>
    </Table>
  );
}
