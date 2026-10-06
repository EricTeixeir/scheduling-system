import type { WeeklyHours } from '../domain/availability/weekly-hours';
import { weekdayOf, type LocalDate } from '../domain/time/local-date';
import { overlaps } from '../domain/time/time-range';
import { ConflictError } from '../errors/app-errors';
import type {
  AppointmentRecord,
  AppointmentRepository,
  AppointmentsTransaction,
  NewIdempotencyRecord,
} from '../modules/appointments/appointments.ports';
import { IdempotencyKeyTakenError } from '../modules/appointments/idempotency';
import type { AuditEvent } from '../modules/audit/audit.ports';
import type { AvailabilityRepository } from '../modules/availability/availability.ports';

// Mirrors PostgreSQL: uncommitted writes are invisible, a second claim of a key waits for the
// first transaction to end (unique index), and overlaps are refused like no_overlap.
export interface InMemorySchedulingStore {
  readonly rules: Map<number, WeeklyHours>;
  readonly closedDates: Set<LocalDate>;
  readonly appointments: Map<string, AppointmentRecord>;
  readonly idempotencyKeys: Map<string, NewIdempotencyRecord>;
  readonly auditEvents: AuditEvent[];
  readonly availability: AvailabilityRepository;
  readonly repository: AppointmentRepository;
  holdCommitsUntil: Promise<void> | undefined;
}

export const WEEKDAY_HOURS: readonly WeeklyHours[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  opensAt: '09:00',
  closesAt: '18:00',
  slotMinutes: 30,
}));

function keyOf(userId: string, key: string): string {
  return `${userId}|${key}`;
}

function isActive(appointment: AppointmentRecord): boolean {
  return appointment.status !== 'CANCELLED';
}

export function createInMemorySchedulingStore(
  hours: readonly WeeklyHours[] = WEEKDAY_HOURS,
): InMemorySchedulingStore {
  const rules = new Map(hours.map((rule) => [rule.weekday, rule]));
  const closedDates = new Set<LocalDate>();
  const appointments = new Map<string, AppointmentRecord>();
  const idempotencyKeys = new Map<string, NewIdempotencyRecord>();
  const auditEvents: AuditEvent[] = [];
  const pendingKeys = new Map<string, Promise<void>>();
  const pendingAppointments = new Map<string, AppointmentRecord>();

  const store: InMemorySchedulingStore = {
    rules,
    closedDates,
    appointments,
    idempotencyKeys,
    auditEvents,
    holdCommitsUntil: undefined,

    availability: {
      findDaySchedule: (date) =>
        Promise.resolve({
          hours: rules.get(weekdayOf(date)) ?? null,
          isClosedDate: closedDates.has(date),
        }),
      findBusyRanges: (within) =>
        Promise.resolve(
          [...appointments.values()]
            .filter((row) => isActive(row) && overlaps(row, within))
            .map(({ startsAt, endsAt }) => ({ startsAt, endsAt })),
        ),
    },

    repository: {
      findOwned: (id, userId) => {
        const row = appointments.get(id);
        return Promise.resolve(row?.userId === userId ? { ...row } : undefined);
      },

      listOwned: ({ userId, scope, now, page, pageSize }) => {
        const upcoming = scope === 'upcoming';
        const matching = [...appointments.values()]
          .filter((row) => row.userId === userId)
          .filter((row) => row.startsAt.getTime() >= now.getTime() === upcoming)
          .sort((a, b) => (a.startsAt.getTime() - b.startsAt.getTime()) * (upcoming ? 1 : -1));
        const start = (page - 1) * pageSize;
        return Promise.resolve({
          items: matching.slice(start, start + pageSize),
          total: matching.length,
        });
      },

      findIdempotencyRecord: (userId, key, createdAfter) => {
        const row = idempotencyKeys.get(keyOf(userId, key));
        const fresh = row !== undefined && row.createdAt.getTime() >= createdAfter.getTime();
        return Promise.resolve(
          fresh ? { requestHash: row.requestHash, response: row.response } : undefined,
        );
      },

      async transaction(work) {
        const staged = new Map<string, NewIdempotencyRecord>();
        const inserted: string[] = [];
        const cancelled = new Map<string, AppointmentRecord>();
        const events: AuditEvent[] = [];
        let settle: () => void = () => undefined;
        const settled = new Promise<void>((resolve) => {
          settle = resolve;
        });

        const tx: AppointmentsTransaction = {
          async claimIdempotencyKey(record, expiredBefore) {
            const id = keyOf(record.userId, record.key);
            for (let held = pendingKeys.get(id); held !== undefined; held = pendingKeys.get(id)) {
              await held;
            }
            const existing = idempotencyKeys.get(id);
            if (existing !== undefined && existing.createdAt.getTime() < expiredBefore.getTime()) {
              idempotencyKeys.delete(id);
            }
            if (idempotencyKeys.has(id)) {
              throw new IdempotencyKeyTakenError();
            }
            pendingKeys.set(id, settled);
            staged.set(id, record);
          },

          insertAppointment(appointment) {
            const taken = [...appointments.values(), ...pendingAppointments.values()].some(
              (row) => isActive(row) && overlaps(row, appointment),
            );
            if (taken) {
              return Promise.reject(
                new ConflictError('SLOT_TAKEN', 'Este horário acabou de ser reservado.'),
              );
            }
            pendingAppointments.set(appointment.id, { ...appointment });
            inserted.push(appointment.id);
            return Promise.resolve();
          },

          cancelIfConfirmed(id, userId) {
            const row = cancelled.get(id) ?? appointments.get(id);
            if (row?.userId !== userId || row.status !== 'CONFIRMED') {
              return Promise.resolve(undefined);
            }
            const updated: AppointmentRecord = { ...row, status: 'CANCELLED' };
            cancelled.set(id, updated);
            return Promise.resolve({ ...updated });
          },

          audit: {
            append(event) {
              events.push(event);
              return Promise.resolve();
            },
          },
        };

        try {
          const result = await work(tx);
          await store.holdCommitsUntil;
          for (const [id, record] of staged) idempotencyKeys.set(id, record);
          for (const id of inserted) {
            const row = pendingAppointments.get(id);
            if (row !== undefined) appointments.set(id, row);
          }
          for (const [id, row] of cancelled) appointments.set(id, row);
          auditEvents.push(...events);
          return result;
        } finally {
          for (const id of staged.keys()) pendingKeys.delete(id);
          for (const id of inserted) pendingAppointments.delete(id);
          settle();
        }
      },
    },
  };
  return store;
}
