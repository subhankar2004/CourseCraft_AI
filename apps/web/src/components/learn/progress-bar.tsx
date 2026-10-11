import { cn } from '@/lib/utils';

/** A course's completion (WAI-ARIA progressbar), shared by the lesson sidebar and the dashboard. */
export function ProgressBar({
  percent,
  label,
  className,
}: {
  percent: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="h-full bg-emerald-600 transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}
