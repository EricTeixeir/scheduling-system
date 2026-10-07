import { useId } from 'react';

import { Slider } from '@/components/ui/slider';
import { formatDuration } from '@/lib/time/format';

import { appointmentTimeRange } from '../shared/appointment-format';
import { bookedRangeOf, type ChosenSlot } from './chosen-slot';

interface DurationFieldProps {
  readonly chosen: ChosenSlot;
  readonly disabled: boolean;
  readonly onMinutesChange: (minutes: number) => void;
}

export function DurationField({ chosen, disabled, onMinutesChange }: DurationFieldProps) {
  const labelId = useId();
  const { slotMinutes, maxMinutes } = chosen.limits;
  if (maxMinutes <= slotMinutes) return null;
  const summary = `${appointmentTimeRange(bookedRangeOf(chosen), chosen.timeZone)} · ${formatDuration(chosen.minutes)}`;

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span id={labelId} className="font-medium">
          Duração
        </span>
        <output aria-live="polite" className="font-medium tabular-nums">
          {summary}
        </output>
      </div>
      <Slider
        value={[chosen.minutes]}
        min={slotMinutes}
        max={maxMinutes}
        step={slotMinutes}
        disabled={disabled}
        thumbProps={{ 'aria-labelledby': labelId, 'aria-valuetext': summary }}
        onValueChange={([minutes]) => {
          if (minutes !== undefined) onMinutesChange(minutes);
        }}
      />
    </div>
  );
}
