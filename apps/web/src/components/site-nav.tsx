'use client';

import { MenuIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useMe } from '@/lib/auth/hooks';
import { cn } from '@/lib/utils';

function useNavItems() {
  const { data: user } = useMe();
  return [
    { href: '/domains', label: 'Domains' },
    ...(user ? [{ href: '/dashboard', label: 'Dashboard' }] : []),
    ...(user?.role === 'ADMIN' ? [{ href: '/admin', label: 'Admin' }] : []),
  ];
}

function isActive(pathname: string | null, href: string) {
  return pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
}

/*
 * Reading the URL suspends on routes with a dynamic param that isn't prerendered (e.g.
 * /admin/jobs/[id]) under Cache Components. The header therefore renders these navs inside
 * <Suspense>, with the same links and `pathname={null}` (no active item) as the fallback.
 */

/** Inline links on wider screens. */
export function DesktopNav() {
  return <DesktopNavLinks pathname={usePathname()} />;
}

export function DesktopNavLinks({ pathname }: { pathname: string | null }) {
  const items = useNavItems();
  return (
    <nav aria-label="Main" className="hidden items-center gap-5 text-sm sm:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? 'page' : undefined}
          className={cn(
            'text-muted-foreground transition-colors hover:text-foreground',
            isActive(pathname, item.href) && 'font-medium text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Slide-in menu on phones. */
export function MobileNav() {
  return <MobileNavMenu pathname={usePathname()} />;
}

export function MobileNavMenu({ pathname }: { pathname: string | null }) {
  const items = useNavItems();
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Open menu">
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>CourseCraft AI</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="grid gap-1 px-4">
          {[{ href: '/', label: 'Home' }, ...items].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={cn(
                'rounded-md px-3 py-2 text-sm hover:bg-accent',
                (item.href === '/' ? pathname === '/' : isActive(pathname, item.href)) &&
                  'bg-accent font-medium',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
