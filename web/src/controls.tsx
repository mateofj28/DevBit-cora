import * as Popover from '@radix-ui/react-popover';
import * as RadioGroup from '@radix-ui/react-radio-group';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as Switch from '@radix-ui/react-switch';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { inputCls } from './ui';

const EMPTY = '__vacio__'; // Radix no admite value="" en las opciones

export interface Option<T extends string = string> {
  value: T;
  label: string;
  /** Clase de color para el puntito que precede al texto (opcional). */
  dot?: string;
}

const Chevron = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 text-muted ${className}`} aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const panelCls =
  'z-50 overflow-hidden rounded-xl border border-line bg-surface text-fg shadow-2xl shadow-black/30 animate-in';
const itemCls =
  'relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent/15 data-[state=checked]:font-semibold';

/** Desplegable propio (reemplaza al <select> nativo). Una opción con value "" actúa como "sin selección". */
export function Dropdown<T extends string>({
  value, onChange, options, 'aria-label': ariaLabel, className = '', disabled,
}: {
  value: T | '';
  onChange: (v: T | '') => void;
  options: Array<Option<T | ''>>;
  'aria-label': string;
  className?: string;
  disabled?: boolean;
}) {
  const enc = (v: string) => (v === '' ? EMPTY : v);
  const current = options.find((o) => o.value === value);
  return (
    <SelectPrimitive.Root value={enc(value)} onValueChange={(v) => onChange((v === EMPTY ? '' : v) as T | '')} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={`${inputCls} flex items-center justify-between gap-2 text-left data-[placeholder]:text-muted ${className}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${current.dot}`} aria-hidden />}
          <span className="truncate"><SelectPrimitive.Value>{current?.label}</SelectPrimitive.Value></span>
        </span>
        <SelectPrimitive.Icon><Chevron /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className={`${panelCls} min-w-[var(--radix-select-trigger-width)] max-h-72`}>
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={enc(o.value)} className={itemCls}>
                {o.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${o.dot}`} aria-hidden />}
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ml-auto text-accent">✓</SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** Opciones en forma de "píldoras" (pocas opciones y todas visibles). */
export function Segmented<T extends string>({
  value, onChange, options, 'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<Option<T>>;
  'aria-label': string;
}) {
  return (
    <RadioGroup.Root value={value} onValueChange={(v) => onChange(v as T)} aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted transition hover:text-fg data-[state=checked]:border-accent data-[state=checked]:bg-accent/15 data-[state=checked]:text-fg"
        >
          {o.dot && <span className={`h-2 w-2 rounded-full ${o.dot}`} aria-hidden />}
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/**
 * Campo de texto con sugerencias: se escribe directamente y el panel propone coincidencias del catálogo.
 * Si lo escrito no existe, se ofrece crearlo (se agrega al catálogo al guardar).
 */
export function Combobox({
  value, onChange, suggestions, placeholder, 'aria-label': ariaLabel, createLabel = 'Nuevo', className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  'aria-label': string;
  createLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const term = value.trim().toLowerCase();

  const items = useMemo(() => {
    const matches = suggestions.filter((s) => s.toLowerCase().includes(term)).slice(0, 8);
    const exact = suggestions.some((s) => s.toLowerCase() === term);
    return term && !exact ? [...matches, `__crear__${value.trim()}`] : matches;
  }, [suggestions, term, value]);

  const pick = (item: string) => {
    onChange(item.startsWith('__crear__') ? item.slice(9) : item);
    setOpen(false);
  };

  return (
    <Popover.Root open={open && items.length > 0} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div className="relative">
          <input
            value={value}
            placeholder={placeholder}
            aria-label={ariaLabel}
            role="combobox"
            aria-expanded={open && items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            className={`${inputCls} ${className}`}
            onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, items.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); pick(items[active]); }
              else if (e.key === 'Escape') setOpen(false);
            }}
          />
        </div>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => e.preventDefault()} // el foco se queda en el campo de texto
          onInteractOutside={(e) => { if ((e.target as HTMLElement).getAttribute?.('role') === 'combobox') e.preventDefault(); }}
          className={`${panelCls} w-[var(--radix-popover-trigger-width)] min-w-56`}
        >
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {items.map((item, i) => {
              const create = item.startsWith('__crear__');
              return (
                <li
                  key={item}
                  role="option"
                  aria-selected={i === active}
                  data-highlighted={i === active ? '' : undefined}
                  className={itemCls}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => { e.preventDefault(); pick(item); }} // antes de que el campo pierda el foco
                >
                  {create ? (
                    <><span className="rounded bg-accent/20 px-1.5 text-xs text-accent">{createLabel}</span>«{item.slice(9)}»</>
                  ) : item}
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Interruptor con texto. */
export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5">
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-5 w-9 shrink-0 rounded-full bg-line transition data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[1.1rem]" />
      </Switch.Root>
      <label htmlFor={id} className="cursor-pointer text-sm text-muted">{children}</label>
    </div>
  );
}
