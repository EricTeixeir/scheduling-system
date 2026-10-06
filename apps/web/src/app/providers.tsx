import type { User } from '@scheduling/shared';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider, type createBrowserRouter } from 'react-router';
import { toast } from 'sonner';

import { Toaster } from '@/components/toaster';
import { CURRENT_USER_QUERY_KEY, endSession } from '@/features/auth/session';
import { ApiClientContext } from '@/lib/api/api-client-context';
import { createApiClient, type ApiClient } from '@/lib/api/http-client';
import { SESSION_EXPIRED_MESSAGE } from '@/lib/errors/messages';
import { createQueryClient } from '@/lib/query/query-client';
import { ThemeProvider } from '@/lib/theme/theme-provider';

export type AppRouter = ReturnType<typeof createBrowserRouter>;

interface AppProvidersProps {
  readonly router: AppRouter;
  readonly fetch?: typeof fetch;
}

function notifyError(message: string) {
  toast.error(message);
}

function createClients(fetchImpl: typeof fetch | undefined): {
  queryClient: QueryClient;
  apiClient: ApiClient;
} {
  const queryClient = createQueryClient({ notifyError });
  const apiClient = createApiClient({
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
    onSessionExpired: () => {
      const hadSession = queryClient.getQueryData<User | null>(CURRENT_USER_QUERY_KEY) != null;
      endSession(queryClient);
      if (hadSession) toast.warning(SESSION_EXPIRED_MESSAGE);
    },
  });
  return { queryClient, apiClient };
}

export function AppProviders({ router, fetch: fetchImpl }: AppProvidersProps) {
  const [{ queryClient, apiClient }] = useState(() => createClients(fetchImpl));

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ApiClientContext value={apiClient}>
          <RouterProvider router={router} />
          <Toaster />
        </ApiClientContext>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
