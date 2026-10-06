import type { User } from '@scheduling/shared';
import { createContext, use } from 'react';

export const AuthenticatedUserContext = createContext<User | null>(null);

export function useAuthenticatedUser(): User {
  const user = use(AuthenticatedUserContext);
  if (user === null) throw new Error('useAuthenticatedUser must be used below <RequireAuth>.');
  return user;
}
