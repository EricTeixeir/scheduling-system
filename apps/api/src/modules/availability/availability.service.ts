import type { AvailabilityResponse } from '@scheduling/shared';

import type { BookingPolicy } from '../../domain/appointment/booking-policy';
import { blockOccurrenceOn } from '../../domain/availability/schedule-block';
import { listAvailableSlots } from '../../domain/availability/slots';
import type { Clock } from '../../domain/time/clock';
import { localDayRange, type LocalDate } from '../../domain/time/local-date';
import type { TimeRange } from '../../domain/time/time-range';
import type { AvailabilityRepository } from './availability.ports';

export interface AvailabilityService {
  listSlots(date: LocalDate): Promise<AvailabilityResponse>;
}

export interface AvailabilityServiceDependencies {
  readonly availability: AvailabilityRepository;
  readonly clock: Clock;
  readonly policy: BookingPolicy;
  readonly timeZone: string;
}

export function createAvailabilityService({
  availability,
  clock,
  policy,
  timeZone,
}: AvailabilityServiceDependencies): AvailabilityService {
  return {
    async listSlots(date) {
      const { hours, isClosedDate, blocks } = await availability.findDaySchedule(date);
      const booked =
        hours === null || isClosedDate
          ? []
          : await availability.findBusyRanges(localDayRange(date, timeZone));
      const blocked = blocks
        .map((block) => blockOccurrenceOn(block, date, timeZone))
        .filter((occurrence): occurrence is TimeRange => occurrence !== undefined);
      const busy = [...booked, ...blocked];
      const slots = listAvailableSlots({
        date,
        hours,
        isClosedDate,
        busy,
        now: clock.now(),
        policy,
        timeZone,
      });
      return {
        date,
        timeZone,
        slots: slots.map(({ startsAt, endsAt }) => ({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        })),
      };
    },
  };
}
