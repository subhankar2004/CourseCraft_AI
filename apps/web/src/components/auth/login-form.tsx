'use client';

import { type LoginInput, loginSchema } from '@coursecraft/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { useLogin } from '@/lib/auth/hooks';
import { safeNextPath } from '@/lib/auth/redirect';
import { applyApiError } from './form-errors';
import { FormField } from './form-field';

export function LoginForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const login = useLogin();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      router.replace(next);
    } catch (error) {
      applyApiError(error, ['email', 'password'], setError);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {errors.root && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.root.message}
        </p>
      )}
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href={`/register?next=${encodeURIComponent(next)}`} className="underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
