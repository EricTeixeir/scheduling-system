import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { isClientError, reportError } from '../errors/report-error';
import { messageFor } from '../errors/messages';
import { logger as defaultLogger, type Logger } from '../logger';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      readonly handlesErrorInline?: boolean;
    };
  }
}

export interface QueryClientDependencies {
  readonly notifyError: (message: string) => void;
  readonly logger?: Logger;
}

const MAX_QUERY_RETRIES = 2;

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return !isClientError(error) && failureCount < MAX_QUERY_RETRIES;
}

export function createQueryClient({
  notifyError,
  logger = defaultLogger,
}: QueryClientDependencies): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        reportError('Query failed', error, { queryKey: query.queryKey }, logger);
        const pageShowsItsOwnErrorState = query.state.data === undefined;
        if (!pageShowsItsOwnErrorState) notifyError(messageFor(error));
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        reportError(
          'Mutation failed',
          error,
          { mutationKey: mutation.options.mutationKey },
          logger,
        );
        if (mutation.meta?.handlesErrorInline !== true) notifyError(messageFor(error));
      },
    }),
    defaultOptions: {
      queries: { retry: shouldRetryQuery, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
