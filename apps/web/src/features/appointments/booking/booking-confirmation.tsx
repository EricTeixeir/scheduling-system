import { NOTES_MAX_LENGTH, type Slot } from '@scheduling/shared';
import { CalendarDays, Clock } from 'lucide-react';
import { useState } from 'react';

import { ConfirmSurface } from '@/components/confirm-surface';
import { FormField } from '@/components/form/form-field';
import { Textarea } from '@/components/ui/textarea';

import { appointmentDayTitle, appointmentTimeRange } from '../shared/appointment-format';

interface BookingConfirmationProps {
  readonly slot: Slot;
  readonly timeZone: string;
  readonly pending: boolean;
  readonly onConfirm: (notes: string) => void;
  readonly onDismiss: () => void;
}

export function BookingConfirmation({
  slot,
  timeZone,
  pending,
  onConfirm,
  onDismiss,
}: BookingConfirmationProps) {
  const [notes, setNotes] = useState('');

  return (
    <ConfirmSurface
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      title="Confirmar agendamento"
      description="Revise o dia e o horário antes de confirmar."
      confirmLabel="Confirmar agendamento"
      pendingLabel="Confirmando…"
      dismissLabel="Cancelar"
      pending={pending}
      onConfirm={() => {
        onConfirm(notes);
      }}
    >
      <div className="grid gap-5 pb-2">
        <dl className="grid gap-3 rounded-lg border bg-accent/50 p-4 text-sm">
          <div className="flex items-center gap-3">
            <dt>
              <CalendarDays className="size-4 text-primary" aria-hidden="true" />
              <span className="sr-only">Dia</span>
            </dt>
            <dd className="font-medium">{appointmentDayTitle(slot, timeZone)}</dd>
          </div>
          <div className="flex items-center gap-3">
            <dt>
              <Clock className="size-4 text-primary" aria-hidden="true" />
              <span className="sr-only">Horário</span>
            </dt>
            <dd className="font-medium tabular-nums">{appointmentTimeRange(slot, timeZone)}</dd>
          </div>
        </dl>
        <FormField
          label="Observações (opcional)"
          hint={`${String(notes.length)}/${String(NOTES_MAX_LENGTH)} caracteres`}
        >
          {(control) => (
            <Textarea
              {...control}
              value={notes}
              maxLength={NOTES_MAX_LENGTH}
              rows={3}
              disabled={pending}
              placeholder="Algo que devemos saber antes do atendimento?"
              className="max-h-40"
              onChange={(event) => {
                setNotes(event.target.value);
              }}
            />
          )}
        </FormField>
      </div>
    </ConfirmSurface>
  );
}
