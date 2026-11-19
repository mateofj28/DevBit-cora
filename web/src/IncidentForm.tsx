import { useState } from 'react';
import { useForm, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { emptyIncident, incidentSchema, today, type IncidentValues } from './schemas';
import { applyServerErrors, btnSecondary, Button, ErrorBox, Field, Input, Textarea } from './ui';

/**
 * Campos de un incidente. Se reutilizan dentro del formulario de proyecto
 * (con `prefix="incidents.0."`) y en el formulario propio de incidente (sin prefijo).
 */
export function IncidentFields({
  register, errors, prefix = '',
}: {
  register: UseFormRegister<any>;
  errors?: FieldErrors<IncidentValues>;
  prefix?: string;
}) {
  const r = (name: keyof IncidentValues) => register(`${prefix}${name}`);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Título *" error={errors?.title?.message}>
            <Input placeholder="Ej. Caída del login" {...r('title')} />
          </Field>
        </div>
        <Field label="Fecha *" error={errors?.occurredOn?.message}>
          <Input type="date" max={today()} {...r('occurredOn')} />
        </Field>
      </div>
      <Field label="Cómo se manifestó *" error={errors?.manifestation?.message}>
        <Textarea {...r('manifestation')} />
      </Field>
      <Field label="Causa" error={errors?.cause?.message}><Textarea {...r('cause')} /></Field>
      <Field label="Cómo se resolvió" error={errors?.resolution?.message}><Textarea {...r('resolution')} /></Field>
      <Field label="Qué se mejoró" error={errors?.improvement?.message}><Textarea {...r('improvement')} /></Field>
    </div>
  );
}

export function IncidentForm({
  initial, onSave, onCancel,
}: {
  initial?: IncidentValues;
  onSave: (v: IncidentValues) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [error, setError] = useState<unknown>(null);
  const {
    register, handleSubmit, setError: setFieldError, formState: { errors, isSubmitting },
  } = useForm<IncidentValues>({ resolver: zodResolver(incidentSchema), defaultValues: initial ?? emptyIncident() });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await onSave(values);
    } catch (err) {
      if (!applyServerErrors(err, setFieldError)) setError(err);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <IncidentFields register={register} errors={errors} />
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button loading={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Guardar incidente'}</Button>
        <button type="button" className={btnSecondary} onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
