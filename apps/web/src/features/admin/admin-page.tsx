import { LayoutDashboard } from 'lucide-react';

import { ComingSoon } from '@/components/states/coming-soon';

export function AdminPage() {
  return (
    <ComingSoon
      icon={LayoutDashboard}
      title="Painel administrativo"
      description="Em breve você acompanhará a agenda do dia e atualizará o status dos atendimentos por aqui."
    />
  );
}
