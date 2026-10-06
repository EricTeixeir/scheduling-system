import { CalendarCheck } from 'lucide-react';

import { ComingSoon } from '@/components/states/coming-soon';

export function MyAppointmentsPage() {
  return (
    <ComingSoon
      icon={CalendarCheck}
      title="Meus agendamentos"
      description="Em breve você verá aqui seus próximos horários e o histórico, e poderá cancelar quando precisar."
    />
  );
}
