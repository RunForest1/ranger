import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90 disabled:opacity-60',
  secondary: 'border border-border text-primary hover:border-accent disabled:opacity-60',
  ghost: 'text-muted hover:text-primary disabled:opacity-60',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export default function Button({ variant = 'primary', className = '', ...rest }: ButtonProps) {
  return (
    <button
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    />
  );
}
