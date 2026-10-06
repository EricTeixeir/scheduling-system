import type { WeeklyHours } from '../../domain/availability/weekly-hours';
import type { LocalDate } from '../../domain/time/local-date';
import type { TimeRange } from '../../domain/time/time-range';

export interface DaySchedule {
  readonly hours: WeeklyHours | null;
  readonly isClosedDate: boolean;
}

export interface ScheduleReader {
  findDaySchedule(date: LocalDate): Promise<DaySchedule>;
}

export interface AvailabilityRepository extends ScheduleReader {
  // Only CANCELLED frees a slot, matching the no_overlap constraint.
  findBusyRanges(within: TimeRange): Promise<TimeRange[]>;
}
