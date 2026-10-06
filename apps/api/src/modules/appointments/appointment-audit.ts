import type { Role } from '@scheduling/shared';

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

function base({ actor, requestId, now }: AuditContext, appointmentId: string) {
  return {
    occurredAt: now,
    actorId: actor.id,
    actorRole: actor.role,
    entityType: 'APPOINTMENT',
    entityId: appointmentId,
    requestId,
  } as const;
}

export function appointmentCreatedEvent(
  context: AuditContext,
  appointment: AppointmentRecord,
): AuditEvent {
  return {
    ...base(context, appointment.id),
    action: 'APPOINTMENT_CREATED',
    fromStatus: null,
    toStatus: appointment.status,
    metadata: {
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
    },
  };
}

export function appointmentCancelledEvent(
  context: AuditContext,
  before: AppointmentRecord,
  after: AppointmentRecord,
): AuditEvent {
  return {
    ...base(context, after.id),
    action: 'APPOINTMENT_CANCELLED',
    fromStatus: before.status,
    toStatus: after.status,
    metadata: null,
  };
}
