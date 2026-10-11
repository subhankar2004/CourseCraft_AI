'use client';

import { type LessonDetail, readingTimeMinutes } from '@coursecraft/shared';
import { AlertTriangleIcon, ArrowLeftIcon, SaveIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { NotesMarkdown } from '@/components/notes/notes-markdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useLessonPreview, useUpdateLesson } from '@/lib/admin/hooks';
import {
  anchorReport,
  type LessonForm,
  lessonEditBody,
  lessonToForm,
} from '@/lib/admin/lesson-edit';
import { ApiError } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

export function LessonEditor({ lessonId }: { lessonId: string }) {
  const { data: lesson, isPending, isError } = useLessonPreview(lessonId);
  if (isPending) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading lesson">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="rounded-lg border p-6 text-sm">
        Could not load this lesson.{' '}
        <Link href="/admin/courses" className="underline">
          Back to courses
        </Link>
      </p>
    );
  }
  // Re-mounted with fresh values after each save.
  return <Editor key={lesson.notesMarkdown + lesson.title} lesson={lesson} />;
}

function Editor({ lesson }: { lesson: LessonDetail }) {
  const router = useRouter();
  const update = useUpdateLesson(lesson);
  const [form, setForm] = useState<LessonForm>(() => lessonToForm(lesson));
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [errors, setErrors] = useState<string[]>([]);
  const set = (field: keyof LessonForm) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const body = lessonEditBody(lesson, form);
  const dirty = body !== null;
  const anchors = anchorReport(form.notes, lesson.video.durationSec);
  const reviewHref = `/admin/courses/${lesson.course.id}`;

  // Unsaved-changes guard for reloads, closing the tab and leaving the site.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const leave = () => {
    if (!dirty || window.confirm('Discard your unsaved changes?')) router.push(reviewHref);
  };

  const onSave = async () => {
    if (!body) return;
    setErrors([]);
    try {
      await update.mutateAsync(body);
      toast.success('Lesson saved');
    } catch (error) {
      setErrors(
        error instanceof ApiError
          ? ([] as string[]).concat(error.body.message).map((m) => m.replace(/^\w+: /, ''))
          : ['Could not save the lesson.'],
      );
    }
  };

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <button
            type="button"
            onClick={leave}
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <ArrowLeftIcon className="size-3.5" aria-hidden />
            {lesson.course.title}
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Edit lesson</h1>
          <p className="text-sm text-muted-foreground">
            {lesson.module.title} · video {formatDuration(lesson.video.durationSec)} · about{' '}
            {readingTimeMinutes(form.notes)} min read
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty || update.isPending}
            onClick={() => setForm(lessonToForm(lesson))}
          >
            Discard
          </Button>
          <Button
            size="sm"
            disabled={!dirty || anchors.invalid.length > 0 || update.isPending}
            onClick={() => void onSave()}
          >
            <SaveIcon aria-hidden />
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </header>

      {errors.length > 0 && (
        <ul role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="lesson-title">Title</Label>
          <Input
            id="lesson-title"
            value={form.title}
            onChange={(e) => set('title')(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="lesson-concepts">Key concepts (one per line)</Label>
          <Textarea
            id="lesson-concepts"
            rows={3}
            value={form.concepts}
            onChange={(e) => set('concepts')(e.target.value)}
            className="min-h-0"
          />
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label htmlFor="lesson-summary">Summary</Label>
          <Textarea
            id="lesson-summary"
            rows={2}
            value={form.summary}
            onChange={(e) => set('summary')(e.target.value)}
            className="min-h-0"
          />
        </div>
      </div>

      <section aria-label="Notes" className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="lesson-notes">Notes (Markdown)</Label>
          <div role="tablist" aria-label="Editor view" className="flex gap-1 md:hidden">
            {(['write', 'preview'] as const).map((t) => (
              <Button
                key={t}
                role="tab"
                aria-selected={tab === t}
                size="xs"
                variant={tab === t ? 'secondary' : 'ghost'}
                onClick={() => setTab(t)}
              >
                {t === 'write' ? 'Write' : 'Preview'}
              </Button>
            ))}
          </div>
        </div>
        <p
          className={cn(
            'text-xs',
            anchors.invalid.length ? 'text-destructive' : 'text-muted-foreground',
          )}
          aria-live="polite"
        >
          {anchors.invalid.length > 0 ? (
            <>
              <AlertTriangleIcon className="mr-1 inline size-3.5" aria-hidden />
              {anchors.invalid.join(', ')} {anchors.invalid.length === 1 ? 'is' : 'are'} after the
              end of the video ({anchors.videoEnd}).
            </>
          ) : (
            `${anchors.count} timestamp anchor${anchors.count === 1 ? '' : 's'} like [▶ 1:23], all within the video (${anchors.videoEnd}).`
          )}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Textarea
            id="lesson-notes"
            value={form.notes}
            onChange={(e) => set('notes')(e.target.value)}
            spellCheck
            className={cn(
              'min-h-[32rem] font-mono text-xs leading-relaxed md:text-xs',
              tab === 'preview' && 'hidden md:block',
            )}
          />
          <div
            aria-label="Preview"
            className={cn(
              'min-h-[32rem] overflow-y-auto rounded-lg border p-4',
              tab === 'write' && 'hidden md:block',
            )}
          >
            <NotesMarkdown markdown={form.notes} />
          </div>
        </div>
      </section>
    </div>
  );
}
