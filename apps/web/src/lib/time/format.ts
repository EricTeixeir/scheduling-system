import { dayOfMonth, toUtcMidnight, weekdayOf, type LocalDate, type Weekday } from './local-date';

const LOCALE = 'pt-BR';

const WEEKDAY_NAMES: Readonly<Record<Weekday, string>> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

function calendarPart(date: LocalDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(
    toUtcMidnight(date),
  );
}

export function nameOfWeekday(weekday: Weekday): string {
  // eslint-disable-next-line security/detect-object-injection -- weekday is a typed Weekday, never free-form input.
  return WEEKDAY_NAMES[weekday];
}

export function weekdayName(date: LocalDate): string {
  return nameOfWeekday(weekdayOf(date));
}

export function shortWeekdayName(date: LocalDate): string {
  return weekdayName(date).slice(0, 3);
}

export function formatDayTitle(date: LocalDate): string {
  return `${weekdayName(date)}, ${String(dayOfMonth(date))} de ${calendarPart(date, { month: 'long' })}`;
}

export function formatDayMonth(date: LocalDate): string {
  return calendarPart(date, { day: '2-digit', month: '2-digit' });
}

export function formatMonthSpan(first: LocalDate, last: LocalDate): string {
  const month = (date: LocalDate) => capitalize(calendarPart(date, { month: 'long' }));
  const year = (date: LocalDate) => calendarPart(date, { year: 'numeric' });
  if (year(first) !== year(last)) {
    return `${month(first)} de ${year(first)} – ${month(last)} de ${year(last)}`;
  }
  if (month(first) !== month(last)) return `${month(first)} – ${month(last)} de ${year(last)}`;
  return `${month(first)} de ${year(first)}`;
}

export function formatTime(instant: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}

export function formatTimeRange(
  startsAt: Date | string,
  endsAt: Date | string,
  timeZone: string,
): string {
  return `${formatTime(startsAt, timeZone)} – ${formatTime(endsAt, timeZone)}`;
}

export function hourOf(instant: Date | string, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(
      new Date(instant),
    ),
  );
}
