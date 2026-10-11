import type { Metadata } from 'next';
import { CoursesTable } from '@/components/admin/courses-table';

export const metadata: Metadata = { title: 'Courses · Admin' };

export default function AdminCoursesPage() {
  return (
    <section className="grid gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
        <p className="text-sm text-muted-foreground">
          Every course, whatever its status. Generated courses start as drafts.
        </p>
      </header>
      <CoursesTable />
    </section>
  );
}
