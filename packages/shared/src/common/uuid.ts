import { z } from 'zod';

export const uuidSchema = z.uuid({ error: 'Identificador inválido.' });
