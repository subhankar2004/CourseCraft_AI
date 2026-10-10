import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Access denied', robots: { index: false } };

/** Shown (with HTTP 403) by proxy.ts when a signed-in non-admin opens /admin. */
export default function ForbiddenPage() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">403</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Access denied</h1>
      <p className="mt-3 text-muted-foreground">
        This area is for administrators. If you think you should have access, contact your course
        administrator.
      </p>
      <Button asChild className="mt-8">
        <Link href="/dashboard">Go to your dashboard</Link>
      </Button>
    </section>
  );
}
