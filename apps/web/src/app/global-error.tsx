'use client'; // Error boundaries must be Client Components

import { THEME_INIT_SCRIPT } from '@/lib/theme-script';
import './globals.css';

// Replaces the root layout when it fails, so it renders its own document, styles and theme.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
        <title>Something went wrong · CourseCraft AI</title>
        <h1 className="text-3xl font-bold tracking-tight">Something went wrong</h1>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
        )}
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => retry()}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
