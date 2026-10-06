import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { logger as defaultLogger, type Logger } from '@/lib/logger';

import { ErrorFallback, type ErrorFallbackLayout } from './error-fallback';

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly scope: string;
  readonly layout?: ErrorFallbackLayout;
  readonly resetKeys?: readonly unknown[];
  readonly logger?: Logger;
}

export function AppErrorBoundary({
  children,
  scope,
  layout = 'section',
  resetKeys = [],
  logger = defaultLogger,
}: AppErrorBoundaryProps) {
  return (
    <ErrorBoundary
      resetKeys={[...resetKeys]}
      onError={(error, info) => {
        logger.error('Render error', { scope, error, componentStack: info.componentStack });
      }}
      fallbackRender={({ resetErrorBoundary }) => (
        <ErrorFallback layout={layout} onRetry={resetErrorBoundary} />
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
