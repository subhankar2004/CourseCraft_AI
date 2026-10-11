import { formatTimestamp } from '@coursecraft/shared';
import { tableOfContents } from '@/lib/notes/headings';
import { cn } from '@/lib/utils';

/** "On this page": the notes' headings, linking to the ids the renderer gives them. */
export function NotesToc({ markdown, className }: { markdown: string; className?: string }) {
  const entries = tableOfContents(markdown);
  if (entries.length === 0) return null;
  return (
    <nav aria-label="On this page" className={cn('text-sm', className)}>
      <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        On this page
      </p>
      <ol className="grid gap-1">
        {entries.map((entry) => (
          <li key={entry.id} className={cn(entry.level === 3 && 'pl-3')}>
            <a
              href={`#${entry.id}`}
              className="flex items-baseline justify-between gap-2 text-muted-foreground hover:text-foreground"
            >
              <span>{entry.text}</span>
              {entry.seconds !== null && (
                <span className="shrink-0 text-xs tabular-nums">
                  {formatTimestamp(entry.seconds)}
                </span>
              )}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
