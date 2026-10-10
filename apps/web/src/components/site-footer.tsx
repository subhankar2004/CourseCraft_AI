import { GraduationCapIcon } from 'lucide-react';
import Link from 'next/link';
import { ApiStatus } from '@/components/api-status';

const REPO = 'https://github.com/subhankar2004/CourseCraft_AI';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-3">
        <div>
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <GraduationCapIcon className="size-5" aria-hidden />
            CourseCraft AI
          </Link>
          <p className="mt-2 text-muted-foreground">
            Structured courses from free lectures, with AI study notes and a course-aware assistant.
          </p>
        </div>
        <div className="text-muted-foreground">
          <p className="font-medium text-foreground">Academic project</p>
          <p className="mt-2">B.Tech minor project, Dept. of Computer Science &amp; Engineering</p>
          <p>Veer Surendra Sai University of Technology, Burla</p>
          <p className="mt-2">Supervisor: Dr. Sucheta Panda</p>
        </div>
        <div className="text-muted-foreground">
          <p className="font-medium text-foreground">Project</p>
          <ul className="mt-2 grid gap-1">
            <li>
              <Link href="/domains" className="hover:text-foreground">
                Browse domains
              </Link>
            </li>
            <li>
              <a href={REPO} className="hover:text-foreground" target="_blank" rel="noreferrer">
                Source code (GitHub)
              </a>
            </li>
            <li>
              <a
                href={`${REPO}/blob/main/docs/report/CourseCraftAI.pdf`}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                Project report (PDF)
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 CourseCraft AI · Apache License 2.0</p>
          <ApiStatus />
        </div>
      </div>
    </footer>
  );
}
