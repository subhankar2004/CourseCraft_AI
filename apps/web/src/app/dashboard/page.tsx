import type { Metadata } from 'next';
import { StudentDashboard } from '@/components/dashboard/student-dashboard';

export const metadata: Metadata = { title: 'Dashboard' };

/** Signed-in only (proxy.ts); the learner's data loads in the browser. */
export default function DashboardPage() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <StudentDashboard />
    </section>
  );
}
