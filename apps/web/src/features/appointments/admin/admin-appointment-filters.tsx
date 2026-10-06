import { APPOINTMENT_STATUSES, SEARCH_MAX_LENGTH } from '@scheduling/shared';
import { Search } from 'lucide-react';
import { useId } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { statusPresentationOf } from '../shared/status-presentation';
import { PERIODS, type Period, type StatusFilter } from './admin-appointment-period';

const SELECT_CLASSES =
  'h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:h-10 md:text-sm dark:bg-input/30 [&_option]:bg-popover [&_option]:text-popover-foreground';

interface AdminAppointmentFiltersProps {
  readonly search: string;
  readonly status: StatusFilter;
  readonly period: Period;
  readonly onSearchChange: (search: string) => void;
  readonly onStatusChange: (status: StatusFilter) => void;
  readonly onPeriodChange: (period: Period) => void;
}

export function AdminAppointmentFilters({
  search,
  status,
  period,
  onSearchChange,
  onStatusChange,
  onPeriodChange,
}: AdminAppointmentFiltersProps) {
  const id = useId();
  return (
    <div role="search" className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
      <div className="col-span-2 grid gap-1.5 md:col-span-1">
        <Label htmlFor={`${id}-search`}>Buscar cliente</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id={`${id}-search`}
            type="search"
            className="pl-9"
            placeholder="Nome ou e-mail"
            maxLength={SEARCH_MAX_LENGTH}
            autoComplete="off"
            value={search}
            onChange={(event) => {
              onSearchChange(event.target.value);
            }}
          />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-status`}>Status</Label>
        <select
          id={`${id}-status`}
          className={SELECT_CLASSES}
          value={status}
          onChange={(event) => {
            onStatusChange(
              APPOINTMENT_STATUSES.find((candidate) => candidate === event.target.value) ?? 'ALL',
            );
          }}
        >
          <option value="ALL">Todos</option>
          {APPOINTMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusPresentationOf(value).label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-period`}>Período</Label>
        <select
          id={`${id}-period`}
          className={SELECT_CLASSES}
          value={period}
          onChange={(event) => {
            onPeriodChange(
              PERIODS.find((candidate) => candidate.value === event.target.value)?.value ?? 'all',
            );
          }}
        >
          {PERIODS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
