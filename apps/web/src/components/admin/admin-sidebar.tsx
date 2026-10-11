'use client';

import { BookOpenIcon, FolderTreeIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin/courses', label: 'Courses', icon: BookOpenIcon },
  { href: '/admin/domains', label: 'Domains', icon: FolderTreeIcon },
] as const;

/** Admin navigation: a column on wide screens, a scrollable row on phones. */
export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="md:w-52 md:shrink-0">
      <p className="mb-2 hidden px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase md:block">
        Admin
      </p>
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
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
        <li>
          {/* The generate form arrives in #30 (/admin/courses/new); the API already works. */}
          <span
            aria-disabled="true"
            className="flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted-foreground/60"
          >
            <SparklesIcon className="size-4" aria-hidden />
            Generate
            <span className="rounded bg-muted px-1.5 text-[0.65rem] tracking-wide uppercase">
              soon
            </span>
          </span>
        </li>
      </ul>
    </nav>
  );
}
