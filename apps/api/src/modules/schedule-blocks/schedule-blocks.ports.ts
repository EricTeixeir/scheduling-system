import type { ScheduleBlock } from '../../domain/availability/schedule-block';
import type { AuditLog } from '../audit/audit.ports';

export interface ScheduleBlockRecord extends ScheduleBlock {
  readonly id: string;
  readonly reason: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface UpcomingAppointment {
  readonly id: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly clientName: string;
}

export interface ScheduleBlocksTransaction {
  insertBlock(block: ScheduleBlockRecord): Promise<void>;
  deleteBlock(id: string): Promise<ScheduleBlockRecord | undefined>;
  readonly audit: AuditLog;
}

export interface ScheduleBlockRepository {
  // Ordered by startsOn, then createdAt.
  list(): Promise<ScheduleBlockRecord[]>;
  // CONFIRMED appointments with after < startsAt <= until, oldest first.
  findConfirmedStartingBetween(after: Date, until: Date): Promise<UpcomingAppointment[]>;
  transaction<T>(work: (tx: ScheduleBlocksTransaction) => Promise<T>): Promise<T>;
}
