import {
  appointmentHistorySchema,
  type AdminAppointment,
  type AdminAppointmentsQueryOutput,
  type AppointmentHistory,
  type AppointmentStatusTarget,
} from '@scheduling/shared';

import { decideTransition } from '../../domain/appointment/appointment-status';
import type { BookingPolicy } from '../../domain/appointment/booking-policy';
import type { Clock } from '../../domain/time/clock';
import { localDayRange, zonedInstant } from '../../domain/time/local-date';
import { ConflictError, NotFoundError } from '../../errors/app-errors';
import { appointmentStatusChangedEvent } from '../appointments/appointment-audit';
import {
  NOT_FOUND_DETAIL,
  toAppointmentDto,
  type RequestContext,
} from '../appointments/appointments.service';
import { transitionError } from '../appointments/transition-errors';
import type {
  AdminAppointmentRecord,
  AdminAppointmentRepository,
  AdminAppointmentsFilter,
} from './admin-appointments.ports';

export const NOT_CONFIRMED_DETAIL = 'Somente agendamentos confirmados podem mudar de status.';

export interface AdminAppointmentsPage {
  readonly items: AdminAppointment[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface AdminAppointmentsService {
  list(query: AdminAppointmentsQueryOutput): Promise<AdminAppointmentsPage>;
  updateStatus(
    context: RequestContext,
    id: string,
    status: AppointmentStatusTarget,
  ): Promise<AdminAppointment>;
  history(id: string): Promise<AppointmentHistory>;
}

export interface AdminAppointmentsServiceDependencies {
  readonly appointments: AdminAppointmentRepository;
  readonly clock: Clock;
  readonly policy: BookingPolicy;
  readonly timeZone: string;
}

export function toAdminAppointmentDto(record: AdminAppointmentRecord): AdminAppointment {
  const { id, name, email } = record.client;
  return { ...toAppointmentDto(record), client: { id, name, email } };
}

export function createAdminAppointmentsService({
  appointments,
  clock,
  policy,
  timeZone,
}: AdminAppointmentsServiceDependencies): AdminAppointmentsService {
  // from/to are local calendar days: [00:00 of from, 00:00 of the day after to).
  function filterOf({ status, from, to, q, page, pageSize }: AdminAppointmentsQueryOutput) {
    const filter: AdminAppointmentsFilter = {
      page,
      pageSize,
      ...(status === undefined ? {} : { status }),
      ...(from === undefined ? {} : { startsFrom: zonedInstant(from, 0, timeZone) }),
      ...(to === undefined ? {} : { startsBefore: localDayRange(to, timeZone).endsAt }),
      ...(q === undefined ? {} : { search: q }),
    };
    return filter;
  }

  async function findOrThrow(id: string): Promise<AdminAppointmentRecord> {
    const found = await appointments.findById(id);
    if (found === undefined) throw new NotFoundError(NOT_FOUND_DETAIL);
    return found;
  }

  function assertTransition(
    appointment: AdminAppointmentRecord,
    to: AppointmentStatusTarget,
    now: Date,
  ): void {
    const decision = decideTransition({
      from: appointment.status,
      to,
      actor: 'ADMIN',
      startsAt: appointment.startsAt,
      now,
      policy,
    });
    if (!decision.ok) throw transitionError(decision.reason, NOT_CONFIRMED_DETAIL);
  }

  return {
    async list(query) {
      const { page, pageSize } = query;
      const result = await appointments.list(filterOf(query));
      return {
        items: result.items.map(toAdminAppointmentDto),
        page,
        pageSize,
        total: result.total,
      };
    },

    async updateStatus({ actor, requestId }, id, status) {
      const now = clock.now();
      const current = await findOrThrow(id);
      assertTransition(current, status, now);

      const updated = await appointments.transaction(async (tx) => {
        const changed = await tx.setStatusIfConfirmed(id, status);
        if (changed !== undefined) {
          await tx.audit.append(
            appointmentStatusChangedEvent({ actor, requestId, now }, current, changed),
          );
        }
        return changed;
      });
      if (updated !== undefined) return toAdminAppointmentDto(updated);

      // Someone else changed it between the read and the update: report against the fresh state.
      assertTransition(await findOrThrow(id), status, now);
      throw new ConflictError('CONFLICT');
    },

    async history(id) {
      await findOrThrow(id);
      const events = await appointments.listHistory(id);
      // Parsed so an unexpected action or status in the table fails loudly instead of leaking out.
      return appointmentHistorySchema.parse({
        items: events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
      });
    },
  };
}
