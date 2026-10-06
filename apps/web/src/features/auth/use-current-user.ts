import { useQuery } from '@tanstack/react-query';

import { useApiClient } from '@/lib/api/api-client-context';

import { fetchCurrentUser } from './auth-api';
import { CURRENT_USER_QUERY_KEY } from './session';

const FIVE_MINUTES = 5 * 60 * 1000;

export function useCurrentUser() {
  const api = useApiClient();
  return useQuery({
    queryKey: CURRENT_USER_QUERY_KEY,
    queryFn: ({ signal }) => fetchCurrentUser(api, signal),
    staleTime: FIVE_MINUTES,
  });
}
