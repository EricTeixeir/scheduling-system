import { randomUUID } from 'node:crypto';

import type {
  Appointment,
  ClientAppointmentsQueryOutput,
  CreateAppointmentOutput,
} from '@scheduling/shared';

import { decideTransition } from '../../domain/appointment/appointment-status';
import { checkBookingWindow, type BookingPolicy } from '../../domain/appointment/booking-policy';
import { blockOverlaps } from '../../domain/availability/schedule-block';
import { resolveRequestedSlot } from '../../domain/availability/slots';
import type { Clock } from '../../domain/time/clock';
import { addMinutes } from '../../domain/time/instant';
import { localDateOf } from '../../domain/time/local-date';
import type { TimeRange } from '../../domain/time/time-range';
import {
  BusinessRuleError,
  ConflictError,
  IdempotencyKeyReusedError,
  NotFoundError,
} from '../../errors/app-errors';
import type { ScheduleReader } from '../availability/availability.ports';
import {
  appointmentCreatedEvent,
  appointmentStatusChangedEvent,
  type Actor,
} from './appointment-audit';
import type {
  AppointmentRecord,
  AppointmentRepository,
  StoredResponse,
} from './appointments.ports';
import { IDEMPOTENCY_KEY_TTL_HOURS, IdempotencyKeyTakenError, requestHashOf } from './idempotency';
import { transitionError } from './transition-errors';

export const KEY_IN_FLIGHT_DETAIL =
  'Uma requisição com esta chave de idempotência ainda está em andamento. Tente novamente em instantes.';
export const NOT_FOUND_DETAIL = 'Agendamento não encontrado.';
export const SLOT_BLOCKED_DETAIL = 'Este horário foi bloqueado pela agenda. Escolha outro.';
const NOT_CANCELLABLE_DETAIL = 'Este agendamento não pode mais ser cancelado.';

export interface RequestContext {
  readonly actor: Actor;
  readonly requestId: string;
}

export interface CreateAppointmentCommand {
  readonly idempotencyKey: string;
  readonly input: CreateAppointmentOutput;
}

export interface CreateAppointmentResult extends StoredResponse {
  readonly replayed: boolean;
}

