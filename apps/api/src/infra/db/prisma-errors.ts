import { ConflictError, NotFoundError, type ConflictCode } from '../../errors/app-errors';
import { Prisma } from './generated/client.js';

const EXCLUSION_VIOLATION = '23P01';
const DEADLOCK_DETECTED = '40P01';
const SERIALIZATION_FAILURE = '40001';
const TRANSACTION_WRITE_CONFLICT = 'P2034';
const UNIQUE_VIOLATION = 'P2002';
const RECORD_NOT_FOUND = 'P2025';

export interface PrismaErrorContext {
  readonly onContention?: ConflictCode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// With the pg driver adapter, constraint violations arrive as P2039 and the SQLSTATE is nested here.
function sqlState(error: Prisma.PrismaClientKnownRequestError): string | undefined {
  const adapterError = error.meta?.driverAdapterError;
  if (!isRecord(adapterError) || !isRecord(adapterError.cause)) return undefined;
  const { originalCode } = adapterError.cause;
  return typeof originalCode === 'string' ? originalCode : undefined;
}

// `meta` is never copied into the AppError: it carries a driver stack trace.
export function mapPrismaError(error: unknown, context: PrismaErrorContext = {}): unknown {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return error;

  const state = sqlState(error);
  if (state === EXCLUSION_VIOLATION) {
    return new ConflictError('SLOT_TAKEN', 'Este horário acabou de ser reservado. Escolha outro.');
  }
  // Concurrent bookings of one slot sometimes lose as a deadlock or serialization failure
  // instead of an exclusion violation: same outcome for the client, another request won.
  if (
    error.code === TRANSACTION_WRITE_CONFLICT ||
    state === DEADLOCK_DETECTED ||
    state === SERIALIZATION_FAILURE
  ) {
    return new ConflictError(context.onContention ?? 'CONFLICT');
  }
  if (error.code === UNIQUE_VIOLATION) {
    return new ConflictError('CONFLICT', 'Já existe um registro com estes dados.');
  }
  if (error.code === RECORD_NOT_FOUND) return new NotFoundError();
  // Postgres messages can quote row data (a CHECK failure prints the whole row): keep codes only.
  return new Error(`Unexpected database error ${error.code} (SQLSTATE ${state ?? 'unknown'})`);
}
