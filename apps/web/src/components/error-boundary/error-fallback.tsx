import { RotateCcw, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ErrorFallbackLayout = 'screen' | 'section';

interface ErrorFallbackProps {
  readonly onRetry: () => void;
  readonly layout?: ErrorFallbackLayout;
}

export function ErrorFallback({ onRetry, layout = 'section' }: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        layout === 'screen' ? 'min-h-dvh py-16' : 'py-16 sm:py-24',
      )}
    >
      <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlert className="size-7" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold sm:text-xl">Algo deu errado</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground sm:text-base">
        Não foi possível exibir esta parte da página. Tente novamente; se o problema continuar,
        recarregue a página.
      </p>
      <Button className="mt-6" onClick={onRetry}>
        <RotateCcw aria-hidden="true" />
        Tentar novamente
      </Button>
    </div>
  );
}
