import { zodResolver } from '@hookform/resolvers/zod';
import {
  BLOCK_REASON_MAX_LENGTH,
  createScheduleBlockSchema,
  type CreateScheduleBlockInput,
  type CreateScheduleBlockOutput,
  type ScheduleConflict,
} from '@scheduling/shared';
import { CalendarX2, LoaderCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { PATHS } from '@/app/navigation';
import { FormField } from '@/components/form/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormAlert } from '@/features/auth/form-alert';
import { isApiError } from '@/lib/api/api-error';
import { splitServerErrors } from '@/lib/errors/server-form-errors';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { formatTime, nameOfWeekday } from '@/lib/time/format';
import type { LocalDate, Weekday } from '@/lib/time/local-date';
import { cn } from '@/lib/utils';

import { appointmentDayTitle } from '../appointments/shared/appointment-format';
import { useCreateScheduleBlock } from './use-schedule-blocks';
import { ALL_WEEKDAYS, WORKDAYS, weekdayInitial, weekdaysIn } from './weekdays';

const BLOCK_FIELDS = ['weekdays', 'startTime', 'endTime', 'startsOn', 'endsOn', 'reason'] as const;
const END_DATE_REQUIRED = 'Informe a data final ou marque "Sem data de término".';

const emptyAsUndefined = (value: string) => (value === '' ? undefined : value);

interface ScheduleBlockFormProps {
  readonly today: LocalDate;
  readonly onCreated: () => void;
}

export function ScheduleBlockForm({ today, onCreated }: ScheduleBlockFormProps) {
  const id = useId();
  const create = useCreateScheduleBlock();
  const [hasNoEndDate, setHasNoEndDate] = useState(false);
  const [formMessage, setFormMessage] = useState<string>();
  const [conflicts, setConflicts] = useState<readonly ScheduleConflict[]>([]);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateScheduleBlockInput, unknown, CreateScheduleBlockOutput>({
    resolver: zodResolver(createScheduleBlockSchema),
    defaultValues: {
      weekdays: [...WORKDAYS],
      startTime: '12:00',
      endTime: '13:00',
      startsOn: today,
    },
  });
  const selectedWeekdays = weekdaysIn(useWatch({ control, name: 'weekdays' }));

  const chooseWeekdays = (weekdays: readonly Weekday[]) => {
    setValue('weekdays', [...weekdays], { shouldValidate: true });
  };

  const toggleWeekday = (weekday: Weekday) => {
    chooseWeekdays(
      selectedWeekdays.includes(weekday)
        ? selectedWeekdays.filter((day) => day !== weekday)
        : [...selectedWeekdays, weekday],
    );
  };

  const onSubmit = handleSubmit(async (block) => {
    setFormMessage(undefined);
    setConflicts([]);
    if (!hasNoEndDate && block.endsOn === undefined) {
      setError('endsOn', { type: 'required', message: END_DATE_REQUIRED }, { shouldFocus: true });
      return;
    }
    try {
      await create.mutateAsync(block);
      toast.success('Bloqueio criado.');
      onCreated();
    } catch (error) {
      if (isApiError(error) && error.code === 'BLOCK_CONFLICT') {
        setConflicts(error.conflicts);
        return;
      }
      const serverErrors = splitServerErrors(error, BLOCK_FIELDS);
      for (const [field, message] of serverErrors.fields) {
        setError(field, { type: 'server', message });
      }
      setFormMessage(serverErrors.formMessage);
    }
  });

  return (
    <form
      noValidate
      aria-labelledby={`${id}-title`}
      className="grid gap-5 rounded-xl border bg-card p-4 shadow-sm sm:p-6"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
        Novo bloqueio
      </h2>
      <FormAlert message={formMessage} />
      <ConflictAlert conflicts={conflicts} />
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Início" error={errors.startTime?.message}>
          {(control) => <Input {...control} {...register('startTime')} type="time" />}
        </FormField>
        <FormField label="Fim" error={errors.endTime?.message}>
          {(control) => <Input {...control} {...register('endTime')} type="time" />}
        </FormField>
      </div>
      <fieldset
        className="grid gap-2"
        aria-describedby={errors.weekdays === undefined ? undefined : `${id}-weekdays-error`}
      >
        <legend className="mb-2 text-sm font-medium">Dias da semana</legend>
        <div className="flex flex-wrap gap-1.5">
          {ALL_WEEKDAYS.map((weekday) => {
            const selected = selectedWeekdays.includes(weekday);
            return (
              <button
                key={weekday}
                type="button"
                aria-label={nameOfWeekday(weekday)}
                aria-pressed={selected}
                className={cn(
                  'flex size-11 items-center justify-center rounded-full border text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:size-10',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30',
                )}
                onClick={() => {
                  toggleWeekday(weekday);
                }}
              >
                {weekdayInitial(weekday)}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {
              chooseWeekdays(WORKDAYS);
            }}
          >
            Dias úteis
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => {
              chooseWeekdays(ALL_WEEKDAYS);
            }}
          >
            Todos
          </Button>
        </div>
        {errors.weekdays?.message === undefined ? null : (
          <p id={`${id}-weekdays-error`} className="text-sm text-destructive">
            {errors.weekdays.message}
          </p>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="A partir de" error={errors.startsOn?.message}>
          {(control) => <Input {...control} {...register('startsOn')} type="date" />}
        </FormField>
        <FormField label="Até" error={errors.endsOn?.message}>
          {(control) => (
            <Input
              {...control}
              {...register('endsOn', { setValueAs: emptyAsUndefined, disabled: hasNoEndDate })}
              type="date"
            />
          )}
        </FormField>
      </div>
      <div className="flex items-center gap-2">
        <input
          id={`${id}-no-end`}
          type="checkbox"
          className="size-5 accent-primary"
          checked={hasNoEndDate}
          onChange={(event) => {
            setHasNoEndDate(event.target.checked);
          }}
        />
        <Label htmlFor={`${id}-no-end`}>Sem data de término</Label>
      </div>
      <FormField label="Motivo (opcional)" error={errors.reason?.message}>
        {(control) => (
          <Textarea
            {...control}
            {...register('reason')}
            maxLength={BLOCK_REASON_MAX_LENGTH}
            placeholder="Ex.: almoço, reunião, curso"
          />
        )}
      </FormField>
      <Button
        type="submit"
        className="w-full sm:w-fit sm:justify-self-end"
        disabled={create.isPending}
      >
        {create.isPending ? (
          <>
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Criando…
          </>
        ) : (
          'Criar bloqueio'
        )}
      </Button>
    </form>
  );
}

function ConflictAlert({ conflicts }: { readonly conflicts: readonly ScheduleConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
      <CalendarX2 aria-hidden="true" />
      <AlertTitle className="line-clamp-none">
        O bloqueio coincide com agendamentos confirmados
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-0.5 pl-4">
          {conflicts.map((conflict) => (
            <li key={conflict.appointmentId}>
              {appointmentDayTitle(conflict, BUSINESS_TIME_ZONE)} às{' '}
              {formatTime(conflict.startsAt, BUSINESS_TIME_ZONE)} · {conflict.clientName}
            </li>
          ))}
        </ul>
        <p>
          Cancele esses agendamentos antes de criar o bloqueio.{' '}
          <Link to={PATHS.admin} className="font-medium underline underline-offset-4">
            Ir para agendamentos
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
