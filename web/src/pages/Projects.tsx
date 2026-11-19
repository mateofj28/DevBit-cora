import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KIND_LABEL, STATUS_LABEL, type Status } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../icons';
import { useCatalog, useProjects } from '../queries';
import { Dropdown, SearchSelect, Toggle } from '../controls';
import { btnPrimary, Chip, EmptyState, ErrorBox, Input, PageHeader, ProviderChip, Skeleton, STATUS_OPTIONS, StatusBadge } from '../ui';

const COLS = 'md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_4.5rem] md:items-center md:gap-4';

export default function ProjectsPage() {
  const { isEditor } = useAuth();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');

  const filters = {
    q: params.get('q') ?? '',
    technology: params.get('technology') ?? '',
    provider: params.get('provider') ?? '',
    status: params.get('status') ?? '',
    archived: params.get('archived') === 'true',
  };

  const catalog = useCatalog();
  const projects = useProjects(filters);
  const technologies = catalog.data?.technologies ?? [];
  const providers = catalog.data?.providers ?? [];

  function setParam(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true });
  }

  // Si la URL cambia desde fuera (buscador global, enlaces), el campo de texto la sigue.
  useEffect(() => setText(filters.q), [filters.q]);

  // Espera a que el usuario deje de escribir antes de buscar.
  useEffect(() => {
    if (text.trim() === filters.q) return;
    const t = setTimeout(() => setParam('q', text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const active: Array<{ key: string; label: string }> = [
    filters.q && { key: 'q', label: `Texto: ${filters.q}` },
    filters.technology && { key: 'technology', label: `Tecnología: ${filters.technology}` },
    filters.provider && { key: 'provider', label: `Proveedor: ${filters.provider}` },
    filters.status && { key: 'status', label: `Estado: ${STATUS_LABEL[filters.status as Status] ?? filters.status}` },
    filters.archived && { key: 'archived', label: 'Archivados' },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  const list = projects.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Proyectos"
        description={list ? `${list.length} ${list.length === 1 ? 'proyecto' : 'proyectos'}${active.length ? ' con los filtros aplicados' : ''}` : 'Cargando…'}
      />

      <div className="space-y-3">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            className="!pl-9"
            placeholder="Filtrar proyectos…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Buscar"
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <SearchSelect
            aria-label="Tecnología"
            allLabel="Toda tecnología"
            searchPlaceholder="Buscar tecnología…"
            value={filters.technology}
            onChange={(v) => setParam('technology', v)}
            options={technologies.map((t) => ({ value: t.name, label: t.name, hint: KIND_LABEL[t.kind] ?? t.kind }))}
          />
          <SearchSelect
            aria-label="Proveedor"
            allLabel="Todo proveedor"
            searchPlaceholder="Buscar proveedor…"
            value={filters.provider}
            onChange={(v) => setParam('provider', v)}
            options={providers.map((p) => ({ value: p, label: p }))}
          />
          <Dropdown
            aria-label="Estado"
            value={filters.status}
            onChange={(v) => setParam('status', v)}
            options={[{ value: '', label: 'Todo estado' }, ...STATUS_OPTIONS]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {providers.slice(0, 8).map((p) => (
            <button
              key={p}
              aria-pressed={filters.provider === p}
              onClick={() => setParam('provider', filters.provider === p ? '' : p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${filters.provider === p ? 'border-accent bg-accent text-accent-fg' : 'border-line text-muted hover:bg-surface2 hover:text-fg'}`}
            >
              {p}
            </button>
          ))}
          <div className="ml-auto">
            <Toggle checked={filters.archived} onChange={(on) => setParam('archived', on ? 'true' : '')}>Ver archivados</Toggle>
          </div>
        </div>
        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
            {active.map((a) => (
              <button key={a.key} onClick={() => setParam(a.key, '')} className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/25">
                {a.label} <span aria-label="Quitar filtro">✕</span>
              </button>
            ))}
            <button className="text-xs text-muted hover:text-fg hover:underline" onClick={() => setParams({}, { replace: true })}>Limpiar todo</button>
          </div>
        )}
      </div>

      <ErrorBox error={projects.error} />

      {projects.isPending && (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      )}

      {list?.length === 0 && (
        <EmptyState
          title={active.length ? 'Ningún proyecto coincide' : 'Todavía no hay proyectos'}
          text={active.length ? 'Prueba quitando algún filtro.' : isEditor ? 'Registra el primero para empezar el catálogo.' : 'Cuando el equipo registre proyectos aparecerán aquí.'}
          action={!active.length && isEditor ? <Link to="/proyectos/nuevo" className={btnPrimary}>Nuevo proyecto</Link> : undefined}
        />
      )}

      {list && list.length > 0 && (
        <div className={`animate-in overflow-hidden rounded-xl border border-line bg-surface ${projects.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={projects.isFetching}>
          <div className={`hidden border-b border-line px-4 py-2.5 text-xs font-medium text-muted ${COLS}`}>
            <span>Proyecto</span><span>Responsable</span><span>Dónde vive</span><span className="text-right">Incid.</span>
          </div>
          <ul className="divide-y divide-line">
            {list.map((p) => {
              const providerNames = [...new Set(p.services.map((s) => s.provider))];
              return (
                <li key={p.id}>
                  <Link to={`/proyectos/${p.id}`} className={`block px-4 py-3.5 transition hover:bg-surface2 ${COLS}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate font-semibold">{p.name}</h2>
                        <StatusBadge status={p.status} />
                        {p.archived && <Chip>Archivado</Chip>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {p.stack.length ? <span className="font-mono">{p.stack.slice(0, 5).map((s) => s.name).join(' · ')}</span> : p.summary}
                      </p>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted md:mt-0">{p.owner}</p>
                    <div className="mt-2 flex flex-wrap gap-1 md:mt-0">
                      {providerNames.length ? providerNames.map((v) => <ProviderChip key={v} name={v} />) : <span className="text-xs text-muted">—</span>}
                    </div>
                    <p className={`mt-2 text-xs md:mt-0 md:text-right md:text-sm ${p.incidentCount ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-muted'}`}>
                      <span className="md:hidden">Incidentes: </span>{p.incidentCount}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
