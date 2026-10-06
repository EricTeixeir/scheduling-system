import { useEffect } from 'react';
import { useRouteError } from 'react-router';

import { logger } from '@/lib/logger';

import { ErrorFallback } from './error-fallback';

export function RouterErrorFallback() {
  const error = useRouteError();

  useEffect(() => {
    logger.error('Router error', { error });
  }, [error]);

  return (
    <ErrorFallback
      layout="screen"
      onRetry={() => {
        window.location.reload();
      }}
    />
  );
}
