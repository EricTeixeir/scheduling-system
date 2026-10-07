import type { ClientSummary } from '@scheduling/shared';
import { useState } from 'react';

import { BookingConfirmation } from '../booking/booking-confirmation';
import type { ChosenSlot } from '../booking/chosen-slot';
import { ClientCombobox } from './client-combobox';

interface BookForClientConfirmationProps {
  readonly chosen: ChosenSlot;
  readonly pending: boolean;
  readonly onMinutesChange: (minutes: number) => void;
  readonly onConfirm: (client: ClientSummary, notes: string) => void;
  readonly onDismiss: () => void;
}

export function BookForClientConfirmation({
  chosen,
  pending,
  onMinutesChange,
  onConfirm,
  onDismiss,
}: BookForClientConfirmationProps) {
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [clientError, setClientError] = useState<string>();

  return (
    <BookingConfirmation
      chosen={chosen}
      pending={pending}
      onMinutesChange={onMinutesChange}
      onDismiss={onDismiss}
      title="Agendar para cliente"
      description="Escolha o cliente e revise o dia e o horário."
      onConfirm={(notes) => {
        if (client === null) setClientError('Escolha um cliente da lista.');
        else onConfirm(client, notes);
      }}
    >
      <ClientCombobox
        selected={client}
        error={clientError}
        disabled={pending}
        onSelect={(next) => {
          setClient(next);
          setClientError(undefined);
        }}
      />
    </BookingConfirmation>
  );
}
