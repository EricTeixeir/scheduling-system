import { userSchema, type LoginOutput, type RegisterOutput, type User } from '@scheduling/shared';

import { isApiError } from '@/lib/api/api-error';
import type { ApiClient } from '@/lib/api/http-client';

export async function fetchCurrentUser(api: ApiClient, signal?: AbortSignal): Promise<User | null> {
  try {
    return await api.request('/auth/me', { schema: userSchema, signal });
  } catch (error) {
    if (isApiError(error) && error.status === 401) return null;
    throw error;
  }
}

export function login(api: ApiClient, credentials: LoginOutput): Promise<User> {
  return api.request('/auth/login', { method: 'POST', body: credentials, schema: userSchema });
}

export function register(api: ApiClient, account: RegisterOutput): Promise<User> {
  return api.request('/auth/register', { method: 'POST', body: account, schema: userSchema });
}

export function logout(api: ApiClient): Promise<void> {
  return api.request('/auth/logout', { method: 'POST' });
}
