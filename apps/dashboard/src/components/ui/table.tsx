// Tabel gaya shadcn/ui sesuai DESIGN.md §8.2: header muted, garis 1px, tanpa zebra/hover berwarna.
import type * as React from 'react';
import { cn } from '../../lib/utils';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full min-w-[560px] border-collapse text-left', className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />;
}

export function TableBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />;
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-line-subtle', className)} {...props} />;
}

export function TableHead({
  className,
  numeric,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-line py-3 pr-4 text-[12px] font-normal text-muted last:pr-0',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  numeric,
  mono,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean; mono?: boolean }) {
  return (
    <td
      className={cn(
        'py-[14px] pr-4 align-top last:pr-0',
        (mono || numeric) && 'font-mono text-[13px]',
        numeric && 'text-right',
        className,
      )}
      {...props}
    />
  );
}
