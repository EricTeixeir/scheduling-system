import { createContext, use } from 'react';

import type { ApiClient } from './http-client';

export const ApiClientContext = createContext<ApiClient | null>(null);

export function useApiClient(): ApiClient {
  const client = use(ApiClientContext);
  if (client === null) throw new Error('useApiClient must be used inside <ApiClientContext>.');
  return client;
}
