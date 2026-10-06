import { ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';

import { PATHS } from '@/app/navigation';
import { StatusMessage } from '@/components/states/status-message';
import { Button } from '@/components/ui/button';

export function ForbiddenPage() {
  return (
    <StatusMessage
      icon={ShieldAlert}
      tone="destructive"
      badge="Erro 403"
      title="Acesso negado"
      description="Você não tem permissão para acessar esta página."
      action={
        <Button asChild variant="outline">
          <Link to={PATHS.home}>Voltar ao início</Link>
        </Button>
      }
    />
  );
}
