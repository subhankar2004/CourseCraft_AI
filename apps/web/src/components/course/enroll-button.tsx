'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/auth/hooks';

/** Placeholder until enrollment lands in #33: signed-out users are sent to sign in first. */
export function EnrollButton({ courseSlug }: { courseSlug: string }) {
  const { data: user, isPending } = useMe();
  if (isPending) return <Skeleton className="h-10 w-40" />;
  if (!user) {
    return (
      <Button asChild size="lg">
        <Link href={`/login?next=${encodeURIComponent(`/courses/${courseSlug}`)}`}>
          Sign in to enroll
        </Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Button size="lg" disabled>
        Enroll
      </Button>
      <span className="text-xs text-muted-foreground">Enrollment opens soon.</span>
    </div>
  );
}
