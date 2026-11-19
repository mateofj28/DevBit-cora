import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { Icon } from './icons';
import { useCatalog, useProjects } from './queries';
import { StatusDot } from './ui';

interface Item { key: string; group: string; label: string; hint?: string; run: () => void; status?: any }

/** Buscador global (Ctrl/Cmd + K): proyectos, proveedores, tecnologías y acciones. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      onClick={(e) => e.target === ref.current && onClose()} // clic en el fondo
      aria-label="Buscador"
      className="mx-auto mt-[12vh] w-[calc(100%-1.5rem)] max-w-xl rounded-xl border border-line bg-surface p-0 text-fg shadow-2xl backdrop:bg-black/60"
    >
      {open && <PaletteBody onClose={onClose} />}
    </dialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { isEditor } = useAuth();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const catalog = useCatalog().data;
  const projects = useProjects({ q: q.trim(), technology: '', provider: '', status: '', archived: false }).data ?? [];

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => { onClose(); navigate(to); };
    const term = q.trim().toLowerCase();
    const match = (s: string) => !term || s.toLowerCase().includes(term);
    const list: Item[] = [];

    if (isEditor && match('nuevo proyecto crear')) list.push({ key: 'new', group: 'Acciones', label: 'Nuevo proyecto', run: go('/proyectos/nuevo') });
    if (match('todos los proyectos')) list.push({ key: 'all', group: 'Acciones', label: 'Ver todos los proyectos', run: go('/') });

    projects.slice(0, 6).forEach((p) =>
      list.push({ key: `p${p.id}`, group: 'Proyectos', label: p.name, hint: p.owner, status: p.status, run: go(`/proyectos/${p.id}`) }),
    );
    (catalog?.providers ?? []).filter(match).slice(0, term ? 4 : 5).forEach((p) =>
      list.push({ key: `v${p}`, group: 'Filtrar por proveedor', label: p, run: go(`/?provider=${encodeURIComponent(p)}`) }),
    );
    if (term) {
      (catalog?.technologies ?? []).filter((t) => match(t.name)).slice(0, 4).forEach((t) =>
        list.push({ key: `t${t.name}`, group: 'Filtrar por tecnología', label: t.name, run: go(`/?technology=${encodeURIComponent(t.name)}`) }),
      );
    }
    return list;
  }, [q, projects, catalog, isEditor, navigate, onClose]);

  useEffect(() => setActive(0), [q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
  }

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Icon name="search" className="h-4 w-4 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar proyectos, proveedores, tecnologías o errores…"
          aria-label="Buscar"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          className="w-full bg-transparent py-3.5 text-base text-fg outline-none placeholder:text-muted/70"
        />
        <kbd className="hidden rounded border border-line px-1.5 text-xs text-muted sm:block">Esc</kbd>
      </div>
      <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Sin resultados para "{q}".</li>}
        {items.map((it, i) => (
          <li key={it.key} role="presentation">
            {(i === 0 || items[i - 1].group !== it.group) && (
              <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted">{it.group}</p>
            )}
            <button
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={it.run}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${i === active ? 'bg-accent/15 text-fg' : 'text-fg'}`}
            >
              {it.status && <StatusDot status={it.status} />}
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && <span className="truncate text-xs text-muted">{it.hint}</span>}
              {i === active && <Icon name="arrow" className="h-4 w-4 text-muted" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
