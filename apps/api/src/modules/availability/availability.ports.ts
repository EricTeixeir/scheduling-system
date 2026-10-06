import type { ScheduleBlock } from '../../domain/availability/schedule-block';
import type { WeeklyHours } from '../../domain/availability/weekly-hours';
import type { LocalDate } from '../../domain/time/local-date';
import type { TimeRange } from '../../domain/time/time-range';

export interface DaySchedule {
  readonly hours: WeeklyHours | null;
  readonly isClosedDate: boolean;
  // Only the blocks whose date range and weekdays include the requested date.
  readonly blocks: readonly ScheduleBlock[];
}

export interface ScheduleReader {
  findDaySchedule(date: LocalDate): Promise<DaySchedule>;
}

export interface AvailabilityRepository extends ScheduleReader {
  // Only CANCELLED frees a slot, matching the no_overlap constraint.
  findBusyRanges(within: TimeRange): Promise<TimeRange[]>;
}
