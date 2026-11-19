import { Fragment, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, COMPONENT_LABEL, KIND_LABEL, type Component, type Incident, type Kind, type Project } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../icons';
import { IncidentForm } from '../IncidentForm';
import { useApiMutation, useHistory, useProject } from '../queries';
import {
  btnDanger, btnPrimary, btnSecondary, Card, Chip, ConfirmDialog, EmptyState, ErrorBox, formatDate,
  providerTone, ProviderChip, Skeleton, StatusBadge,
} from '../ui';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'incidentes', label: 'Incidentes' },
  { id: 'historial', label: 'Historial' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const COMPONENT_ORDER: Component[] = ['frontend', 'backend', 'base_de_datos', 'almacenamiento', 'otro'];
const KIND_ORDER: Kind[] = ['lenguaje', 'framework', 'base_de_datos', 'otro'];
const KIND_PLURAL: Record<Kind, string> = { lenguaje: 'Lenguajes', framework: 'Frameworks', base_de_datos: 'Bases de datos', otro: 'Otras' };

/** Panel lateral con los datos clave del proyecto, siempre visible junto a las pestañas. */
function PropertiesPanel({ project }: { project: Project }) {
  const providers = [...new Set(project.services.map((s) => s.provider))];
  const links = [
    { label: 'Repositorio', href: project.repoUrl },
    { label: 'Producción', href: project.productionUrl },
    { label: 'Documentación', href: project.docsUrl },
  ].filter((l) => l.href);
  const row = 'flex items-start justify-between gap-3 py-2.5 text-sm';
  return (
    <aside aria-label="Propiedades" className="order-first lg:order-last">
      <dl className="animate-in divide-y divide-line rounded-xl border border-line bg-surface px-4">
        <div className={row}><dt className="text-muted">Estado</dt><dd><StatusBadge status={project.status} /></dd></div>
        <div className={row}><dt className="text-muted">Responsable</dt><dd className="text-right font-medium">{project.owner}</dd></div>
        <div className={row}>
          <dt className="text-muted">Dónde vive</dt>
          <dd className="flex flex-wrap justify-end gap-1">{providers.length ? providers.map((v) => <ProviderChip key={v} name={v} />) : '—'}</dd>
        </div>
        <div className={row}><dt className="text-muted">Incidentes</dt><dd className="font-medium">{project.incidentCount}</dd></div>
        <div className={row}><dt className="text-muted">Actualizado</dt><dd>{formatDate(project.updatedAt)}</dd></div>
        {links.length > 0 && (
          <div className="space-y-1.5 py-3 text-sm">
            <dt className="text-muted">Enlaces</dt>
            {links.map((l) => (
              <dd key={l.label}>
                <a href={l.href!} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 text-fg hover:bg-surface2">
                  {l.label}<span className="text-muted" aria-hidden>↗</span>
                </a>
              </dd>
            ))}
          </div>
        )}
      </dl>
    </aside>
  );
}

function Detail({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</dt>
      <dd className="whitespace-pre-line text-sm">{text}</dd>
    </div>
  );
}

/** Diagrama: cada pieza del proyecto como caja, coloreada por proveedor, en el orden frontend → backend → datos. */
function Architecture({ project }: { project: Project }) {
  const services = [...project.services].sort((a, b) => COMPONENT_ORDER.indexOf(a.component) - COMPONENT_ORDER.indexOf(b.component));
  if (services.length === 0) {
    return <EmptyState title="Sin servicios registrados" text="Edita el proyecto para indicar qué pieza vive en qué proveedor." />;
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-center" role="list" aria-label="Arquitectura del proyecto">
        {services.map((s, i) => {
          const tone = providerTone(s.provider);
          return (
            <Fragment key={s.id ?? i}>
              {i > 0 && <span className="self-center text-muted" aria-hidden><span className="md:hidden">↓</span><span className="hidden md:inline">→</span></span>}
              <div role="listitem" className={`min-w-0 flex-1 rounded-xl border bg-surface p-4 md:min-w-[11rem] md:max-w-[16rem] ${tone.border}`}>
                <p className="text-xs uppercase tracking-wide text-muted">{COMPONENT_LABEL[s.component]}</p>
                <p className="mt-0.5 truncate font-semibold">{s.name}</p>
                <p className={`mt-1 text-sm font-medium ${tone.text}`}>{s.provider}</p>
                {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-accent hover:underline">{s.url}</a>}
                {s.notes && <p className="mt-1 text-xs text-muted">{s.notes}</p>}
              </div>
            </Fragment>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        Proveedores: {[...new Set(services.map((s) => s.provider))].join(', ')}
      </p>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const { isEditor } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const projectQuery = useProject(id);
  const history = useHistory(id).data ?? [];
  const project = projectQuery.data;
  const tab: TabId = TABS.some((t) => t.id === params.get('tab')) ? (params.get('tab') as TabId) : 'resumen';

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [incidentToDelete, setIncidentToDelete] = useState<Incident | null>(null);

  const archive = useApiMutation((p: { archive: boolean }) => api('POST', `/api/projects/${id}/${p.archive ? 'archive' : 'unarchive'}`), (p) => (p.archive ? 'Proyecto archivado' : 'Proyecto restaurado'));
  const removeIncident = useApiMutation((incidentId: number) => api('DELETE', `/api/incidents/${incidentId}`), 'Incidente eliminado');
  const addIncident = useApiMutation((v: unknown) => api('POST', `/api/projects/${id}/incidents`, v), 'Incidente registrado');
  const editIncident = useApiMutation((v: { id: number; values: unknown }) => api('PUT', `/api/incidents/${v.id}`, v.values), 'Incidente actualizado');

  if (projectQuery.error && !project) return <ErrorBox error={projectQuery.error} />;
  if (!project) {
    return <div className="space-y-3"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40" /></div>;
  }

  const incidents = project.incidents ?? [];
  const setTab = (t: TabId) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n; }, { replace: true });
  const counts: Partial<Record<TabId, number>> = { incidentes: incidents.length, historial: history.length };

  return (
    <div className="space-y-5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">← Proyectos</Link>
      <ErrorBox error={archive.error ?? removeIncident.error} />

      <header className="animate-in space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold">{project.name}</h1>
              {project.archived && <Chip>Archivado</Chip>}
            </div>
            <p className="mt-1 text-sm text-muted">Responsable: {project.owner}</p>
          </div>
          {isEditor && (
            <div className="flex gap-2">
              <Link to={`/proyectos/${project.id}/editar`} className={btnSecondary}>Editar</Link>
              {project.archived ? (
                <button className={btnSecondary} disabled={archive.isPending} onClick={() => archive.mutate({ archive: false })}>Restaurar</button>
              ) : (
                <button className={btnDanger} onClick={() => setConfirmArchive(true)}>Archivar</button>
              )}
            </div>
          )}
        </div>

      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          <div role="tablist" aria-label="Secciones del proyecto" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                id={`tab-${t.id}`}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition ${tab === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}
              >
                {t.label}
                {counts[t.id] ? <span className="ml-1.5 rounded-full bg-surface2 px-1.5 py-0.5 text-xs text-muted">{counts[t.id]}</span> : null}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="animate-in">
            {tab === 'resumen' && (
              <div className="space-y-4">
                <Card className="space-y-4">
                  <p className="whitespace-pre-line">{project.summary}</p>
                </Card>
                <Card>
                  <h2 className="mb-3 font-semibold">Stack</h2>
                  {project.stack.length === 0 ? <p className="text-sm text-muted">Sin tecnologías registradas.</p> : (
                    <dl className="space-y-3">
                      {KIND_ORDER.filter((k) => project.stack.some((s) => s.kind === k)).map((k) => (
                        <div key={k} className="flex flex-wrap items-center gap-2">
                          <dt className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{KIND_PLURAL[k]}</dt>
                          <dd className="flex flex-wrap gap-1.5">
                            {project.stack.filter((s) => s.kind === k).map((s) => (
                              <Link key={s.name} to={`/?technology=${encodeURIComponent(s.name)}`} title={`Ver proyectos con ${s.name} (${KIND_LABEL[k]})`} className="rounded-md bg-surface2 px-2.5 py-1 font-mono text-sm hover:bg-accent/15">
                                {s.name}
                              </Link>
                            ))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </Card>
              </div>
            )}

            {tab === 'arquitectura' && (
              <Card>
                <Architecture project={project} />
              </Card>
            )}

            {tab === 'incidentes' && (
              <div className="space-y-4">
                {isEditor && !adding && (
                  <button className={btnPrimary} onClick={() => setAdding(true)}><Icon name="plus" className="h-4 w-4" />Registrar incidente</button>
                )}
                {adding && (
                  <Card className="border-accent/40">
                    <IncidentForm onCancel={() => setAdding(false)} onSave={async (v) => { await addIncident.mutateAsync(v); setAdding(false); }} />
                  </Card>
                )}
                {incidents.length === 0 && !adding && (
                  <EmptyState title="Sin incidentes registrados" text="Documentar cada error y su solución evita volver a tropezar con él." />
                )}
                <ol className="relative space-y-4 border-l border-line pl-5 sm:ml-2">
                  {incidents.map((inc) => (
                    <li key={inc.id} className="relative">
                      <span className="absolute -left-[1.62rem] top-4 h-2.5 w-2.5 rounded-full border-2 border-bg bg-amber-500" aria-hidden />
                      <Card>
                        {editingId === inc.id ? (
                          <IncidentForm
                            initial={inc}
                            onCancel={() => setEditingId(null)}
                            onSave={async (values) => { await editIncident.mutateAsync({ id: inc.id, values }); setEditingId(null); }}
                          />
                        ) : (
                          <>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <h3 className="font-semibold">{inc.title}</h3>
                              <time className="text-xs text-muted" dateTime={inc.occurredOn}>{formatDate(inc.occurredOn)}</time>
                            </div>
                            <dl className="mt-3 space-y-3">
                              <Detail title="Cómo se manifestó" text={inc.manifestation} />
                              <Detail title="Causa" text={inc.cause} />
                              <Detail title="Cómo se resolvió" text={inc.resolution} />
                              <Detail title="Qué se mejoró" text={inc.improvement} />
                            </dl>
                            {isEditor && (
                              <div className="mt-4 flex gap-2">
                                <button className={btnSecondary} onClick={() => setEditingId(inc.id)}>Editar</button>
                                <button className={btnDanger} onClick={() => setIncidentToDelete(inc)}>Eliminar</button>
                              </div>
                            )}
                          </>
                        )}
                      </Card>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {tab === 'historial' && (
              history.length === 0 ? <EmptyState title="Sin cambios registrados" /> : (
                <Card>
                  <ul className="divide-y divide-line text-sm">
                    {history.map((h) => (
                      <li key={h.id} className="flex flex-wrap justify-between gap-x-3 py-2.5">
                        <span>{h.summary} <span className="text-muted">· {h.userName}</span></span>
                        <time className="text-xs text-muted" dateTime={h.createdAt}>
                          {new Date(h.createdAt).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                        </time>
                      </li>
                    ))}
                  </ul>
                </Card>
              )
            )}
          </div>
        </div>
        <PropertiesPanel project={project} />
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title="Archivar proyecto"
        message={`"${project.name}" dejará de aparecer en el listado, pero no se borra. Podrás restaurarlo desde "Ver archivados".`}
        confirmLabel="Archivar"
        onCancel={() => setConfirmArchive(false)}
        onConfirm={async () => {
          setConfirmArchive(false);
          try { await archive.mutateAsync({ archive: true }); navigate('/'); } catch { /* el error se muestra arriba */ }
        }}
      />
      <ConfirmDialog
        open={incidentToDelete !== null}
        title="Eliminar incidente"
        message={`¿Eliminar "${incidentToDelete?.title ?? ''}"? Esta acción no se puede deshacer (queda constancia en el historial).`}
        confirmLabel="Eliminar"
        onCancel={() => setIncidentToDelete(null)}
        onConfirm={() => {
          if (incidentToDelete) removeIncident.mutate(incidentToDelete.id);
          setIncidentToDelete(null);
        }}
      />
    </div>
  );
}
