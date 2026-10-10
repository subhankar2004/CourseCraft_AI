'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/auth/hooks';

/** Placeholder content for protected pages until #37 (dashboard) and #29 (admin) build them. */
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
