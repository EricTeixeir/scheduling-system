import { z } from 'zod';

export function paginatedSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    page: z.int().min(1),
    pageSize: z.int().min(1),
    total: z.int().min(0),
  });
}

export type Paginated<Item extends z.ZodType> = z.output<ReturnType<typeof paginatedSchema<Item>>>;
