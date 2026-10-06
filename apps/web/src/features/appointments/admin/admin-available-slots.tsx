import type { ClientSummary, Slot } from '@scheduling/shared';
import { useState } from 'react';
import { toast } from 'sonner';

import { isApiError } from '@/lib/api/api-error';
import { BUSINESS_TIME_ZONE } from '@/lib/time/business-time-zone';
import { useClock } from '@/lib/time/clock';
import { localDateOf } from '@/lib/time/local-date';

import { createAttemptKeys } from '../booking/attempt-keys';
import { SlotPicker } from '../booking/slot-picker';
import { appointmentWhen } from '../shared/appointment-format';
import { BookForClientConfirmation } from './book-for-client-confirmation';
import { useBookForClient } from './use-admin-appointments';

interface ChosenSlot {
  readonly slot: Slot;
  readonly timeZone: string;
}

function useBookForClientFlow(onShowScheduled: () => void) {
  const booking = useBookForClient();
  const [attemptKeys] = useState(() => createAttemptKeys(() => crypto.randomUUID()));
  const [chosen, setChosen] = useState<ChosenSlot | null>(null);

  const confirm = ({ slot, timeZone }: ChosenSlot, client: ClientSummary, notes: string) => {
    const request = { clientId: client.id, startsAt: slot.startsAt, notes };
    const idempotencyKey = attemptKeys.keyFor(JSON.stringify(request));
    booking.mutate(
      { ...request, idempotencyKey },
      {
        onSuccess: () => {
          setChosen(null);
          toast.success(`Agendado para ${client.name}`, {
            description: appointmentWhen(slot, timeZone),
            action: { label: 'Ver agendados', onClick: onShowScheduled },
          });
        },
        onError: (error) => {
          if (isApiError(error) && error.code === 'SLOT_TAKEN') setChosen(null);
        },
      },
    );
  };

  return {
    chosen,
    choose: (slot: Slot, timeZone: string) => {
      attemptKeys.reset();
      setChosen({ slot, timeZone });
    },
    confirm,
    dismiss: () => {
      setChosen(null);
    },
    pending: booking.isPending,
  };
}

interface AdminAvailableSlotsProps {
  readonly onShowScheduled: () => void;
}

export function AdminAvailableSlots({ onShowScheduled }: AdminAvailableSlotsProps) {
  const clock = useClock();
  const flow = useBookForClientFlow(onShowScheduled);
  const { chosen } = flow;

  return (
    <>
      <SlotPicker
        today={localDateOf(clock.now(), BUSINESS_TIME_ZONE)}
        selectedStartsAt={chosen?.slot.startsAt ?? null}
        onSelectSlot={flow.choose}
      />
      {chosen === null ? null : (
        <BookForClientConfirmation
          key={chosen.slot.startsAt}
          slot={chosen.slot}
          timeZone={chosen.timeZone}
          pending={flow.pending}
          onDismiss={flow.dismiss}
          onConfirm={(client, notes) => {
            flow.confirm(chosen, client, notes);
          }}
        />
      )}
    </>
  );
}
