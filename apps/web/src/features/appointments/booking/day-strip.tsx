import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { formatDayTitle, formatMonthSpan, shortWeekdayName } from '@/lib/time/format';
import { dayOfMonth, type LocalDate } from '@/lib/time/local-date';
import { cn } from '@/lib/utils';

export interface DaySummary {
  readonly date: LocalDate;
  readonly slotCount: number | undefined;
}

interface DayStripProps {
  readonly days: readonly DaySummary[];
  readonly selectedDate: LocalDate;
  readonly today: LocalDate;
  readonly canGoBack: boolean;
  readonly onSelect: (date: LocalDate) => void;
  readonly onPreviousWeek: () => void;
  readonly onNextWeek: () => void;
}

function slotCountLabel(slotCount: number | undefined): string | undefined {
  if (slotCount === undefined) return undefined;
  if (slotCount === 0) return 'sem horários';
  return slotCount === 1 ? '1 horário' : `${String(slotCount)} horários`;
}

export function DayStrip({
  days,
  selectedDate,
  today,
  canGoBack,
  onSelect,
  onPreviousWeek,
  onNextWeek,
}: DayStripProps) {
  const headingId = useId();
  const first = days.at(0)?.date ?? selectedDate;
  const last = days.at(-1)?.date ?? selectedDate;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border bg-card p-3 shadow-sm lg:sticky lg:top-24 lg:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Semana anterior"
          disabled={!canGoBack}
          onClick={onPreviousWeek}
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>
        <h2 id={headingId} aria-live="polite" className="text-sm font-semibold">
          {formatMonthSpan(first, last)}
        </h2>
        <Button variant="ghost" size="icon" aria-label="Próxima semana" onClick={onNextWeek}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
      <ul className="-mx-1 mt-2 flex snap-x gap-2 overflow-x-auto px-1 py-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {days.map((day) => (
          <li key={day.date} className="flex-1 snap-start">
            <DayButton
              day={day}
              selected={day.date === selectedDate}
              isToday={day.date === today}
              onSelect={onSelect}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

interface DayButtonProps {
  readonly day: DaySummary;
  readonly selected: boolean;
  readonly isToday: boolean;
  readonly onSelect: (date: LocalDate) => void;
}

function DayButton({ day, selected, isToday, onSelect }: DayButtonProps) {
  const unavailable = day.slotCount === 0;
  const countLabel = slotCountLabel(day.slotCount);
  const accessibleName = [formatDayTitle(day.date), isToday ? 'hoje' : undefined, countLabel]
    .filter((part) => part !== undefined)
    .join(', ');

  return (
    <button
      type="button"
      aria-label={accessibleName}
      aria-pressed={selected}
      aria-current={isToday ? 'date' : undefined}
      disabled={unavailable}
      onClick={() => {
        onSelect(day.date);
      }}
      className={cn(
        'flex w-full min-w-13 flex-col items-center gap-0.5 rounded-xl border px-2 py-2 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'lg:flex-row lg:justify-between lg:gap-3 lg:px-3',
        selected
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'bg-background hover:border-primary/40 hover:bg-accent',
        unavailable && 'cursor-not-allowed border-dashed bg-muted/40 text-muted-foreground',
      )}
    >
      <span className="flex flex-col items-center lg:flex-row lg:gap-2">
        <span
          className={cn(
            'text-xs font-medium',
            selected ? 'text-primary-foreground/85' : 'text-muted-foreground',
          )}
        >
          {isToday ? 'Hoje' : shortWeekdayName(day.date)}
        </span>
        <span className="text-lg leading-tight font-semibold tabular-nums lg:text-base">
          {dayOfMonth(day.date)}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full lg:hidden',
          day.slotCount === undefined && 'animate-pulse bg-muted-foreground/30',
          day.slotCount !== undefined && day.slotCount > 0 && 'bg-success',
          selected && day.slotCount !== undefined && 'bg-primary-foreground',
          unavailable && 'bg-transparent',
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'hidden text-xs lg:inline',
          selected ? 'text-primary-foreground/85' : 'text-muted-foreground',
        )}
      >
        {countLabel ?? '…'}
      </span>
    </button>
  );
}
