import { auditBase, type AuditContext } from '../appointments/appointment-audit';
import type { AuditAction, AuditEvent } from '../audit/audit.ports';
import type { ScheduleBlockRecord } from './schedule-blocks.ports';

// The reason is left out: it is free text and may carry personal data.
function blockEvent(
  context: AuditContext,
  action: Extract<AuditAction, 'BLOCK_CREATED' | 'BLOCK_DELETED'>,
  block: ScheduleBlockRecord,
): AuditEvent {
  return {
    ...auditBase(context),
    entityType: 'SCHEDULE_BLOCK',
    entityId: block.id,
    action,
    fromStatus: null,
    toStatus: null,
    metadata: {
      weekdays: block.weekdays.join(','),
      startTime: block.startTime,
      endTime: block.endTime,
      startsOn: block.startsOn,
      ...(block.endsOn === null ? {} : { endsOn: block.endsOn }),
    },
  };
}

export function blockCreatedEvent(context: AuditContext, block: ScheduleBlockRecord): AuditEvent {
  return blockEvent(context, 'BLOCK_CREATED', block);
}

export function blockDeletedEvent(context: AuditContext, block: ScheduleBlockRecord): AuditEvent {
  return blockEvent(context, 'BLOCK_DELETED', block);
}
