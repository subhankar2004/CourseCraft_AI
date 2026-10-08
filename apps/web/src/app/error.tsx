'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
      <p className="mt-3 text-muted-foreground">
        An unexpected error occurred. You can try again, or come back later.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}
      <Button className="mt-8" onClick={() => retry()}>
        Try again
      </Button>
    </section>
  );
}
