'use client';

import { BookOpenIcon, FolderTreeIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin/courses', label: 'Courses', icon: BookOpenIcon, exact: true },
  { href: '/admin/courses/new', label: 'Generate', icon: SparklesIcon, exact: true },
  { href: '/admin/domains', label: 'Domains', icon: FolderTreeIcon, exact: false },
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
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          // "Courses" must not light up on /admin/courses/new, which has its own item.
          const active =
            pathname !== null && (pathname === href || (!exact && pathname.startsWith(`${href}/`)));
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
