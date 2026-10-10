import type { Metadata } from 'next';
import { SignedInGreeting } from '@/components/auth/signed-in-greeting';

export const metadata: Metadata = { title: 'Admin' };

export default function AdminPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <SignedInGreeting area="admin area" />
    </section>
  );
}
