import type { CourseStatus } from '@coursecraft/shared';
import { STATUS_LABELS } from '@/lib/admin/courses';
import { cn } from '@/lib/utils';

const STYLES: Record<CourseStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  GENERATING: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  FAILED: 'bg-destructive/15 text-destructive',
};

/** Course status as a coloured pill; the word is always shown (colour is never the only cue). */
export function StatusBadge({ status }: { status: CourseStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
