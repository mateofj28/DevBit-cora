import { useEffect, useState, type MouseEvent } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  api, COMPONENT_LABEL, KIND_LABEL,
  type Component, type Kind, type Project,
} from '../api';
import { useAuth } from '../auth';
import { Combobox, Dropdown, Segmented } from '../controls';
import { useConfirm } from '../confirm';
import { IncidentFields } from '../IncidentForm';
import { useApiMutation, useCatalog, useProject } from '../queries';
import { emptyIncident, projectSchema, type ProjectValues } from '../schemas';
import {
  applyServerErrors, btnDanger, btnSecondary, Button, Card, ErrorBox, Field, FieldError, Input, PageHeader, STATUS_OPTIONS, Textarea,
} from '../ui';

const blank: ProjectValues = {
  name: '', summary: '', status: 'activo', owner: '', repoUrl: '', productionUrl: '', docsUrl: '',
  stack: [{ name: '', kind: 'lenguaje' }],
  services: [{ name: '', component: 'frontend', provider: '', url: '' }],
  incidents: [],
};

function toFormValues(p: Project): ProjectValues {
  return {
    name: p.name, summary: p.summary, status: p.status, owner: p.owner,
    repoUrl: p.repoUrl ?? '', productionUrl: p.productionUrl ?? '', docsUrl: p.docsUrl ?? '',
    stack: p.stack.length ? p.stack : blank.stack,
    services: p.services.length ? p.services.map((s) => ({ name: s.name, component: s.component, provider: s.provider, url: s.url ?? '' })) : blank.services,
    incidents: [],
  };
}

export default function ProjectFormPage() {
  const { id } = useParams();
  const { isEditor } = useAuth();
  const project = useProject(id, isEditor);

  if (!isEditor) return <Navigate to="/" replace />;
  if (id && project.error) return <ErrorBox error={project.error} />;
  if (id && !project.data) return <p className="text-muted">Cargando…</p>;
  // El formulario se monta una vez que los datos existen, para que arranque con los valores correctos.
  return <ProjectForm id={id} initial={project.data ? toFormValues(project.data) : blank} />;
}

/** Quita las filas vacías y recuerda de qué fila original venía cada una (para ubicar errores del servidor). */
function compact<T>(rows: T[], isUsed: (r: T) => boolean) {
  const kept: number[] = [];
  const items = rows.filter((r, i) => (isUsed(r) ? (kept.push(i), true) : false));
  return { items, kept };
}

