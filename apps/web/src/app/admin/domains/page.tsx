import type { Metadata } from 'next';
import { DomainsManager } from '@/components/admin/domains-manager';

export const metadata: Metadata = { title: 'Domains · Admin' };

export default function AdminDomainsPage() {
  return (
    <section className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Domains</h1>
      </header>
      <DomainsManager />
    </section>
  );
}
