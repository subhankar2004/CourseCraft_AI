import type { ModuleOutline } from '@coursecraft/shared';
import { ClockIcon, PlayCircleIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { plural } from '@/lib/format';

/** Modules as an accordion (first one open), each listing its lessons in order. */
export function CourseOutline({ modules }: { modules: ModuleOutline[] }) {
  if (modules.length === 0) {
    return <p className="text-muted-foreground">This course has no lessons yet.</p>;
  }
  return (
    <Accordion type="multiple" defaultValue={[modules[0]!.id]} className="rounded-xl border">
      {modules.map((module) => (
        <AccordionItem key={module.id} value={module.id} className="px-4">
          <AccordionTrigger className="text-base">
            <span className="flex flex-col gap-1 text-left">
              <span>
                <span className="text-muted-foreground">Module {module.order}: </span>
                {module.title}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {plural(module.lessons.length, 'lesson')}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {module.summary && <p className="mb-3 text-muted-foreground">{module.summary}</p>}
            <ol className="grid gap-1">
              {module.lessons.map((lesson) => (
                <li key={lesson.id} className="flex items-start gap-3 rounded-md px-2 py-2">
                  <PlayCircleIcon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="flex-1">
                    <span className="text-muted-foreground">{lesson.order}. </span>
                    {lesson.title}
                  </span>
                  {lesson.readingTimeMin !== null && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <ClockIcon className="size-3" aria-hidden />
                      {lesson.readingTimeMin} min read
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
