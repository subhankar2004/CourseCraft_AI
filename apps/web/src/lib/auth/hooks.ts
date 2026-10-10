'use client';

import {
  type LoginInput,
  type RegisterInput,
  sessionSchema,
  type User,
  userSchema,
} from '@coursecraft/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { api } from '@/lib/api';

export const ME_QUERY_KEY = ['auth', 'me'] as const;

const subscribeNever = () => () => {};

/** `false` on the server and while hydrating, `true` afterwards (React's hydration-safe pattern). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}

/**
 * The signed-in user, or `null` when signed out. Shared by every component through the cache.
 *
 * Hydration-safe: the server never knows the session, so it renders the pending state. A
 * component inside a late-streamed <Suspense> boundary may hydrate after the session query has
 * already resolved; reporting `pending` until hydration completes keeps server and client HTML
 * identical (otherwise React throws a hydration mismatch).
 */
export function useMe() {
  const hydrated = useHydrated();
  const query = useMeQuery();
  return hydrated ? query : { ...query, data: undefined, isPending: true as const };
}

function useMeQuery() {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    // /auth/session answers 200 with `user: null` when signed out (no 401 noise in the console).
    queryFn: async (): Promise<User | null> =>
      (await api('auth/session', { schema: sessionSchema })).user,
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
