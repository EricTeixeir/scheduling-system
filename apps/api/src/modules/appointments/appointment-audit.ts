import type { AppointmentHistoryAction, AppointmentStatus, Role } from '@scheduling/shared';

import type { AuditEvent } from '../audit/audit.ports';
import type { AppointmentRecord } from './appointments.ports';

export interface Actor {
  readonly id: string;
  readonly role: Role;
}

export interface AuditContext {
  readonly actor: Actor;
  readonly requestId: string;
  readonly now: Date;
}

export function auditBase({ actor, requestId, now }: AuditContext) {
  return { occurredAt: now, actorId: actor.id, actorRole: actor.role, requestId } as const;
}

export function appointmentCreatedEvent(
  context: AuditContext,
  appointment: AppointmentRecord,
): AuditEvent {
  return {
    ...auditBase(context),
    entityType: 'APPOINTMENT',
    entityId: appointment.id,
    action: 'APPOINTMENT_CREATED',
    fromStatus: null,
    toStatus: appointment.status,
    metadata: {
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
    },
  };
}

const STATUS_CHANGE_ACTIONS = new Map<AppointmentStatus, AppointmentHistoryAction>([
  ['CANCELLED', 'APPOINTMENT_CANCELLED'],
  ['COMPLETED', 'APPOINTMENT_COMPLETED'],
  ['NO_SHOW', 'APPOINTMENT_NO_SHOW'],
]);

export function appointmentStatusChangedEvent(
  context: AuditContext,
  before: Pick<AppointmentRecord, 'status'>,
  after: Pick<AppointmentRecord, 'id' | 'status'>,
): AuditEvent {
  const action = STATUS_CHANGE_ACTIONS.get(after.status);
  if (action === undefined) throw new Error(`no audit action for a change to ${after.status}`);
  return {
    ...auditBase(context),
    entityType: 'APPOINTMENT',
    entityId: after.id,
    action,
    fromStatus: before.status,
    toStatus: after.status,
    metadata: null,
  };
}
