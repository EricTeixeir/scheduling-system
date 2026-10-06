import { describe, expect, it } from 'vitest';

import { timeOfDaySchema } from '../common/time-of-day';
import { BLOCK_REASON_MAX_LENGTH, createScheduleBlockSchema } from './create-schedule-block';
import { scheduleBlockListSchema, scheduleBlockSchema } from './schedule-block';

const valid = {
  weekdays: [1, 2, 3, 4, 5],
  startTime: '13:00',
  endTime: '13:30',
  startsOn: '2026-10-05',
};

function messagesOf(input: unknown): string[] {
  const result = createScheduleBlockSchema.safeParse(input);
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('timeOfDaySchema', () => {
  it.each(['00:00', '09:05', '13:30', '23:59'])('accepts %s', (value) => {
    expect(timeOfDaySchema.parse(value)).toBe(value);
  });

  it.each(['24:00', '9:00', '09:60', '09:00:00', '0900', '', 900])('rejects %j', (value) => {
    expect(timeOfDaySchema.safeParse(value).success).toBe(false);
  });
});

describe('createScheduleBlockSchema', () => {
  it('accepts a forever block without endsOn and reason', () => {
    expect(createScheduleBlockSchema.parse(valid)).toEqual(valid);
  });

  it('accepts a bounded block, a single day and a reason (trimmed)', () => {
    const parsed = createScheduleBlockSchema.parse({
      ...valid,
      weekdays: [5, 1, 3],
      endsOn: '2026-10-05',
      reason: '  Buscar o filho na escola  ',
    });
    expect(parsed).toEqual({
      ...valid,
      weekdays: [1, 3, 5],
      endsOn: '2026-10-05',
      reason: 'Buscar o filho na escola',
    });
  });

  it.each(['', '   '])('drops a blank reason (%j)', (reason) => {
    expect('reason' in createScheduleBlockSchema.parse({ ...valid, reason })).toBe(false);
  });

  it(`accepts a ${String(BLOCK_REASON_MAX_LENGTH)}-character reason and rejects one more`, () => {
    const max = 'a'.repeat(BLOCK_REASON_MAX_LENGTH);
    expect(createScheduleBlockSchema.safeParse({ ...valid, reason: max }).success).toBe(true);
    expect(messagesOf({ ...valid, reason: `${max}a` })).toEqual([
      'O motivo deve ter no máximo 200 caracteres.',
    ]);
  });

  it('accepts all seven weekdays', () => {
    expect(
      createScheduleBlockSchema.safeParse({ ...valid, weekdays: [0, 1, 2, 3, 4, 5, 6] }).success,
    ).toBe(true);
  });

  it.each([
    [[], 'Escolha pelo menos um dia da semana.'],
    [[1, 1], 'Os dias da semana não podem se repetir.'],
    [[7], 'Dia da semana inválido.'],
    [[-1], 'Dia da semana inválido.'],
    [[1.5], 'Dia da semana inválido.'],
    [[0, 1, 2, 3, 4, 5, 6, 0], 'Escolha no máximo 7 dias da semana.'],
  ])('rejects weekdays %j', (weekdays, message) => {
    expect(messagesOf({ ...valid, weekdays })).toContain(message);
  });

  it.each([
    ['13:30', '13:30'],
    ['14:00', '13:30'],
  ])('rejects %s-%s: the end must come after the start', (startTime, endTime) => {
    const result = createScheduleBlockSchema.safeParse({ ...valid, startTime, endTime });
    expect(result.error?.issues).toMatchObject([
      { path: ['endTime'], message: 'O horário final deve ser posterior ao inicial.' },
    ]);
  });

  it('rejects endsOn before startsOn, reporting it on endsOn', () => {
    const result = createScheduleBlockSchema.safeParse({ ...valid, endsOn: '2026-10-04' });
    expect(result.error?.issues).toMatchObject([
      { path: ['endsOn'], message: 'A data final deve ser igual ou posterior à data inicial.' },
    ]);
  });

  it.each([
    { startTime: '24:00' },
    { endTime: '13:30:00' },
    { startsOn: '2026-02-30' },
    { endsOn: null },
    { reason: 42 },
    { weekdays: '1,2' },
    { createdBy: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c' },
  ])('rejects %j', (override) => {
    expect(createScheduleBlockSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it.each(['startTime', 'endTime', 'startsOn', 'weekdays'])('requires %s', (key) => {
    const input = Object.fromEntries(Object.entries(valid).filter(([name]) => name !== key));
    expect(createScheduleBlockSchema.safeParse(input).success).toBe(false);
  });
});

describe('scheduleBlockSchema', () => {
  const block = {
    id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c',
    weekdays: [1, 3, 5],
    startTime: '13:00',
    endTime: '13:30',
    startsOn: '2026-10-05',
    endsOn: null,
    reason: null,
    createdAt: '2026-10-05T12:00:00.000Z',
  };

  it('accepts a block and a list of blocks, stripping unknown keys', () => {
    expect(scheduleBlockSchema.parse({ ...block, createdBy: block.id })).toEqual(block);
    expect(scheduleBlockListSchema.parse({ items: [block] })).toEqual({ items: [block] });
  });

  it.each([{ endsOn: undefined }, { weekdays: [] }, { startTime: '1300' }])(
    'rejects %j',
    (override) => {
      expect(scheduleBlockSchema.safeParse({ ...block, ...override }).success).toBe(false);
    },
  );
});
