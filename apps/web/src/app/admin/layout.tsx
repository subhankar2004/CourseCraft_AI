import { Suspense } from 'react';
import { AdminSidebar, AdminSidebarLinks } from '@/components/admin/admin-sidebar';

/**
 * Admin shell. proxy.ts already sends non-admins to /forbidden (optimistic), and every admin
 * API call is authorised by the API itself.
 */
export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:flex-row md:gap-10">
      <Suspense fallback={<AdminSidebarLinks pathname={null} />}>
        <AdminSidebar />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
