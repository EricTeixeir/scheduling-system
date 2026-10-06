import type { AppointmentStatus, Role } from '@scheduling/shared';

import type { AppointmentRecord } from '../appointments/appointments.ports';
import type { AuditLog } from '../audit/audit.ports';

export interface ClientSummary {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface AdminAppointmentRecord extends AppointmentRecord {
  readonly client: ClientSummary;
}

export interface AppointmentCriteria {
  readonly status?: AppointmentStatus;
  // Half-open: startsAt >= startsFrom and startsAt < startsBefore.
  readonly startsFrom?: Date;
  readonly startsBefore?: Date;
  // Case-insensitive substring of the client's name or e-mail, matched literally.
  readonly search?: string;
}

export interface AdminAppointmentsFilter extends AppointmentCriteria {
  readonly page: number;
  readonly pageSize: number;
}

export interface AdminAppointmentPage {
  readonly items: readonly AdminAppointmentRecord[];
  readonly total: number;
}

export interface HistoryEventRecord {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: string;
  readonly fromStatus: string | null;
  readonly toStatus: string | null;
  readonly actor: { readonly id: string; readonly name: string; readonly role: Role };
}

export interface AdminAppointmentsTransaction {
  setStatusIfConfirmed(
    id: string,
    status: AppointmentStatus,
  ): Promise<AdminAppointmentRecord | undefined>;
  readonly audit: AuditLog;
}

export interface AdminAppointmentRepository {
  // Ordered by startsAt ascending, id as the tiebreak.
  list(filter: AdminAppointmentsFilter): Promise<AdminAppointmentPage>;
  count(criteria: AppointmentCriteria): Promise<number>;
  findById(id: string): Promise<AdminAppointmentRecord | undefined>;
  listHistory(appointmentId: string): Promise<HistoryEventRecord[]>;
  // Users with the CLIENT role only: an admin id is as unknown as a missing one.
  findClient(id: string): Promise<ClientSummary | undefined>;
  // Same matching as AppointmentCriteria.search, ordered by name.
  searchClients(search: string, limit: number): Promise<ClientSummary[]>;
  transaction<T>(work: (tx: AdminAppointmentsTransaction) => Promise<T>): Promise<T>;
}
