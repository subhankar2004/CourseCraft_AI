import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { CatalogUnavailable, courseCountLabel } from '@/components/catalog/domain-cards';
import { CourseBrowser } from '@/components/catalog/course-browser';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomain, getDomainSlugsForBuild, UNAVAILABLE } from '@/lib/catalog';

/**
 * Known domains are prerendered at build time. Any other slug gets the App Shell instantly and
 * fills in on demand (ISR with Cache Components + Partial Prefetching).
 */
export async function generateStaticParams() {
  const slugs = await getDomainSlugsForBuild();
  // No API at build time (e.g. CI): Cache Components needs at least one param. The placeholder
  // renders the not-found page; real domains are served through the App Shell on demand.
  return (slugs.length ? slugs : ['__placeholder__']).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps<'/domains/[slug]'>): Promise<Metadata> {
  const domain = await getDomain((await params).slug);
  if (!domain || domain === UNAVAILABLE) return { title: 'Domain' };
  return { title: domain.name, description: domain.description ?? undefined };
}

async function DomainContent({ params }: Pick<PageProps<'/domains/[slug]'>, 'params'>) {
  const domain = await getDomain((await params).slug);
  if (domain === null) notFound();
  if (domain === UNAVAILABLE) return <CatalogUnavailable />;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/domains" className="hover:text-foreground">
          Domains
        </Link>
        <span aria-hidden> / </span>
        <span aria-current="page" className="text-foreground">
          {domain.name}
        </span>
      </nav>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{domain.name}</h1>
      {domain.description && (
        <p className="mt-2 max-w-2xl text-muted-foreground">{domain.description}</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">{courseCountLabel(domain.courseCount)}</p>
      <div className="mt-8">
        {/* Reads ?q= and ?level= from the URL. */}
        <Suspense fallback={<CoursesSkeleton />}>
          <CourseBrowser courses={domain.courses} />
        </Suspense>
      </div>
    </>
  );
}

function CoursesSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading courses">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-72 rounded-xl" />
      ))}
    </div>
  );
}

export default function DomainPage({ params }: PageProps<'/domains/[slug]'>) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <Suspense
        fallback={
          <div className="grid gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-5 w-96 max-w-full" />
            <CoursesSkeleton />
          </div>
        }
      >
        <DomainContent params={params} />
      </Suspense>
    </section>
  );
}
