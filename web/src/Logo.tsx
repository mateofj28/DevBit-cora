import { cn } from './cn';

/** Marca: un cuaderno (lomo oscuro, marcador amarillo) y el nombre en serif. */
export function LogoMark({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="3" y="2" width="26" height="28" rx="4" fill="#c2410c" />
      <path d="M3 6a4 4 0 0 1 4-4h2v28H7a4 4 0 0 1-4-4z" fill="#7c2d12" />
      <path d="M14 10h10M14 15h10M14 20h6" stroke="#fff7ed" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 2h4v9l-2-1.6L22 11z" fill="#fbbf24" />
    </svg>
  );
}

export function Logo({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className={size === 'lg' ? 'h-10 w-10' : 'h-7 w-7'} />
      <span className={cn('font-serif font-semibold tracking-tight', size === 'lg' ? 'text-3xl' : 'text-xl')}>
        Dev<span className="text-accent">Bitácora</span>
      </span>
    </span>
  );
}