function ProjectForm({ id, initial }: { id?: string; initial: ProjectValues }) {
  const editing = Boolean(id);
  const navigate = useNavigate();
  const catalog = useCatalog().data;
  const [formError, setFormError] = useState<unknown>(null);

  const {
    register, control, handleSubmit, setValue, setError, formState: { errors, isSubmitting, isDirty },
  } = useForm<ProjectValues>({ resolver: zodResolver(projectSchema), defaultValues: initial });
  const stack = useFieldArray({ control, name: 'stack' });
  const services = useFieldArray({ control, name: 'services' });
  const incidents = useFieldArray({ control, name: 'incidents' });
  const stackValues = useWatch({ control, name: 'stack' });
  const techByName = new Map((catalog?.technologies ?? []).map((t) => [t.name.toLowerCase(), t]));
  const techHints = Object.fromEntries((catalog?.technologies ?? []).map((t) => [t.name, KIND_LABEL[t.kind] ?? t.kind]));

  const save = useApiMutation((body: unknown) => api<Project>(editing ? 'PUT' : 'POST', editing ? `/api/projects/${id}` : '/api/projects', body), editing ? 'Cambios guardados' : 'Proyecto creado');

  const submit = handleSubmit(async (v) => {
    setFormError(null);
    const stackRows = compact(v.stack, (s) => s.name.trim() !== '');
    const serviceRows = compact(v.services, (s) => s.name.trim() !== '' || s.provider.trim() !== '');
    const incidentRows = compact(v.incidents, (i) => i.title.trim() !== '' || i.manifestation.trim() !== '');
    const body = {
      name: v.name, summary: v.summary, status: v.status, owner: v.owner,
      repoUrl: v.repoUrl.trim(), productionUrl: v.productionUrl.trim(), docsUrl: v.docsUrl.trim(),
      stack: stackRows.items,
      services: serviceRows.items.map((s) => ({ ...s, url: s.url.trim() })),
      ...(editing ? {} : { incidents: incidentRows.items }),
    };
    try {
      const saved = await save.mutateAsync(body);
      navigate(`/proyectos/${saved.id}`);
    } catch (err) {
      // El servidor numera las filas ya filtradas; las llevamos de vuelta a la fila que ve el usuario.
      const kept: Record<string, number[]> = { stack: stackRows.kept, services: serviceRows.kept, incidents: incidentRows.kept };
      const shown = applyServerErrors(err, (name: string, e) => {
        const m = /^(stack|services|incidents)\.(\d+)\.(.+)$/.exec(name);
        setError(m ? (`${m[1]}.${kept[m[1]][Number(m[2])] ?? m[2]}.${m[3]}` as any) : (name as any), e);
      });
      if (!shown) setFormError(err);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });

  function onTechName(i: number, name: string) {
    const known = catalog?.technologies.find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (known) setValue(`stack.${i}.kind`, known.kind);
  }

  const hasErrors = Object.keys(errors).length > 0;

  // Reconfirmación antes de abandonar el formulario con cambios sin guardar.
  const { ask, dialog: discardDialog } = useConfirm();
  const backTo = editing ? `/proyectos/${id}` : '/';
  const leave = async (e: MouseEvent) => {
    if (!isDirty || isSubmitting) return; // sin cambios: el enlace navega normal
    e.preventDefault();
    const ok = await ask({ title: 'Descartar cambios', message: 'Tienes cambios sin guardar. Si sales ahora se perderán.', confirmLabel: 'Descartar y salir' });
    if (ok) navigate(backTo);
  };

  // Aviso del navegador si cierra o recarga la pestaña con cambios sin guardar.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Link to={backTo} onClick={leave} className="text-sm text-accent hover:underline">← Volver</Link>
      <PageHeader title={editing ? 'Editar proyecto' : 'Nuevo proyecto'} description="Los campos con * son obligatorios." />
      <ErrorBox error={formError} />
      {hasErrors && !formError && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm font-medium text-red-700 dark:text-red-300">
          Revisa los campos marcados en rojo.
        </p>
      )}

      <Card className="space-y-4">
        <h2 className="font-semibold">Datos generales</h2>
        <Field label="Nombre *" error={errors.name?.message}><Input maxLength={120} {...register('name')} /></Field>
        <Field label="Resumen: de qué trata *" error={errors.summary?.message}><Textarea maxLength={2000} {...register('summary')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-sm font-medium text-fg">Estado *</span>
            <Controller control={control} name="status" render={({ field }) => <Segmented aria-label="Estado" value={field.value} onChange={field.onChange} options={STATUS_OPTIONS} />} />
            <FieldError message={errors.status?.message} />
          </div>
          <Field label="Responsable *" error={errors.owner?.message} hint="Elige a alguien existente o escribe un nombre nuevo.">
            <Controller
              control={control}
              name="owner"
              render={({ field }) => (
                <Combobox
                  aria-label="Responsable"
                  placeholder="Ej. Ana Pérez"
                  value={field.value}
                  suggestions={catalog?.owners ?? []}
                  onChange={field.onChange}
                />
              )}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Repositorio" error={errors.repoUrl?.message}><Input inputMode="url" placeholder="https://" {...register('repoUrl')} /></Field>
          <Field label="Producción" error={errors.productionUrl?.message}><Input inputMode="url" placeholder="https://" {...register('productionUrl')} /></Field>
          <Field label="Documentación" error={errors.docsUrl?.message}><Input inputMode="url" placeholder="https://" {...register('docsUrl')} /></Field>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Stack</h2>
        <p className="text-xs text-muted">Elige del catálogo y el tipo se completa solo. Si escribes una tecnología nueva, elige su tipo y se agregará al catálogo.</p>
        {stack.fields.map((f, i) => (
          <div key={f.id}>
            <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_12rem_auto]">
              <Controller
                control={control}
                name={`stack.${i}.name`}
                render={({ field }) => (
                  <Combobox
                    aria-label="Tecnología"
                    placeholder="Ej. React"
                    value={field.value}
                    suggestions={catalog?.technologies.map((t) => t.name) ?? []}
                    hints={techHints}
                    onChange={(v) => { field.onChange(v); onTechName(i, v); }}
                  />
                )}
              />
              <Controller
                control={control}
                name={`stack.${i}.kind`}
                render={({ field }) => (
                  <Dropdown
                    aria-label={techByName.has((stackValues?.[i]?.name ?? '').trim().toLowerCase()) ? 'Tipo (definido por el catálogo)' : 'Tipo'}
                    disabled={techByName.has((stackValues?.[i]?.name ?? '').trim().toLowerCase())}
                    className="order-3 col-span-2 sm:order-none sm:col-span-1"
                    value={field.value}
                    onChange={(v) => v && field.onChange(v)}
                    options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
                  />
                )}
              />
              <button type="button" className={btnDanger} aria-label="Quitar tecnología" onClick={() => stack.remove(i)}>✕</button>
            </div>
            <FieldError message={errors.stack?.[i]?.name?.message} />
          </div>
        ))}
        <button type="button" className={btnSecondary} onClick={() => stack.append({ name: '', kind: 'framework' })}>+ Añadir tecnología</button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Servicios y despliegue</h2>
        <p className="text-xs text-muted">Qué pieza vive dónde. Ej.: Frontend → Firebase, Backend → AWS, Base de datos → Google Cloud.</p>
        {services.fields.map((f, i) => {
          const e = errors.services?.[i];
          return (
            <div key={f.id} className="space-y-2 rounded-lg border border-line p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <Input placeholder="Pieza (ej. Sitio web)" aria-label="Pieza" {...register(`services.${i}.name`)} />
                  <FieldError message={e?.name?.message} />
                </div>
                <Controller
                  control={control}
                  name={`services.${i}.component`}
                  render={({ field }) => (
                    <Dropdown
                      aria-label="Componente"
                      value={field.value}
                      onChange={(v) => v && field.onChange(v)}
                      options={(Object.keys(COMPONENT_LABEL) as Component[]).map((c) => ({ value: c, label: COMPONENT_LABEL[c] }))}
                    />
                  )}
                />
                <div data-field>
                  <Controller
                    control={control}
                    name={`services.${i}.provider`}
                    render={({ field }) => (
                      <Combobox
                        aria-label="Proveedor"
                        placeholder="Proveedor (ej. Firebase)"
                        value={field.value}
                        suggestions={catalog?.providers ?? []}
                        onChange={field.onChange}
                      />
                    )}
                  />
                  <FieldError message={e?.provider?.message} />
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input inputMode="url" placeholder="URL (opcional)" aria-label="URL del servicio" {...register(`services.${i}.url`)} />
                  <FieldError message={e?.url?.message} />
                </div>
                <div><button type="button" className={btnDanger} aria-label="Quitar servicio" onClick={() => services.remove(i)}>✕</button></div>
              </div>
            </div>
          );
        })}
        <button type="button" className={btnSecondary} onClick={() => services.append({ name: '', component: 'backend', provider: '', url: '' })}>+ Añadir servicio</button>
      </Card>

      {!editing && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Incidentes (opcional)</h2>
          <p className="text-xs text-muted">Puedes registrar errores pasados ahora o más adelante desde el detalle del proyecto.</p>
          {incidents.fields.map((f, i) => (
            <div key={f.id} className="space-y-3 rounded-lg border border-line p-3">
              <IncidentFields register={register} errors={errors.incidents?.[i]} prefix={`incidents.${i}.`} />
              <button type="button" className={btnDanger} onClick={() => incidents.remove(i)}>Quitar incidente</button>
            </div>
          ))}
          <button type="button" className={btnSecondary} onClick={() => incidents.append(emptyIncident())}>+ Añadir incidente</button>
        </Card>
      )}

      <div className="sticky bottom-[5.5rem] z-10 -mx-4 flex gap-2 md:bottom-0 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <Button loading={isSubmitting}>{isSubmitting ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear proyecto'}</Button>
        <Link to={backTo} onClick={leave} className={btnSecondary}>Cancelar</Link>
      </div>
      {discardDialog}
    </form>
  );
}
