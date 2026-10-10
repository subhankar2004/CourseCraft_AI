import type { Domain } from '@coursecraft/shared';
import { ArrowRightIcon, LibraryIcon } from 'lucide-react';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export const courseCountLabel = (n: number) =>
  n === 0 ? 'Courses coming soon' : `${n} course${n === 1 ? '' : 's'}`;

export function DomainCards({ domains }: { domains: Domain[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {domains.map((domain) => (
        <li key={domain.id}>
          <Link
            href={`/domains/${domain.slug}`}
            className="group block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardHeader>
                <LibraryIcon className="size-5 text-primary" aria-hidden />
                <CardTitle className="flex items-center justify-between gap-2">
                  {domain.name}
                  <ArrowRightIcon
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </CardTitle>
                {domain.description && <CardDescription>{domain.description}</CardDescription>}
                <p className="text-xs font-medium text-muted-foreground">
                  {courseCountLabel(domain.courseCount)}
                </p>
              </CardHeader>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DomainCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading domains">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

export function CatalogUnavailable() {
  return (
    <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
      The catalog is temporarily unavailable. Please try again in a moment.
    </p>
  );
}
