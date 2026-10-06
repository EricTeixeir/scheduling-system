import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput, type LoginOutput } from '@scheduling/shared';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { PATHS } from '@/app/navigation';
import { FormField } from '@/components/form/form-field';
import { PasswordInput } from '@/components/form/password-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { splitServerErrors } from '@/lib/errors/server-form-errors';

import { FormAlert } from './form-alert';
import { useLogin } from './use-auth-mutations';

const LOGIN_FIELDS = ['email', 'password'] as const;

export function LoginPage() {
  const loginMutation = useLogin();
  const [formMessage, setFormMessage] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput, unknown, LoginOutput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (credentials) => {
    setFormMessage(undefined);
    try {
      await loginMutation.mutateAsync(credentials);
    } catch (error) {
      const serverErrors = splitServerErrors(error, LOGIN_FIELDS, 'login');
      for (const [field, message] of serverErrors.fields) {
        setError(field, { type: 'server', message });
      }
      setFormMessage(serverErrors.formMessage);
    }
  });

  return (
    <Card className="gap-6 shadow-lg shadow-primary/5">
      <CardHeader>
        <CardTitle className="text-2xl">
          <h1>Entrar</h1>
        </CardTitle>
        <CardDescription>Acesse sua conta para gerenciar seus agendamentos.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="grid gap-5"
          onSubmit={(event) => {
            void onSubmit(event);
          }}
        >
          <FormAlert message={formMessage} />
          <FormField label="E-mail" error={errors.email?.message}>
            {(control) => (
              <Input
                {...control}
                {...register('email')}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="voce@exemplo.com"
              />
            )}
          </FormField>
          <FormField label="Senha" error={errors.password?.message}>
            {(control) => (
              <PasswordInput
                {...control}
                {...register('password')}
                autoComplete="current-password"
              />
            )}
          </FormField>
          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Entrando…
              </>
            ) : (
              'Entrar'
            )}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ainda não tem conta?{' '}
          <Link
            to={PATHS.register}
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            Criar conta
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Credenciais de avaliação no README.
        </p>
      </CardContent>
    </Card>
  );
}
