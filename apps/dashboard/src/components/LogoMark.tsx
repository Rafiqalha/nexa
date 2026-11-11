// Tanda NEXA (selaras ikon aplikasi): huruf N + garis aksen sage. Flat, tanpa efek.
import { cn } from '../lib/utils';

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 28 28"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
    >
      <rect
        x="0.5"
        y="0.5"
        width="27"
        height="27"
        rx="2"
        fill="none"
        stroke="currentColor"
        className="text-line-strong"
      />
      <path
        d="M8.5 19V8.5L19.5 19V8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
        className="text-fg"
      />
      <path d="M8.5 23h11" stroke="currentColor" strokeWidth="2" className="text-accent" />
    </svg>
  );
}
