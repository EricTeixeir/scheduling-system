import {
  appointmentHistorySchema,
  appointmentSchema,
  CLIENT_SEARCH_LIMIT,
  type AdminAppointment,
  type AdminAppointmentsQueryOutput,
  type AdminCreateAppointmentOutput,
  type AdminSummary,
  type AppointmentHistory,
  type AppointmentStatus,
  type AppointmentStatusTarget,
  type ClientSearchResponse,
} from '@scheduling/shared';

import { decideTransition } from '../../domain/appointment/appointment-status';
import type { BookingPolicy } from '../../domain/appointment/booking-policy';
import type { Clock } from '../../domain/time/clock';
import {
  addLocalDays,
  localDateOf,
  localDayRange,
  zonedInstant,
  type LocalDate,
} from '../../domain/time/local-date';
import { ConflictError, NotFoundError } from '../../errors/app-errors';
import { appointmentStatusChangedEvent } from '../appointments/appointment-audit';
import {
  NOT_FOUND_DETAIL,
  toAppointmentDto,
  type Book,
  type RequestContext,
} from '../appointments/appointments.service';
import { transitionError } from '../appointments/transition-errors';
import type {
  AdminAppointmentRecord,
  AdminAppointmentRepository,
  AdminAppointmentsFilter,
} from './admin-appointments.ports';

export const NOT_CONFIRMED_DETAIL = 'Somente agendamentos confirmados podem mudar de status.';
export const CLIENT_NOT_FOUND_DETAIL = 'Cliente não encontrado.';

export interface AdminAppointmentsPage {
  readonly items: AdminAppointment[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface AdminCreateAppointmentCommand {
  readonly idempotencyKey: string;
  readonly input: AdminCreateAppointmentOutput;
}

export interface AdminCreateAppointmentResult {
  readonly status: number;
  readonly body: AdminAppointment;
  readonly replayed: boolean;
}

export interface AdminAppointmentsService {
  create(
    context: RequestContext,
    command: AdminCreateAppointmentCommand,
  ): Promise<AdminCreateAppointmentResult>;
  list(query: AdminAppointmentsQueryOutput): Promise<AdminAppointmentsPage>;
  updateStatus(
    context: RequestContext,
    id: string,
    status: AppointmentStatusTarget,
  ): Promise<AdminAppointment>;
  history(id: string): Promise<AppointmentHistory>;
  searchClients(search: string): Promise<ClientSearchResponse>;
  summary(): Promise<AdminSummary>;
}

export interface AdminAppointmentsServiceDependencies {
  readonly appointments: AdminAppointmentRepository;
  readonly book: Book;
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
  book,
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

  const startOfDay = (date: LocalDate) => zonedInstant(date, 0, timeZone);

  function countStarting(status: AppointmentStatus, startsFrom: Date, startsBefore: Date) {
    return appointments.count({ status, startsFrom, startsBefore });
  }

  return {
    async create(context, { idempotencyKey, input }) {
      const client = await appointments.findClient(input.clientId);
      if (client === undefined) throw new NotFoundError(CLIENT_NOT_FOUND_DETAIL);
      const { status, body, replayed } = await book(context, {
        ownerId: client.id,
        idempotencyKey,
        input,
      });
      // The stored response is the plain appointment, keeping the client's name and e-mail out of
      // idempotency rows; the client is added back on every answer, replays included.
      return { status, body: { ...appointmentSchema.parse(body), client }, replayed };
    },

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

    async searchClients(search) {
      return { items: await appointments.searchClients(search, CLIENT_SEARCH_LIMIT) };
    },

    async summary() {
      const now = clock.now();
      const today = localDateOf(now, timeZone);
      const startOfToday = startOfDay(today);
      const startOfTomorrow = startOfDay(addLocalDays(today, 1));
      const startOfLast30Days = startOfDay(addLocalDays(today, -29));
      const [todayConfirmed, next7DaysConfirmed, completed, noShow, cancelled] = await Promise.all([
        countStarting('CONFIRMED', startOfToday, startOfTomorrow),
        countStarting('CONFIRMED', now, startOfDay(addLocalDays(today, 7))),
        countStarting('COMPLETED', startOfLast30Days, startOfTomorrow),
        countStarting('NO_SHOW', startOfLast30Days, startOfTomorrow),
        countStarting('CANCELLED', startOfLast30Days, startOfTomorrow),
      ]);
      return {
        todayConfirmed,
        next7DaysConfirmed,
        completedLast30Days: completed,
        noShowLast30Days: noShow,
        cancelledLast30Days: cancelled,
      };
    },
  };
}
