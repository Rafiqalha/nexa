import type { SessionSummary } from '@nexa/shared';
import { formatDuration, formatInt, formatScore, formatTimeWib } from '../lib/format';
import { CLASSIFICATION } from '../lib/labels';
import { StatusText } from './StatusText';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

export function ContactsTable({
  sessions,
  empty,
}: {
  sessions: readonly SessionSummary[];
  empty: string;
}) {
  if (sessions.length === 0) {
    return <p className="border-t border-line py-6 text-[14px] text-muted">{empty}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <tr>
          <TableHead>Kontak</TableHead>
          <TableHead>Status</TableHead>
          <TableHead numeric>Skor</TableHead>
          <TableHead numeric>Kedalaman</TableHead>
          <TableHead numeric>Token est.</TableHead>
          <TableHead numeric>Tertahan</TableHead>
          <TableHead numeric>Terakhir</TableHead>
        </tr>
      </TableHeader>
      <TableBody>
        {sessions.map((s) => (
          <TableRow key={s.id}>
            <TableCell mono>
              <a
                href={`#/kontak/${s.id}`}
                className="text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg"
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
        ))}
      </TableBody>
    </Table>
  );
}
