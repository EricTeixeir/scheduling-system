import type { LoginOutput, RegisterOutput } from '@scheduling/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { useApiClient } from '@/lib/api/api-client-context';

import { login, logout, register } from './auth-api';
import { endSession, startSession } from './session';

export function useLogin() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['auth', 'login'],
    mutationFn: (credentials: LoginOutput) => login(api, credentials),
    onSuccess: (user) => {
      startSession(queryClient, user);
    },
    meta: { handlesErrorInline: true },
  });
}

export function useRegister() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['auth', 'register'],
    mutationFn: (account: RegisterOutput) => register(api, account),
    onSuccess: (user) => {
      startSession(queryClient, user);
    },
    meta: { handlesErrorInline: true },
  });
}

export function useLogout() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationKey: ['auth', 'logout'],
    mutationFn: () => logout(api),
    // Even if the server call fails, this device must stop showing the previous user's data.
    onSettled: async () => {
      endSession(queryClient);
      await navigate('/login', { replace: true });
    },
  });
}
