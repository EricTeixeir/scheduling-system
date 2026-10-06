import type { User } from '@scheduling/shared';
import { hashKey, type QueryClient } from '@tanstack/react-query';

export const CURRENT_USER_QUERY_KEY = ['auth', 'me'] as const;

export function startSession(queryClient: QueryClient, user: User): void {
  queryClient.setQueryData<User | null>(CURRENT_USER_QUERY_KEY, user);
}

export function endSession(queryClient: QueryClient): void {
  const currentUserHash = hashKey(CURRENT_USER_QUERY_KEY);
  queryClient.removeQueries({ predicate: (query) => query.queryHash !== currentUserHash });
  queryClient.setQueryData<User | null>(CURRENT_USER_QUERY_KEY, null);
}
