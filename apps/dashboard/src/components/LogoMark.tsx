// Tanda NEXA "Simpul" (selaras ikon aplikasi): huruf N yang ditutup kembali ke titik awalnya (Z),
// sehingga N, X, dan ∞ menjadi satu goresan tak terputus. Ujung lancip dipancung (bevel). Satu warna,
// tanpa bingkai, tanpa efek. Konstruksi: docs/brand/logo.md.
import { cn } from '../lib/utils';

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="6 6 52 52"
      width={size}
      height={size}
      className={cn('shrink-0 text-fg', className)}
    >
      <path
        d="M13 53.375V10.625L51 53.375V10.625Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinejoin="bevel"
      />
    </svg>
  );
}
