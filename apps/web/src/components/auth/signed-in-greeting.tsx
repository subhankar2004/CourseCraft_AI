'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/auth/hooks';

/** Placeholder content for the dashboard until #37 builds it. */
export function SignedInGreeting({ area }: { area: string }) {
  const { data: user, isPending } = useMe();
  if (isPending) return <Skeleton className="h-10 w-72" />;
  if (!user) return null;
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Welcome, {user.name}</h1>
      <p className="mt-2 text-muted-foreground">
        Signed in as {user.email} ({user.role.toLowerCase()}). The {area} is coming soon.
      </p>
    </div>
  );
}
