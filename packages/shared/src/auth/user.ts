import { z } from 'zod';

import { uuidSchema } from '../common/uuid';
import { ROLES } from '../roles';

export const userSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  email: z.email(),
  role: z.enum(ROLES),
});

export type User = z.output<typeof userSchema>;
