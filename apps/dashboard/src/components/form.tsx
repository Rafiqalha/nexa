// Primitif formulir flat (DESIGN.md: garis 1px, tanpa kartu/bayangan, target sentuh >= 44px).
import { Check, Copy } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

export const inputClass =
  'mt-2 block min-h-11 w-full border border-line-strong bg-bg px-3 text-[14px] text-fg transition-colors duration-200 placeholder:text-muted hover:border-muted focus:border-fg-2 disabled:cursor-not-allowed disabled:opacity-60';

export const monoInputClass = cn(inputClass, 'font-mono text-[13px]');

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: kontrol (input/select) bersarang lewat children = asosiasi implisit yang sah
    <label className={cn('block text-[13px] text-fg-2', className)}>
      {label}
      {children}
      {hint ? <span className="meta mt-1.5 block">{hint}</span> : null}
    </label>
  );
}

/** Pesan galat; `attempt` memutar ulang animasi getar setiap percobaan gagal. */
export function FormError({ message, attempt = 0 }: { message: string | null; attempt?: number }) {
  if (!message) return null;
  return (
    <p key={attempt} role="alert" className="nx-shake text-[13px] text-status-trapped">
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="nx-tick text-[13px] text-fg-2">
      {message}
    </p>
  );
}

export function Section({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <h2 id={id} className="text-[16px] font-medium text-fg">
            {title}
          </h2>
          {description ? <p className="meta mt-1.5 max-w-[72ch]">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Nilai sekali tampil (tautan undangan, token API) dengan tombol salin. */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(monoInputClass, 'mt-0 min-w-0 flex-[1_1_320px]')}
      />
      <Button
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1_600);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? (
          <Check aria-hidden="true" strokeWidth={2} className="nx-draw size-4" />
        ) : (
          <Copy aria-hidden="true" strokeWidth={2} className="size-4" />
        )}
        {copied ? 'Tersalin' : `Salin ${label.toLowerCase()}`}
      </Button>
    </div>
  );
}

/** Daftar definisi dua kolom (info baca-saja). */
export function InfoList({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-10 gap-y-4 sm:grid-cols-[minmax(160px,auto)_1fr]">
      {items.map((it) => (
        <div key={it.label} className="contents">
          <dt className="label-caps sm:pt-0.5">{it.label}</dt>
          <dd className="min-w-0 font-mono text-[13px] text-fg-2 [overflow-wrap:anywhere]">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
