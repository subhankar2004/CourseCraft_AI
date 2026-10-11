import { redirect } from 'next/navigation';

/** The admin area opens on the course list. */
export default function AdminPage() {
  redirect('/admin/courses');
}
