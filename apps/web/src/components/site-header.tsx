import { GraduationCapIcon } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { DesktopNav, DesktopNavLinks, MobileNav, MobileNavMenu } from '@/components/site-nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-6">
        <Suspense fallback={<MobileNavMenu pathname={null} />}>
          <MobileNav />
        </Suspense>
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <GraduationCapIcon className="size-5" aria-hidden />
          CourseCraft AI
        </Link>
        <Suspense fallback={<DesktopNavLinks pathname={null} />}>
          <DesktopNav />
        </Suspense>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
