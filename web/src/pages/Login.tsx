import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '../auth';
import { loginSchema, type LoginValues } from '../schemas';
import { Logo } from '../Logo';
import { Button, Card, ErrorBox, Field, Input } from '../ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const {
    register, handleSubmit, formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  const submit = handleSubmit(async ({ email, password }) => {
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err);
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 flex justify-center"><Logo size="lg" /></h1>
        <p className="mb-8 text-center font-serif text-base italic text-muted">El cuaderno de bitácora de tus proyectos.</p>
        <Card>
          <form onSubmit={submit} noValidate className="space-y-4">
            <Field label="Correo" error={errors.email?.message}>
              <Input type="email" autoComplete="username" {...register('email')} />
            </Field>
            <Field label="Contraseña" error={errors.password?.message}>
              <Input type="password" autoComplete="current-password" {...register('password')} />
            </Field>
            <ErrorBox error={error} />
            <Button className="w-full" loading={isSubmitting}>{isSubmitting ? 'Entrando…' : 'Entrar'}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
