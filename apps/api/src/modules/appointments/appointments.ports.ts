import type { AppointmentScope, AppointmentStatus } from '@scheduling/shared';

import type { ConflictCode } from '../../errors/app-errors';
import type { AuditLog } from '../audit/audit.ports';

export interface AppointmentRecord {
  readonly id: string;
  readonly userId: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: AppointmentStatus;
  readonly notes: string | null;
  readonly createdAt: Date;
}

export interface OwnAppointmentsQuery {
  readonly userId: string;
  readonly scope: AppointmentScope;
  readonly now: Date;
  readonly page: number;
  readonly pageSize: number;
}

export interface AppointmentPage {
  readonly items: readonly AppointmentRecord[];
  readonly total: number;
}

export interface StoredResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface IdempotencyRecord {
  readonly requestHash: string;
  readonly response: StoredResponse;
}

export interface NewIdempotencyRecord extends IdempotencyRecord {
  readonly userId: string;
  readonly key: string;
  readonly createdAt: Date;
}

export interface AppointmentsTransaction {
  // Deletes an expired row for the same user and key, then inserts. Throws
  // IdempotencyKeyTakenError when a live row exists or another transaction holds the key.
  claimIdempotencyKey(record: NewIdempotencyRecord, expiredBefore: Date): Promise<void>;
  insertAppointment(appointment: AppointmentRecord): Promise<void>;
  cancelIfConfirmed(id: string, userId: string): Promise<AppointmentRecord | undefined>;
  readonly audit: AuditLog;
}

export interface TransactionOptions {
  readonly onContention: ConflictCode;
}

export interface AppointmentRepository {
  findOwned(id: string, userId: string): Promise<AppointmentRecord | undefined>;
  listOwned(query: OwnAppointmentsQuery): Promise<AppointmentPage>;
  findIdempotencyRecord(
    userId: string,
    key: string,
    createdAfter: Date,
  ): Promise<IdempotencyRecord | undefined>;
  transaction<T>(
    work: (tx: AppointmentsTransaction) => Promise<T>,
    options: TransactionOptions,
  ): Promise<T>;
}
