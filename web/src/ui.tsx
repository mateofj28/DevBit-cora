import { cva, type VariantProps } from 'class-variance-authority';
import {
  Component, useEffect, useRef,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { ApiError, STATUS_LABEL, type Status } from './api';
import { cn } from './cn';

// ---------- Estilos base (usan los colores semánticos de index.css) ----------

export const inputCls =
  'block h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';

// ---------- Botones: una sola definición con variantes y tamaños ----------

export const buttonVariants = cva(
  'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        /** Acción principal: tinta sobre papel (se invierte en modo oscuro). */
        primary: 'bg-fg text-bg hover:opacity-90',
        /** Resalte con el color de marca, para usos puntuales. */
        accent: 'bg-accent text-accent-fg hover:brightness-110',
        secondary: 'border border-line bg-surface text-fg hover:bg-surface2',
        ghost: 'text-muted hover:bg-surface2 hover:text-fg',
        destructive: 'border border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-400',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        icon: 'h-10 w-10 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

// Atajos para usar los mismos estilos en <Link> y otros elementos.
export const btnPrimary = buttonVariants();
export const btnSecondary = buttonVariants({ variant: 'secondary' });
export const btnDanger = buttonVariants({ variant: 'destructive' });

export const Spinner = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" className={cn('spinner', className)} aria-hidden>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function Button({
  variant, size, loading, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** Cabecera común de pantalla: título en serif, descripción y acciones a la derecha. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className ?? ''}`} />;
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className ?? ''}`} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} {...p} className={cn(inputCls, 'h-auto min-h-20 py-2 leading-relaxed', p.className)} />
);

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`animate-in rounded-xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</div>
);

// ---------- Formularios ----------

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  // El mensaje va fuera de <label> para que no pase a formar parte del nombre accesible del campo.
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-fg">{label}</span>
        {children}
      </label>
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      <FieldError message={error} />
    </div>
  );
}

/** Mensaje de error de un campo; se anuncia a lectores de pantalla. */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span role="alert" className="mt-1 block text-xs font-medium text-red-600 dark:text-red-400">{message}</span>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : new ApiError(String((error as Error).message ?? error), 0);
  const details = e.details ?? [];
  return (
    <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
      <p className="font-medium">{e.message}</p>
      {details.length > 1 && (
        <ul className="mt-1 list-disc pl-5">
          {details.map((d, i) => <li key={i}>{d.message}</li>)}
        </ul>
      )}
    </div>
  );
}

/** Convierte los errores por campo que devuelve la API (`details`) en errores del formulario. */
export function applyServerErrors(error: unknown, setError: (name: any, e: { message: string }) => void): boolean {
  if (!(error instanceof ApiError) || !error.details?.length) return false;
  let applied = false;
  for (const d of error.details) {
    if (d.field && d.field !== 'datos') {
      setError(d.field, { message: d.message });
      applied = true;
    }
  }
  return applied;
}

// ---------- Diálogos y errores de pantalla ----------

/** Diálogo modal accesible basado en <dialog> (maneja foco y tecla Esc). */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="modal-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-surface p-5 text-fg shadow-2xl backdrop:bg-black/60"
    >
      {open && (
        <>
          <h2 id="modal-title" className="mb-3 text-lg font-semibold">{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel, danger = true,
}: {
  open: boolean; title: string; message: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className="mb-4 text-sm text-muted">{message}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onCancel}>Cancelar</button>
        <button
          type="button"
          className={danger ? 'inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700' : btnPrimary}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

/** Evita la pantalla en blanco si un componente falla al dibujarse. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md p-8 text-center">
        <p className="mb-3 font-medium">Algo salió mal al mostrar esta pantalla.</p>
        <button className={btnPrimary} onClick={() => location.assign('/')}>Volver al inicio</button>
      </div>
    );
  }
}

// ---------- Estados, proveedores y etiquetas ----------

const STATUS_STYLE: Record<Status, { dot: string; text: string }> = {
  activo: { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  en_desarrollo: { dot: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400' },
  mantenimiento: { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  pausado: { dot: 'bg-slate-400', text: 'text-muted' },
  finalizado: { dot: 'bg-violet-500', text: 'text-violet-600 dark:text-violet-400' },
};

/** Opciones de estado para desplegables y selectores (con su puntito de color). */
export const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as Status[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
  dot: STATUS_STYLE[s].dot,
}));

export const StatusDot = ({ status }: { status: Status }) => (
  <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_STYLE[status].dot}`} aria-hidden />
);

export const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_STYLE[status].text}`}>
    <StatusDot status={status} />
    {STATUS_LABEL[status]}
  </span>
);

interface Tone { chip: string; border: string; text: string }
const TONES: Tone[] = [
  { chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', border: 'border-amber-500/50', text: 'text-amber-700 dark:text-amber-300' },
  { chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', border: 'border-sky-500/50', text: 'text-sky-700 dark:text-sky-300' },
  { chip: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', border: 'border-violet-500/50', text: 'text-violet-700 dark:text-violet-300' },
  { chip: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/50', text: 'text-emerald-700 dark:text-emerald-300' },
  { chip: 'bg-rose-500/15 text-rose-700 dark:text-rose-300', border: 'border-rose-500/50', text: 'text-rose-700 dark:text-rose-300' },
  { chip: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', border: 'border-orange-500/50', text: 'text-orange-700 dark:text-orange-300' },
  { chip: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300', border: 'border-cyan-500/50', text: 'text-cyan-700 dark:text-cyan-300' },
  { chip: 'bg-lime-500/15 text-lime-700 dark:text-lime-300', border: 'border-lime-500/50', text: 'text-lime-700 dark:text-lime-300' },
];
const KNOWN_PROVIDERS: Record<string, number> = { firebase: 0, aws: 5, 'google cloud': 2, azure: 1, railway: 3, vercel: 4, render: 6 };

/** Color estable por proveedor: los conocidos tienen el suyo y el resto se deriva del nombre. */
export function providerTone(name: string): Tone {
  const key = name.trim().toLowerCase();
  if (key in KNOWN_PROVIDERS) return TONES[KNOWN_PROVIDERS[key]];
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length];
}

export const ProviderChip = ({ name }: { name: string }) => (
  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${providerTone(name).chip}`}>{name}</span>
);

/** Etiqueta neutra. Con `mono` se usa para datos técnicos (tecnologías, versiones). */
export const Chip = ({ children, mono }: { children: ReactNode; mono?: boolean }) => (
  <span className={cn('rounded-md bg-surface2 px-2 py-0.5 text-xs font-medium text-muted', mono && 'font-mono')}>{children}</span>
);

export const Skeleton = ({ className = '' }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden />;

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="animate-in rounded-xl border border-dashed border-line px-6 py-12 text-center">
      <p className="text-3xl" aria-hidden>🗂️</p>
      <p className="mt-2 font-semibold">{title}</p>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const formatDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
