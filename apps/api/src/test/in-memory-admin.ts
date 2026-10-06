import { randomUUID } from 'node:crypto';

import type { Role } from '@scheduling/shared';

import type {
  AdminAppointmentRecord,
  AdminAppointmentRepository,
  AdminAppointmentsFilter,
} from '../modules/admin-appointments/admin-appointments.ports';
import type { AppointmentRecord } from '../modules/appointments/appointments.ports';
import type { AuditEvent } from '../modules/audit/audit.ports';
import type {
  ScheduleBlockRecord,
  ScheduleBlockRepository,
} from '../modules/schedule-blocks/schedule-blocks.ports';
import type { InMemorySchedulingStore } from './in-memory-appointments';

export interface DirectoryEntry {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
}

export interface InMemoryAdminRepositories {
  readonly adminAppointments: AdminAppointmentRepository;
  readonly scheduleBlocks: ScheduleBlockRepository;
}

function byStartThenId(a: AppointmentRecord, b: AppointmentRecord): number {
  return a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id);
}

function matches(row: AdminAppointmentRecord, filter: AdminAppointmentsFilter): boolean {
  const { status, startsFrom, startsBefore, search } = filter;
  const start = row.startsAt.getTime();
  const needle = search?.toLowerCase();
  return (
    (status === undefined || row.status === status) &&
    (startsFrom === undefined || start >= startsFrom.getTime()) &&
    (startsBefore === undefined || start < startsBefore.getTime()) &&
    (needle === undefined ||
      row.client.name.toLowerCase().includes(needle) ||
      row.client.email.toLowerCase().includes(needle))
  );
}

export function createInMemoryAdminRepositories(
  store: InMemorySchedulingStore,
  directory: ReadonlyMap<string, DirectoryEntry>,
): InMemoryAdminRepositories {
  const eventIds = new WeakMap<AuditEvent, string>();

  function person(id: string): DirectoryEntry {
    const found = directory.get(id);
    if (found === undefined) throw new Error(`no user ${id} in the test directory`);
    return found;
  }

  function withClient(row: AppointmentRecord): AdminAppointmentRecord {
    const { id, name, email } = person(row.userId);
    return { ...row, client: { id, name, email } };
  }

  function eventId(event: AuditEvent): string {
    let id = eventIds.get(event);
    if (id === undefined) {
      id = randomUUID();
      eventIds.set(event, id);
    }
    return id;
  }

  const adminAppointments: AdminAppointmentRepository = {
    list(filter) {
      const matching = [...store.appointments.values()]
        .sort(byStartThenId)
        .map(withClient)
        .filter((row) => matches(row, filter));
      const start = (filter.page - 1) * filter.pageSize;
      return Promise.resolve({
        items: matching.slice(start, start + filter.pageSize),
        total: matching.length,
      });
    },

    findById(id) {
      const row = store.appointments.get(id);
      return Promise.resolve(row === undefined ? undefined : withClient(row));
    },

    listHistory(appointmentId) {
      const events = store.auditEvents
        .filter((event) => event.entityType === 'APPOINTMENT' && event.entityId === appointmentId)
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      return Promise.resolve(
        events.map((event) => ({
          id: eventId(event),
          occurredAt: event.occurredAt,
          action: event.action,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          actor: { id: event.actorId, name: person(event.actorId).name, role: event.actorRole },
        })),
      );
    },

    async transaction(work) {
      const changed = new Map<string, AppointmentRecord>();
      const events: AuditEvent[] = [];
      const result = await work({
        setStatusIfConfirmed(id, status) {
          const row = changed.get(id) ?? store.appointments.get(id);
          if (row?.status !== 'CONFIRMED') return Promise.resolve(undefined);
          const updated: AppointmentRecord = { ...row, status };
          changed.set(id, updated);
          return Promise.resolve(withClient(updated));
        },
        audit: {
          append(event) {
            events.push(event);
            return Promise.resolve();
          },
        },
      });
      for (const [id, row] of changed) store.appointments.set(id, row);
      store.auditEvents.push(...events);
      return result;
    },
  };

  const scheduleBlocks: ScheduleBlockRepository = {
    list() {
      return Promise.resolve(
        [...store.blocks.values()].sort(
          (a, b) =>
            a.startsOn.localeCompare(b.startsOn) || a.createdAt.getTime() - b.createdAt.getTime(),
        ),
      );
    },

    findConfirmedStartingBetween(after, until) {
      return Promise.resolve(
        [...store.appointments.values()]
          .filter(
            (row) =>
              row.status === 'CONFIRMED' &&
              row.startsAt.getTime() > after.getTime() &&
              row.startsAt.getTime() <= until.getTime(),
          )
          .sort(byStartThenId)
          .map((row) => ({
            id: row.id,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            clientName: person(row.userId).name,
          })),
      );
    },

    async transaction(work) {
      const inserted: ScheduleBlockRecord[] = [];
      const deleted = new Set<string>();
      const events: AuditEvent[] = [];
      const result = await work({
        insertBlock(block) {
          inserted.push({ ...block, weekdays: [...block.weekdays] });
          return Promise.resolve();
        },
        deleteBlock(id) {
          const found = deleted.has(id) ? undefined : store.blocks.get(id);
          if (found !== undefined) deleted.add(id);
          return Promise.resolve(found);
        },
        audit: {
          append(event) {
            events.push(event);
            return Promise.resolve();
          },
        },
      });
      for (const block of inserted) store.blocks.set(block.id, block);
      for (const id of deleted) store.blocks.delete(id);
      store.auditEvents.push(...events);
      return result;
    },
  };

  return { adminAppointments, scheduleBlocks };
}
