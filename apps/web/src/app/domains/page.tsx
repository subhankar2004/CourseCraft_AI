import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  CatalogUnavailable,
  DomainCards,
  DomainCardsSkeleton,
} from '@/components/catalog/domain-cards';
import { getDomains, UNAVAILABLE } from '@/lib/catalog';

export const metadata: Metadata = {
  title: 'Domains',
  description: 'Browse computer-science domains and their structured courses.',
};

async function AllDomains() {
  const domains = await getDomains();
  if (domains === UNAVAILABLE) return <CatalogUnavailable />;
  if (domains.length === 0) {
    return <p className="text-muted-foreground">No domains yet.</p>;
  }
  return <DomainCards domains={domains} />;
}

export default function DomainsPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Domains</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Pick a field to see its courses. Each course is organised into modules and lessons with
        study notes.
      </p>
      <div className="mt-8">
        <Suspense fallback={<DomainCardsSkeleton count={8} />}>
          <AllDomains />
        </Suspense>
      </div>
    </section>
  );
}
