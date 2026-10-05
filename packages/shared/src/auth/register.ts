import { z } from 'zod';

import { emailSchema, nameSchema, passwordSchema } from './fields';

// Strict on purpose: a self-registration carrying `role` is rejected, never silently stripped.
export const registerSchema = z.strictObject({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterOutput = z.output<typeof registerSchema>;
