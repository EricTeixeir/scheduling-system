import { z } from 'zod';

import { emailSchema, passwordSchema } from './fields';

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

export type LoginInput = z.input<typeof loginSchema>;
export type LoginOutput = z.output<typeof loginSchema>;
