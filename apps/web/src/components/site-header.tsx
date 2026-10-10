import { GraduationCapIcon } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { UserMenu } from '@/components/user-menu';

// Navigation targets are built in later issues (#14 domains, #37 dashboard).
const navItems = [
  { href: '/domains', label: 'Domains' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <GraduationCapIcon className="size-5" aria-hidden />
          CourseCraft AI
        </Link>
        <nav aria-label="Main" className="hidden gap-4 text-sm text-muted-foreground sm:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
