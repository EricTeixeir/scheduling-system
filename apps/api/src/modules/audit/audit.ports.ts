import type { AppointmentHistoryAction, AppointmentStatus, Role } from '@scheduling/shared';

export type AuditAction = AppointmentHistoryAction | 'BLOCK_CREATED' | 'BLOCK_DELETED';

export type AuditEntityType = 'APPOINTMENT' | 'SCHEDULE_BLOCK';

// metadata is stored as-is and must never carry personal data (names, emails, notes) or secrets.
export interface AuditEvent {
  readonly occurredAt: Date;
  readonly actorId: string;
  readonly actorRole: Role;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly fromStatus: AppointmentStatus | null;
  readonly toStatus: AppointmentStatus | null;
  readonly requestId: string;
  readonly metadata: Readonly<Record<string, string>> | null;
}

// Implementations write inside the caller's transaction: the event exists only if the change does.
export interface AuditLog {
  append(event: AuditEvent): Promise<void>;
}
