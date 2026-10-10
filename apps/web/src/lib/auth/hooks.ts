'use client';

import { type LoginInput, type RegisterInput, type User, userSchema } from '@coursecraft/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

/** The signed-in user, or `null` when signed out. Shared by every component through the cache. */
export function useMe() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async (): Promise<User | null> => {
      try {
        return await api('auth/me', { schema: userSchema });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api('auth/login', { method: 'POST', json: input, schema: userSchema }),
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api('auth/register', { method: 'POST', json: input, schema: userSchema }),
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api('auth/logout', { method: 'POST' }),
    onSettled: () => {
      // Drop every cached response that may belong to the previous user.
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
      router.replace('/');
      router.refresh();
    },
  });
}
