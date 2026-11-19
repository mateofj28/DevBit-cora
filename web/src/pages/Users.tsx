import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate } from 'react-router-dom';
import { type Role, type User } from '../api';
import { useAuth } from '../auth';
import { useConfirm } from '../confirm';
import { createUser, updateUser, useApiMutation, useUsers } from '../queries';
import { userSchema, type UserValues } from '../schemas';
import { Dropdown } from '../controls';
import { applyServerErrors, btnPrimary, btnSecondary, Button, Card, Chip, ErrorBox, Field, FieldError, Input, Modal, PageHeader } from '../ui';

function PasswordDialog({ user, onClose, onSave }: { user: User | null; onClose: () => void; onSave: (password: string) => Promise<unknown> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const tooShort = password.length > 0 && password.length < 8;

  return (
    <Modal open={user !== null} title={`Cambiar contraseña de ${user?.name ?? ''}`} onClose={() => { setPassword(''); setError(null); onClose(); }}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 8) return;
          try { await onSave(password); setPassword(''); onClose(); } catch (err) { setError(err); }
        }}
      >
        <Field label="Contraseña nueva" error={tooShort ? 'Mínimo 8 caracteres.' : undefined}>
          <Input type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorBox error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>Cancelar</button>
          <button className={btnPrimary} disabled={password.length < 8}>Guardar</button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { isEditor, user: me } = useAuth();
  const users = useUsers();
  const create = useApiMutation(createUser, 'Usuario creado');
  const update = useApiMutation(updateUser, 'Cambios guardados');
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const { ask, dialog: confirmDialog } = useConfirm();

  // Cambios de acceso: piden reconfirmación porque afectan lo que una persona puede hacer.
  const changeRole = async (u: User, role: Role) => {
    const label = role === 'editor' ? 'Editor (puede crear y modificar)' : 'Consulta (solo lectura)';
    const ok = await ask({ title: 'Cambiar rol', message: `¿Cambiar el rol de ${u.name} a ${label}?`, confirmLabel: 'Cambiar rol', danger: false });
    if (ok) update.mutate({ id: u.id, role });
  };
  const toggleActive = async (u: User) => {
    const ok = await ask(
      u.active
        ? { title: 'Desactivar usuario', message: `${u.name} ya no podrá iniciar sesión hasta que lo actives de nuevo.`, confirmLabel: 'Desactivar' }
        : { title: 'Activar usuario', message: `${u.name} volverá a poder iniciar sesión.`, confirmLabel: 'Activar', danger: false },
    );
    if (ok) update.mutate({ id: u.id, active: !u.active });
  };

  const {
    register, control, handleSubmit, reset, setError, formState: { errors, isSubmitting },
  } = useForm<UserValues>({ resolver: zodResolver(userSchema), defaultValues: { name: '', email: '', role: 'lector', password: '' } });

  if (!isEditor) return <Navigate to="/" replace />;

  const submit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      reset();
    } catch (err) {
      // Si no es un error de campo (p. ej. correo repetido) se muestra en el cuadro de error.
      if (applyServerErrors(err, setError)) create.reset();
    }
  });

  return (
    <div className="space-y-5">
      <PageHeader title="Usuarios" description="Las cuentas se crean por invitación. Los editores crean y modifican; consulta solo lee." />
      <ErrorBox error={users.error ?? update.error} />

      <Card>
        <h2 className="mb-3 font-semibold">Invitar usuario</h2>
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" error={errors.name?.message}><Input {...register('name')} /></Field>
          <Field label="Correo" error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
          <div>
            <span className="mb-1 block text-sm font-medium text-fg">Rol</span>
            <Controller control={control} name="role" render={({ field }) => (
              <Dropdown aria-label="Rol" value={field.value} onChange={(v) => v && field.onChange(v)} options={[{ value: 'lector', label: 'Consulta (solo lectura)' }, { value: 'editor', label: 'Editor' }]} />
            )} />
            <FieldError message={errors.role?.message} />
          </div>
          <Field label="Contraseña inicial" hint="Mínimo 8 caracteres. Compártela por un canal seguro." error={errors.password?.message}>
            <Input type="text" autoComplete="off" {...register('password')} />
          </Field>
          <div className="space-y-2 sm:col-span-2">
            <ErrorBox error={create.error} />
            <Button loading={isSubmitting}>Crear usuario</Button>
          </div>
        </form>
      </Card>

      <Card>
        {users.isPending && <p className="text-muted">Cargando…</p>}
        <ul className="divide-y divide-line">
          {users.data?.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <p className="font-medium">{u.name} {!u.active && <Chip>Desactivado</Chip>}</p>
                <p className="text-sm text-muted">{u.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Dropdown
                  aria-label={`Rol de ${u.name}`}
                  value={u.role}
                  disabled={u.id === me?.id}
                  onChange={(v) => v && v !== u.role && changeRole(u, v as Role)}
                  options={[{ value: 'lector', label: 'Consulta' }, { value: 'editor', label: 'Editor' }]}
                  className="!w-auto min-w-32"
                />
                <button className={btnSecondary} onClick={() => setPasswordFor(u)}>Cambiar contraseña</button>
                {u.id !== me?.id && (
                  <button className={btnSecondary} onClick={() => toggleActive(u)}>{u.active ? 'Desactivar' : 'Activar'}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {confirmDialog}
      <PasswordDialog
        user={passwordFor}
        onClose={() => setPasswordFor(null)}
        onSave={(password) => update.mutateAsync({ id: passwordFor!.id, password })}
      />
    </div>
  );
}
