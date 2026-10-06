import { randomUUID } from 'node:crypto';

import {
  MAX_LISTED_CONFLICTS,
  type CreateScheduleBlockOutput,
  type ScheduleBlock as ScheduleBlockDto,
  type ScheduleConflict,
} from '@scheduling/shared';

import type { BookingPolicy } from '../../domain/appointment/booking-policy';
import { assertValidScheduleBlock, blockOverlaps } from '../../domain/availability/schedule-block';
import type { Clock } from '../../domain/time/clock';
import { addMinutes } from '../../domain/time/instant';
import { BlockConflictError } from '../../errors/app-errors';
import type { RequestContext } from '../appointments/appointments.service';
import { blockCreatedEvent, blockDeletedEvent } from './schedule-block-audit';
import type {
  ScheduleBlockRecord,
  ScheduleBlockRepository,
  UpcomingAppointment,
} from './schedule-blocks.ports';

const MINUTES_PER_DAY = 24 * 60;

export interface ScheduleBlocksService {
  list(): Promise<ScheduleBlockDto[]>;
  create(context: RequestContext, input: CreateScheduleBlockOutput): Promise<ScheduleBlockDto>;
  removeIfExists(context: RequestContext, id: string): Promise<void>;
}

export interface ScheduleBlocksServiceDependencies {
  readonly blocks: ScheduleBlockRepository;
  readonly clock: Clock;
  readonly policy: BookingPolicy;
  readonly timeZone: string;
}

export function toScheduleBlockDto(block: ScheduleBlockRecord): ScheduleBlockDto {
  return {
    id: block.id,
    weekdays: [...block.weekdays],
    startTime: block.startTime,
    endTime: block.endTime,
    startsOn: block.startsOn,
    endsOn: block.endsOn,
    reason: block.reason,
    createdAt: block.createdAt.toISOString(),
  };
}

function toConflict(appointment: UpcomingAppointment): ScheduleConflict {
  return {
    appointmentId: appointment.id,
    startsAt: appointment.startsAt.toISOString(),
    endsAt: appointment.endsAt.toISOString(),
    clientName: appointment.clientName,
  };
}

export function conflictDetail(total: number): string {
  const summary =
    total === 1
      ? 'Um agendamento confirmado coincide com este bloqueio. Cancele-o antes de criar o bloqueio.'
      : `${String(total)} agendamentos confirmados coincidem com este bloqueio. Cancele-os antes de criar o bloqueio.`;
  return total > MAX_LISTED_CONFLICTS
    ? `${summary} A lista mostra os ${String(MAX_LISTED_CONFLICTS)} primeiros.`
    : summary;
}

export function createScheduleBlocksService({
  blocks,
  clock,
  policy,
  timeZone,
}: ScheduleBlocksServiceDependencies): ScheduleBlocksService {
  // Only appointments not yet started count: one in progress can no longer be cancelled by an
  // admin. Nothing can be booked beyond the booking horizon, so later occurrences, including
  // those of a block with no end date, cannot conflict.
  async function conflictsWith(block: ScheduleBlockRecord, now: Date) {
    const horizon = addMinutes(now, policy.horizonDays * MINUTES_PER_DAY);
    const upcoming = await blocks.findConfirmedStartingBetween(now, horizon);
    return upcoming.filter((appointment) => blockOverlaps(block, appointment, timeZone));
  }

  return {
    async list() {
      return (await blocks.list()).map(toScheduleBlockDto);
    },

    async create({ actor, requestId }, input) {
      const now = clock.now();
      const block: ScheduleBlockRecord = {
        id: randomUUID(),
        weekdays: input.weekdays,
        startTime: input.startTime,
        endTime: input.endTime,
        startsOn: input.startsOn,
        endsOn: input.endsOn ?? null,
        reason: input.reason ?? null,
        createdBy: actor.id,
        createdAt: now,
      };
      assertValidScheduleBlock(block);

      const conflicts = await conflictsWith(block, now);
      if (conflicts.length > 0) {
        throw new BlockConflictError(
          conflicts.slice(0, MAX_LISTED_CONFLICTS).map(toConflict),
          conflictDetail(conflicts.length),
        );
      }

      await blocks.transaction(async (tx) => {
        await tx.insertBlock(block);
        await tx.audit.append(blockCreatedEvent({ actor, requestId, now }, block));
      });
      return toScheduleBlockDto(block);
    },

    async removeIfExists({ actor, requestId }, id) {
      const now = clock.now();
      await blocks.transaction(async (tx) => {
        const deleted = await tx.deleteBlock(id);
        if (deleted !== undefined) {
          await tx.audit.append(blockDeletedEvent({ actor, requestId, now }, deleted));
        }
      });
    },
  };
}
