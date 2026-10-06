import { z } from 'zod';

import { ROLES } from '../roles';

export const demoAccountSchema = z.object({
  role: z.enum(ROLES),
  email: z.email(),
  password: z.string().min(1),
});

export const demoAccountsResponseSchema = z.object({
  notice: z.string().min(1),
  accounts: z.array(demoAccountSchema).min(1),
});

export type DemoAccount = z.output<typeof demoAccountSchema>;
export type DemoAccountsResponse = z.output<typeof demoAccountsResponseSchema>;
