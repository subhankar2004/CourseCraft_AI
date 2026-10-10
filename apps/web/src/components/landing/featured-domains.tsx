import {
  CatalogUnavailable,
  DomainCards,
  DomainCardsSkeleton,
} from '@/components/catalog/domain-cards';
import { getDomains, UNAVAILABLE } from '@/lib/catalog';

export async function FeaturedDomains() {
  const domains = await getDomains();
  if (domains === UNAVAILABLE) return <CatalogUnavailable />;
  return <DomainCards domains={domains} />;
}

export { DomainCardsSkeleton as FeaturedDomainsSkeleton };
