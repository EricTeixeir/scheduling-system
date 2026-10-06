import { SEED_SLOT_MINUTES, SEED_WEEKLY_HOURS } from '../../../../apps/api/prisma/seed-schedule';
import { resolveRequestedSlot } from '../../../../apps/api/src/domain/availability/slots';
import {
  businessDayOf,
  minuteOfDay,
  slotsOf,
  type WeeklyHours,
} from '../../../../apps/api/src/domain/availability/weekly-hours';
import { addMinutes } from '../../../../apps/api/src/domain/time/instant';
import {
  localDateOf,
  weekdayOf,
  zonedInstant,
  type LocalDate,
} from '../../../../apps/api/src/domain/time/local-date';
import type { RulesActors } from '../actors';
import { problemMessage } from '../http';
import { Findings, type RuleOutcome } from '../outcome';

const MINUTES_PER_DAY = 24 * 60;

export interface PastCase {
  readonly label: string;
  readonly startsAt: Date;
  readonly expectedCode: string;
  readonly exercisesTimeRule: boolean;
}

export interface PastOutcome extends RuleOutcome {
  readonly rejected: number;
  readonly cases: readonly PastCase[];
}

function hoursOn(date: LocalDate): WeeklyHours | null {
  const rule = SEED_WEEKLY_HOURS.find(({ weekday }) => weekday === weekdayOf(date));
  return rule === undefined ? null : { ...rule, slotMinutes: SEED_SLOT_MINUTES };
}

function floorToGrid(instant: Date): Date {
  const slotMs = SEED_SLOT_MINUTES * 60_000;
  return new Date(Math.floor(instant.getTime() / slotMs) * slotMs);
}

function lastOpeningBefore(now: Date, timeZone: string): Date {
  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const date = localDateOf(addMinutes(now, -daysBack * MINUTES_PER_DAY), timeZone);
    const hours = hoursOn(date);
    if (hours !== null) return zonedInstant(date, minuteOfDay(hours.opensAt), timeZone);
  }
  throw new Error('the seeded schedule has no open weekday');
}

function gridSlotContaining(instant: Date, timeZone: string): Date {
  const date = localDateOf(instant, timeZone);
  const hours = hoursOn(date);
  if (hours === null) return floorToGrid(instant);
  const slot = slotsOf(businessDayOf(date, hours, timeZone)).find(
    ({ startsAt, endsAt }) => startsAt <= instant && instant < endsAt,
  );
  return slot?.startsAt ?? floorToGrid(instant);
}

function nextGridSlotFrom(now: Date, timeZone: string): Date {
  const date = localDateOf(now, timeZone);
  const hours = hoursOn(date);
  const slot =
    hours === null
      ? undefined
      : slotsOf(businessDayOf(date, hours, timeZone)).find(({ startsAt }) => startsAt >= now);
  return slot?.startsAt ?? addMinutes(floorToGrid(now), SEED_SLOT_MINUTES);
}

// The API checks the slot grid (open day, business hours) before the time window, so outside
// business hours a past instant is refused with the grid's code instead of IN_PAST/TOO_SOON.
function expectedRefusal(startsAt: Date, now: Date, timeZone: string): Omit<PastCase, 'label'> {
  const hours = hoursOn(localDateOf(startsAt, timeZone));
  const slot = resolveRequestedSlot({ startsAt, hours, isClosedDate: false, timeZone });
  if (!slot.ok) return { startsAt, expectedCode: slot.reason, exercisesTimeRule: false };
  return {
    startsAt,
    expectedCode: startsAt <= now ? 'IN_PAST' : 'TOO_SOON',
    exercisesTimeRule: true,
  };
}

export function pastCases(now: Date, timeZone: string): PastCase[] {
  return [
    {
      label: 'ontem (último dia com atendimento)',
      ...expectedRefusal(lastOpeningBefore(now, timeZone), now, timeZone),
    },
    {
      label: 'uma hora atrás',
      ...expectedRefusal(gridSlotContaining(addMinutes(now, -60), timeZone), now, timeZone),
    },
    {
      label: 'horário que começa agora',
      ...expectedRefusal(nextGridSlotFrom(now, timeZone), now, timeZone),
    },
  ];
}

export async function pastTimesAreRefused({ session, client }: RulesActors): Promise<PastOutcome> {
  const findings = new Findings();
  const cases = pastCases(new Date(), await session.timeZone(client));
  let rejected = 0;
  for (const pastCase of cases) {
    const response = await session.book(client, pastCase.startsAt.toISOString());
    const label = `${pastCase.label} (${pastCase.startsAt.toISOString()})`;
    if (findings.expectStatus(label, response, 422, pastCase.expectedCode)) rejected++;
    findings.check(problemMessage(response) !== '', `${label}: no message for the user`);
  }
  return {
    failures: findings.failures,
    summary: `${String(rejected)} rejeitadas com 422`,
    rejected,
    cases,
  };
}

export async function futureSlotIsAccepted({ session, client }: RulesActors): Promise<RuleOutcome> {
  const findings = new Findings();
  const [slot = ''] = await session.freeSlots(client, 1);
  findings.expectStatus(`horário futuro livre (${slot})`, await session.book(client, slot), 201);
  return { failures: findings.failures, summary: 'horário futuro aceito' };
}
