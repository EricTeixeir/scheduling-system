import { zodResolver } from '@hookform/resolvers/zod';
import {
  PASSWORD_MIN_LENGTH,
  registerSchema,
  type RegisterInput,
  type RegisterOutput,
} from '@scheduling/shared';
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
import { isApiError } from '@/lib/api/api-error';
import { splitServerErrors } from '@/lib/errors/server-form-errors';

import { FormAlert } from './form-alert';
import { useRegister } from './use-auth-mutations';

const REGISTER_FIELDS = ['name', 'email', 'password'] as const;
const EMAIL_TAKEN_MESSAGE = 'Este e-mail já está cadastrado.';

function isEmailTaken(error: unknown): boolean {
  return isApiError(error) && error.status === 409;
}

export function RegisterPage() {
  const registerMutation = useRegister();
  const [formMessage, setFormMessage] = useState<string>();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput, unknown, RegisterOutput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onTouched',
  });

  const onSubmit = handleSubmit(async (account) => {
    setFormMessage(undefined);
    try {
      await registerMutation.mutateAsync(account);
    } catch (error) {
      if (isEmailTaken(error)) {
        setError('email', { type: 'server', message: EMAIL_TAKEN_MESSAGE }, { shouldFocus: true });
        return;
      }
      const serverErrors = splitServerErrors(error, REGISTER_FIELDS);
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
          <h1>Criar conta</h1>
        </CardTitle>
        <CardDescription>Cadastre-se para agendar seus horários em poucos toques.</CardDescription>
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
          <FormField label="Nome" error={errors.name?.message}>
            {(control) => (
              <Input
                {...control}
                {...register('name')}
                autoComplete="name"
                autoCapitalize="words"
                placeholder="Seu nome completo"
              />
            )}
          </FormField>
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
          <FormField
            label="Senha"
            error={errors.password?.message}
            hint={`Mínimo de ${String(PASSWORD_MIN_LENGTH)} caracteres.`}
          >
            {(control) => (
              <PasswordInput {...control} {...register('password')} autoComplete="new-password" />
            )}
          </FormField>
          <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Criando conta…
              </>
            ) : (
              'Criar conta'
            )}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta?{' '}
          <Link
            to={PATHS.login}
            className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
          >
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
