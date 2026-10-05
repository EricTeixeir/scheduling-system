import { describe, expect, it } from 'vitest';

import { idParamsSchema } from './id-params';
import { isoDateTimeSchema } from './iso-date-time';
import { localDateSchema } from './local-date';
import { paginatedSchema } from './paginated';
import { paginationQuerySchema } from './pagination';
import { uuidSchema } from './uuid';

const VALID_UUID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';

describe('uuidSchema', () => {
  it('accepts a valid uuid', () => {
    expect(uuidSchema.parse(VALID_UUID)).toBe(VALID_UUID);
  });

  it.each(['not-a-uuid', '', '3f2b8c1e9a4d4e7b8c2a1d5e6f7a8b9c', 42, null])(
    'rejects %j',
    (value) => {
      expect(uuidSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('localDateSchema', () => {
  it.each(['2026-10-07', '2028-02-29'])('accepts the calendar date %s', (value) => {
    expect(localDateSchema.parse(value)).toBe(value);
  });

  it.each(['2026-02-30', '2026-02-29', '2026-13-01', '2026-04-31', '07/10/2026', '2026-10-7', ''])(
    'rejects %j',
    (value) => {
      expect(localDateSchema.safeParse(value).success).toBe(false);
    },
  );

  it('reports a pt-BR message', () => {
    expect(localDateSchema.safeParse('2026-02-30').error?.issues[0]?.message).toBe(
      'Data inválida. Use o formato AAAA-MM-DD.',
    );
  });
});

describe('isoDateTimeSchema', () => {
  it.each([
    '2026-10-07T14:00:00-03:00',
    '2026-10-07T17:00:00Z',
    '2026-10-07T17:00:00.000Z',
    '2026-10-07T14:00:00+05:30',
  ])('accepts %s with an explicit offset', (value) => {
    expect(isoDateTimeSchema.parse(value)).toBe(value);
  });

  it.each([
    '2026-10-07T14:00:00',
    '2026-10-07T14:00',
    '2026-10-07',
    '2026-02-30T10:00:00Z',
    1,
    null,
  ])('rejects %j', (value) => {
    expect(isoDateTimeSchema.safeParse(value).success).toBe(false);
  });
});

describe('idParamsSchema', () => {
  it('accepts a uuid id', () => {
    expect(idParamsSchema.parse({ id: VALID_UUID })).toEqual({ id: VALID_UUID });
  });

  it('rejects an invalid uuid', () => {
    expect(idParamsSchema.safeParse({ id: '123' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(idParamsSchema.safeParse({ id: VALID_UUID, isAdmin: true }).success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('applies defaults when nothing is sent', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('converts digit strings from the query string', () => {
    expect(paginationQuerySchema.parse({ page: '3', pageSize: '10' })).toEqual({
      page: 3,
      pageSize: 10,
    });
  });

  it('accepts real numbers', () => {
    expect(paginationQuerySchema.parse({ page: 2, pageSize: 5 })).toEqual({ page: 2, pageSize: 5 });
  });

  it.each([
    ['1', 1],
    ['50', 50],
  ])('accepts pageSize %s', (pageSize, expected) => {
    expect(paginationQuerySchema.parse({ pageSize }).pageSize).toBe(expected);
  });

  it.each(['0', '51', '-1', '1.5', 'abc', '', ' 1', '1e1', '0x10', 1.5, null, ['1']])(
    'rejects pageSize %j',
    (pageSize) => {
      expect(paginationQuerySchema.safeParse({ pageSize }).success).toBe(false);
    },
  );

  it('accepts the last allowed page', () => {
    expect(paginationQuerySchema.parse({ page: '1000' }).page).toBe(1000);
  });

  it.each(['0', 0, '-1', '1.5', 1001, '1001'])('rejects page %j', (page) => {
    expect(paginationQuerySchema.safeParse({ page }).success).toBe(false);
  });

  it('reports pt-BR messages for out-of-range values', () => {
    const result = paginationQuerySchema.safeParse({ page: '0', pageSize: '51' });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'A página deve ser no mínimo 1.',
      'O tamanho da página deve ser no máximo 50.',
    ]);
  });

  it('rejects unknown keys', () => {
    expect(paginationQuerySchema.safeParse({ isAdmin: 'true' }).success).toBe(false);
  });
});

describe('paginatedSchema', () => {
  const pageOfIds = paginatedSchema(uuidSchema);

  it('accepts a page of items', () => {
    const page = { items: [VALID_UUID], page: 1, pageSize: 20, total: 1 };
    expect(pageOfIds.parse(page)).toEqual(page);
  });

  it('validates every item', () => {
    expect(pageOfIds.safeParse({ items: ['x'], page: 1, pageSize: 20, total: 1 }).success).toBe(
      false,
    );
  });

  it('strips unknown keys and rejects negative totals', () => {
    expect(pageOfIds.parse({ items: [], page: 1, pageSize: 20, total: 0, extra: 1 })).toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });
    expect(pageOfIds.safeParse({ items: [], page: 1, pageSize: 20, total: -1 }).success).toBe(
      false,
    );
  });
});
