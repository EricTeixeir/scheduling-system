import { CalendarPlus } from 'lucide-react';

import { ComingSoon } from '@/components/states/coming-soon';

export function BookPage() {
  return (
    <ComingSoon
      icon={CalendarPlus}
      title="Agendar horário"
      description="Em breve você poderá escolher o dia e o horário que preferir e confirmar seu agendamento aqui."
    />
  );
}
