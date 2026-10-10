import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import { RegisterForm } from '@/components/auth/register-form';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Create account' };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Free, structured courses built from the best YouTube lectures."
    >
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
