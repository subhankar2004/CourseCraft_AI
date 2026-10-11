'use client';

import { BookOpenIcon, FolderTreeIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  // Courses covers the list and each review page, but not Generate (its own item).
  {
    href: '/admin/courses',
    label: 'Courses',
    icon: BookOpenIcon,
    active: (p: string) => p.startsWith('/admin/courses') && p !== '/admin/courses/new',
  },
  {
    href: '/admin/courses/new',
    label: 'Generate',
    icon: SparklesIcon,
    active: (p: string) => p === '/admin/courses/new' || p.startsWith('/admin/jobs/'),
  },
  {
    href: '/admin/domains',
    label: 'Domains',
    icon: FolderTreeIcon,
    active: (p: string) => p.startsWith('/admin/domains'),
  },
] as const;

/**
 * Admin navigation: a column on wide screens, a scrollable row on phones. Reading the URL
 * suspends on routes with a dynamic param (e.g. /admin/jobs/[id]) under Cache Components, so the
 * layout wraps this in <Suspense> with `<AdminSidebarLinks pathname={null} />` as the fallback.
 */
export function AdminSidebar() {
  return <AdminSidebarLinks pathname={usePathname()} />;
}

/** The links themselves; `pathname: null` renders them without an active item. */
export function AdminSidebarLinks({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Admin" className="md:w-52 md:shrink-0">
      <p className="mb-2 hidden px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase md:block">
        Admin
      </p>
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {ITEMS.map(({ href, label, icon: Icon, active: isActive }) => {
          const active = pathname !== null && isActive(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  active && 'bg-muted font-medium text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
