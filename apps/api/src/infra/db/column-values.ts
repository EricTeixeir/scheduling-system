import type { LocalDate } from '../../domain/time/local-date';

// Prisma reads and writes TIME and DATE columns as a Date whose UTC fields carry the stored
// value (TIME on 1970-01-01, DATE at 00:00), whatever the process time zone is.

export function timeColumnToHhMm(time: Date): string {
  const hours = String(time.getUTCHours()).padStart(2, '0');
  const minutes = String(time.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function hhMmToTimeColumn(hhmm: string): Date {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

export function dateColumnToLocalDate(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

export function localDateToDateColumn(date: LocalDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}
