'use client';

import { PASSWORD_MIN_LENGTH, type RegisterInput, registerSchema } from '@coursecraft/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { useRegister } from '@/lib/auth/hooks';
import { safeNextPath } from '@/lib/auth/redirect';
import { applyApiError } from './form-errors';
import { FormField } from './form-field';

export function RegisterForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next'));
  const registerUser = useRegister();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await registerUser.mutateAsync(values);
      router.replace(next);
    } catch (error) {
      applyApiError(error, ['name', 'email', 'password'], setError);
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
        id="name"
        label="Name"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
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
        autoComplete="new-password"
        placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
