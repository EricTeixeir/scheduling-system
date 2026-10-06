import { SearchX } from 'lucide-react';
import { Link } from 'react-router';

import { StatusMessage } from '@/components/states/status-message';
import { Button } from '@/components/ui/button';

import { PATHS } from '../navigation';

export function NotFoundPage() {
  return (
    <div className="px-4">
      <StatusMessage
        icon={SearchX}
        badge="Erro 404"
        title="Página não encontrada"
        description="O endereço acessado não existe ou foi movido."
        action={
          <Button asChild variant="outline">
            <Link to={PATHS.home}>Voltar ao início</Link>
          </Button>
        }
      />
    </div>
  );
}
