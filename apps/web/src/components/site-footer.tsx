import { ApiStatus } from '@/components/api-status';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          CourseCraft AI · B.Tech project, Dept. of CSE, VSSUT Burla · Supervisor: Dr. Sucheta Panda
        </p>
        <ApiStatus />
      </div>
    </footer>
  );
}
