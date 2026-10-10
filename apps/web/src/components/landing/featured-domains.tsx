import { ArrowRightIcon, LibraryIcon } from 'lucide-react';
import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getFeaturedDomains } from '@/lib/catalog';

const courseLabel = (n: number) =>
  n === 0 ? 'Courses coming soon' : `${n} course${n === 1 ? '' : 's'}`;

export async function FeaturedDomains() {
  const domains = await getFeaturedDomains();

  if (!domains?.length) {
    return (
      <p className="text-muted-foreground">
        The catalog is loading.{' '}
        <Link href="/domains" className="underline">
          Browse all domains
        </Link>
        .
      </p>
    );
  }

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
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </CardTitle>
                {domain.description && <CardDescription>{domain.description}</CardDescription>}
                <p className="text-xs font-medium text-muted-foreground">
                  {courseLabel(domain.courseCount)}
                </p>
              </CardHeader>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function FeaturedDomainsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading domains">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}