export interface OwnAppointmentsPage {
  readonly items: Appointment[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface AppointmentsService {
  create(
    context: RequestContext,
    command: CreateAppointmentCommand,
  ): Promise<CreateAppointmentResult>;
  listOwn(userId: string, query: ClientAppointmentsQueryOutput): Promise<OwnAppointmentsPage>;
  cancel(context: RequestContext, id: string): Promise<Appointment>;
}

export interface AppointmentsServiceDependencies {
  readonly appointments: AppointmentRepository;
  readonly schedule: ScheduleReader;
  readonly clock: Clock;
  readonly policy: BookingPolicy;
  readonly timeZone: string;
}

export function toAppointmentDto(record: AppointmentRecord): Appointment {
  return {
    id: record.id,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    status: record.status,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
  };
}

function idempotencyCutoff(now: Date): Date {
  return addMinutes(now, -IDEMPOTENCY_KEY_TTL_HOURS * 60);
}

export function createAppointmentsService({
  appointments,
  schedule,
  clock,
  policy,
  timeZone,
}: AppointmentsServiceDependencies): AppointmentsService {
  async function storedReplay(
    userId: string,
    key: string,
    requestHash: string,
    now: Date,
  ): Promise<CreateAppointmentResult | undefined> {
    const stored = await appointments.findIdempotencyRecord(userId, key, idempotencyCutoff(now));
    if (stored === undefined) return undefined;
    if (stored.requestHash !== requestHash) throw new IdempotencyKeyReusedError();
    return { ...stored.response, replayed: true };
  }

  async function resolveBookableSlot(startsAt: Date, now: Date): Promise<TimeRange> {
    const { hours, isClosedDate, blocks } = await schedule.findDaySchedule(
      localDateOf(startsAt, timeZone),
    );
    const slot = resolveRequestedSlot({ startsAt, hours, isClosedDate, timeZone });
    if (!slot.ok) throw new BusinessRuleError(slot.reason);
    const window = checkBookingWindow(slot.value.startsAt, now, policy);
    if (!window.ok) throw new BusinessRuleError(window.reason);
    // Blocks are computed, not a database constraint: a booking committed while an admin creates
    // an overlapping block can slip through both checks. Accepted risk; the admin sees it in the list.
    if (blocks.some((block) => blockOverlaps(block, slot.value, timeZone))) {
      throw new ConflictError('SLOT_BLOCKED', SLOT_BLOCKED_DETAIL);
    }
    return slot.value;
  }

  function assertCancellable(appointment: AppointmentRecord, actor: Actor, now: Date): void {
    const decision = decideTransition({
      from: appointment.status,
      to: 'CANCELLED',
      actor: actor.role,
      startsAt: appointment.startsAt,
      now,
      policy,
    });
    if (!decision.ok) throw transitionError(decision.reason, NOT_CANCELLABLE_DETAIL);
  }

  return {
    async create({ actor, requestId }, { idempotencyKey, input }) {
      const now = clock.now();
      const requestHash = requestHashOf(input);
      const replay = await storedReplay(actor.id, idempotencyKey, requestHash, now);
      if (replay !== undefined) return replay;

      const slot = await resolveBookableSlot(new Date(input.startsAt), now);
      const appointment: AppointmentRecord = {
        id: randomUUID(),
        userId: actor.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: 'CONFIRMED',
        notes: input.notes ?? null,
        createdAt: now,
      };
      const response: StoredResponse = { status: 201, body: toAppointmentDto(appointment) };

      // The key is stored only with a successful booking, so a refused request can be retried
      // with the same key. It is claimed first: a concurrent duplicate waits on its unique index.
      try {
        await appointments.transaction(
          async (tx) => {
            await tx.claimIdempotencyKey(
              { userId: actor.id, key: idempotencyKey, requestHash, response, createdAt: now },
              idempotencyCutoff(now),
            );
            await tx.insertAppointment(appointment);
            await tx.audit.append(appointmentCreatedEvent({ actor, requestId, now }, appointment));
          },
          { onContention: 'SLOT_TAKEN' },
        );
      } catch (error) {
        if (!(error instanceof IdempotencyKeyTakenError)) throw error;
        const winner = await storedReplay(actor.id, idempotencyKey, requestHash, now);
        if (winner === undefined) throw new ConflictError('CONFLICT', KEY_IN_FLIGHT_DETAIL);
        return winner;
      }
      return { ...response, replayed: false };
    },

    async listOwn(userId, { scope, page, pageSize }) {
      const result = await appointments.listOwned({
        userId,
        scope,
        now: clock.now(),
        page,
        pageSize,
      });
      return { items: result.items.map(toAppointmentDto), page, pageSize, total: result.total };
    },

    // Someone else's appointment answers 404 like a missing one, so its existence never leaks.
    async cancel({ actor, requestId }, id) {
      const now = clock.now();
      const current = await appointments.findOwned(id, actor.id);
      if (current === undefined) throw new NotFoundError(NOT_FOUND_DETAIL);
      assertCancellable(current, actor, now);

      const cancelled = await appointments.transaction(
        async (tx) => {
          const updated = await tx.cancelIfConfirmed(id, actor.id);
          if (updated !== undefined) {
            await tx.audit.append(
              appointmentStatusChangedEvent({ actor, requestId, now }, current, updated),
            );
          }
          return updated;
        },
        { onContention: 'CONFLICT' },
      );
      if (cancelled !== undefined) return toAppointmentDto(cancelled);

      const fresh = await appointments.findOwned(id, actor.id);
      if (fresh === undefined) throw new NotFoundError(NOT_FOUND_DETAIL);
      assertCancellable(fresh, actor, now);
      throw new ConflictError('CONFLICT');
    },
  };
}
