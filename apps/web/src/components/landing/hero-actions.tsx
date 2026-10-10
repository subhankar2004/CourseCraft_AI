'use client';

import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useMe } from '@/lib/auth/hooks';

/** Signed-out visitors are invited to sign up; signed-in users go straight back to learning. */
export function HeroActions() {
  const { data: user } = useMe();
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {user ? (
        <Button asChild size="lg">
          <Link href="/dashboard">
            Continue learning <ArrowRightIcon />
          </Link>
        </Button>
      ) : (
        <Button asChild size="lg">
          <Link href="/register">
            Start learning free <ArrowRightIcon />
          </Link>
        </Button>
      )}
      <Button asChild size="lg" variant="outline">
        <Link href="/domains">Browse domains</Link>
      </Button>
    </div>
  );
}
