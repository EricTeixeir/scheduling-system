import type { Appointment } from '@scheduling/shared';

import { formatDayTitle, formatTime, formatTimeRange, weekdayName } from '@/lib/time/format';
import { localDateOf } from '@/lib/time/local-date';

type AppointmentTimes = Pick<Appointment, 'startsAt' | 'endsAt'>;

export function appointmentDayTitle(appointment: AppointmentTimes, timeZone: string): string {
  return formatDayTitle(localDateOf(appointment.startsAt, timeZone));
}

export function appointmentTimeRange(appointment: AppointmentTimes, timeZone: string): string {
  return formatTimeRange(appointment.startsAt, appointment.endsAt, timeZone);
}

export function appointmentWhen(appointment: AppointmentTimes, timeZone: string): string {
  return `${appointmentDayTitle(appointment, timeZone)} · ${appointmentTimeRange(appointment, timeZone)}`;
}

export function appointmentWeekdayAndTime(appointment: AppointmentTimes, timeZone: string): string {
  const weekday = weekdayName(localDateOf(appointment.startsAt, timeZone)).toLocaleLowerCase(
    'pt-BR',
  );
  return `${weekday} às ${formatTime(appointment.startsAt, timeZone)}`;
}

export function hasStarted(appointment: AppointmentTimes, now: Date): boolean {
  return Date.parse(appointment.startsAt) <= now.getTime();
}
