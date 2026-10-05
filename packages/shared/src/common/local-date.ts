import { z } from 'zod';

export const localDateSchema = z.iso.date({ error: 'Data inválida. Use o formato AAAA-MM-DD.' });
