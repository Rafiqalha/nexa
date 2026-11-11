// Tombol gaya shadcn/ui: flat, radius 2px, tinggi >= 44px. Umpan balik klik: riak dari titik
// sentuh + sedikit mengecil saat ditekan (tanpa bayangan). Fokus keyboard: outline aksen 2px.
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'relative inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-xs px-4 font-sans text-[13px] font-medium transition-[transform,filter,background-color,border-color,color] duration-150 ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:brightness-110',
        secondary:
          'border border-line-strong bg-transparent text-fg hover:border-muted hover:bg-line-subtle',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

let rippleSeq = 0;

export function Button({
  className,
  variant,
  asChild = false,
  type,
  onPointerDown,
  children,
  ...props
}: ButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const classes = cn(buttonVariants({ variant }), className);

  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      type={type ?? 'button'}
      className={classes}
      onPointerDown={(e) => {
        onPointerDown?.(e);
        if (props.disabled || prefersReducedMotion()) return;
        const r = e.currentTarget.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2.4;
        rippleSeq += 1;
        const ripple = { id: rippleSeq, x: e.clientX - r.left, y: e.clientY - r.top, size };
        setRipples((rs) => [...rs.slice(-3), ripple]);
      }}
      {...props}
    >
      {children}
      {ripples.map((rp) => (
        <span
          key={rp.id}
          aria-hidden="true"
          className="nx-ripple"
          style={{ left: rp.x, top: rp.y, width: rp.size, height: rp.size }}
          onAnimationEnd={() => setRipples((rs) => rs.filter((x) => x.id !== rp.id))}
        />
      ))}
    </button>
  );
}
