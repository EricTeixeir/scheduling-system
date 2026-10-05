import { z } from 'zod';

export const EMAIL_MAX_LENGTH = 254;
export const NAME_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;
// Bounded because Argon2 hashing is deliberately expensive: a huge password would let one
// request burn CPU and memory on the server.
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string({ error: 'Informe o e-mail.' })
  .trim()
  .toLowerCase()
  .pipe(
    z.email({ error: 'E-mail inválido.' }).max(EMAIL_MAX_LENGTH, {
      error: `O e-mail deve ter no máximo ${String(EMAIL_MAX_LENGTH)} caracteres.`,
    }),
  );

export const passwordSchema = z
  .string({ error: 'Informe a senha.' })
  .min(PASSWORD_MIN_LENGTH, {
    error: `A senha deve ter no mínimo ${String(PASSWORD_MIN_LENGTH)} caracteres.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `A senha deve ter no máximo ${String(PASSWORD_MAX_LENGTH)} caracteres.`,
  });

export const nameSchema = z
  .string({ error: 'Informe o nome.' })
  .trim()
  .min(1, { error: 'Informe o nome.' })
  .max(NAME_MAX_LENGTH, {
    error: `O nome deve ter no máximo ${String(NAME_MAX_LENGTH)} caracteres.`,
  });
