'use client';

import {
  type AdminCourseDetail,
  COURSE_LEVELS,
  type UpdateCourseInput,
  updateCourseSchema,
} from '@coursecraft/shared';
import {
  ExternalLinkIcon,
  InfoIcon,
  Loader2Icon,
  PencilIcon,
  RotateCcwIcon,
  SaveIcon,
  Trash2Icon,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { applyApiError } from '@/components/forms/form-errors';
import { FormField } from '@/components/forms/form-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useAdminCourse,
  useDeleteCourse,
  useDomains,
  useLessonPreview,
  useSaveOutline,
  useSetPublished,
  useUpdateCourse,
} from '@/lib/admin/hooks';
import {
  draftFrom,
  type DraftOutline,
  outlineChanged,
  outlineProblems,
  toPayload,
} from '@/lib/admin/outline';
import { ApiError } from '@/lib/api';
import { formatDuration, plural } from '@/lib/format';
import { OutlineEditor } from './outline-editor';
import { StatusBadge } from './status-badge';

export function CourseReview({ courseId }: { courseId: string }) {
  const { data: course, isPending, isError, error, refetch } = useAdminCourse(courseId);

  if (isPending) {
    return (
      <div className="grid gap-4" aria-busy="true" aria-label="Loading course">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError) {
    const missing = error instanceof ApiError && error.status === 404;
    return (
      <div role="alert" className="rounded-lg border p-6 text-sm">
        <p>
          {missing
            ? 'This course does not exist (it may have been deleted).'
            : 'Could not load the course.'}
        </p>
        <div className="mt-3 flex gap-2">
          {!missing && (
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/courses">Back to courses</Link>
          </Button>
        </div>
      </div>
    );
  }
  // Keyed by `updatedAt`: a saved change re-creates the editor with the new outline.
  return <Review key={course.updatedAt} course={course} />;
}

function Review({ course }: { course: AdminCourseDetail }) {
  const saved = draftFrom(course);
  const [draft, setDraft] = useState<DraftOutline>(saved);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'details' | 'delete' | null>(null);
  const saveOutline = useSaveOutline(course);
  const setPublished = useSetPublished(course);

  const generating = course.status === 'GENERATING';
  const dirty = outlineChanged(saved, draft);
  const problems = outlineProblems(draft);
  const lessons = new Map(course.modules.flatMap((m) => m.lessons.map((l) => [l.id, l] as const)));
  const totalSec = course.modules
    .flatMap((m) => m.lessons)
    .reduce((s, l) => s + l.videoDurationSec, 0);

  const onSave = async () => {
    try {
      await saveOutline.mutateAsync(toPayload(draft));
      toast.success('Outline saved');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not save the outline');
    }
  };

  const onPublish = async (publish: boolean) => {
    try {
      await setPublished.mutateAsync(publish);
      toast.success(publish ? 'Published: the course is now in the public catalog' : 'Unpublished');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not change the status');
    }
  };

  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/courses" className="hover:underline">
            Courses
          </Link>{' '}
          / {course.domain.name}
        </p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={course.status} />
              {course.level ?? 'No level'} · {plural(course.moduleCount, 'module')},{' '}
              {plural(course.lessonCount, 'lesson')} · {formatDuration(totalSec)} of video
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {course.status === 'PUBLISHED' && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/courses/${course.slug}`} target="_blank">
                  <ExternalLinkIcon aria-hidden />
                  Public page
                </Link>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={generating}
              onClick={() => setDialog('details')}
            >
              <PencilIcon aria-hidden />
              Edit details
            </Button>
            {course.status === 'PUBLISHED' ? (
              <Button
                variant="outline"
                size="sm"
                disabled={setPublished.isPending}
                onClick={() => void onPublish(false)}
              >
                Unpublish
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={
                  generating ||
                  course.status === 'FAILED' ||
                  dirty ||
                  course.lessonCount === 0 ||
                  setPublished.isPending
                }
                title={dirty ? 'Save or discard the outline changes first' : undefined}
                onClick={() => void onPublish(true)}
              >
                Publish
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete course"
              disabled={generating}
              onClick={() => setDialog('delete')}
            >
              <Trash2Icon />
            </Button>
          </div>
        </div>
        {course.description && <p className="max-w-3xl text-sm">{course.description}</p>}
      </header>

      {generating && course.latestJob && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-sky-500/10 p-3 text-sm">
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
          This course is still being generated; it can be reviewed when its job finishes.
          <Link href={`/admin/jobs/${course.latestJob.id}`} className="underline">
            View progress
          </Link>
        </p>
      )}

      {course.outlineRepairs.length > 0 && (
        <details className="rounded-lg border bg-muted/30 p-3 text-sm">
          <summary className="flex cursor-pointer items-center gap-2">
            <InfoIcon className="size-4 text-muted-foreground" aria-hidden />
            The AI’s outline needed {plural(course.outlineRepairs.length, 'correction')}; check the
            module structure below.
          </summary>
          <ul className="mt-2 list-disc pl-8 text-muted-foreground">
            {course.outlineRepairs.map((repair) => (
              <li key={repair}>{repair}</li>
            ))}
          </ul>
        </details>
      )}

      <section aria-labelledby="outline-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="outline-heading" className="text-lg font-semibold">
            Outline
          </h2>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saveOutline.isPending}
              onClick={() => setDraft(saved)}
            >
              <RotateCcwIcon aria-hidden />
              Discard
            </Button>
            <Button
              size="sm"
              disabled={!dirty || problems.length > 0 || saveOutline.isPending}
              onClick={() => void onSave()}
            >
              <SaveIcon aria-hidden />
              {saveOutline.isPending ? 'Saving…' : 'Save outline'}
            </Button>
          </div>
        </div>
        {problems.length > 0 && dirty && (
          <p role="alert" className="text-sm text-destructive">
            {problems.join('. ')}.
          </p>
        )}
        {course.modules.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No lessons yet.
          </p>
        ) : (
          <OutlineEditor
            draft={draft}
            onChange={setDraft}
            lessons={lessons}
            disabled={generating || saveOutline.isPending}
            onPreview={setPreviewId}
          />
        )}
      </section>

      <LessonPreview lessonId={previewId} onClose={() => setPreviewId(null)} />
      <Dialog open={dialog === 'details'} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === 'details' && <DetailsDialog course={course} onDone={() => setDialog(null)} />}
      </Dialog>
      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        {dialog === 'delete' && <DeleteDialog course={course} onCancel={() => setDialog(null)} />}
      </Dialog>
    </div>
  );
}

type DetailsForm = {
  title: string;
  description: string;
  level: string;
  domainId: string;
  slug: string;
};

function DetailsDialog({ course, onDone }: { course: AdminCourseDetail; onDone: () => void }) {
  const domains = useDomains();
  const update = useUpdateCourse(course);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DetailsForm>({
    defaultValues: {
      title: course.title,
      description: course.description ?? '',
      level: course.level ?? '',
      domainId: course.domain.id,
      slug: course.slug,
    },
  });

  const onSubmit = handleSubmit(async (form) => {
    const body: UpdateCourseInput = {};
    if (form.title.trim() !== course.title) body.title = form.title.trim();
    const description = form.description.trim() || null;
    if (description !== course.description) body.description = description;
    const level = (form.level || null) as UpdateCourseInput['level'];
    if (level !== course.level) body.level = level;
    if (form.domainId !== course.domain.id) body.domainId = form.domainId;
    if (form.slug.trim() && form.slug.trim() !== course.slug) body.slug = form.slug.trim();
    if (Object.keys(body).length === 0) return onDone();
    const parsed = updateCourseSchema.safeParse(body);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setError((issue.path[0] as keyof DetailsForm) ?? 'root', { message: issue.message });
      }
      return;
    }
    try {
      await update.mutateAsync(parsed.data);
      toast.success('Course details saved');
      onDone();
    } catch (error) {
      applyApiError(error, ['title', 'description', 'domainId', 'slug'], setError);
    }
  });

  return (
    <DialogContent className="sm:max-w-lg">
      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Course details</DialogTitle>
          <DialogDescription>Changing the slug changes the course’s public URL.</DialogDescription>
        </DialogHeader>
        {errors.root && (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errors.root.message}
          </p>
        )}
        <FormField
          id="course-title"
          label="Title"
          error={errors.title?.message}
          {...register('title')}
        />
        <div className="grid gap-2">
          <Label htmlFor="course-description">Description</Label>
          <Textarea id="course-description" rows={4} {...register('description')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="course-level">Level</Label>
            <NativeSelect id="course-level" {...register('level')}>
              <option value="">Not set</option>
              {COURSE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="course-domain">Domain</Label>
            <NativeSelect
              id="course-domain"
              aria-invalid={Boolean(errors.domainId)}
              {...register('domainId')}
            >
              {(domains.data ?? [course.domain]).map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </NativeSelect>
            {errors.domainId && (
              <p className="text-sm text-destructive">{errors.domainId.message}</p>
            )}
          </div>
        </div>
        <FormField
          id="course-slug"
          label="Slug"
          className="font-mono"
          error={errors.slug?.message}
          {...register('slug')}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Irreversible, so the title must be typed to confirm. */
function DeleteDialog({ course, onCancel }: { course: AdminCourseDetail; onCancel: () => void }) {
  const router = useRouter();
  const remove = useDeleteCourse(course);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setError(null);
    try {
      await remove.mutateAsync();
      toast.success(`“${course.title}” deleted`);
      router.push('/admin/courses');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete the course.');
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete this course?</DialogTitle>
        <DialogDescription>
          Its modules, lessons, notes, chatbot data, enrollments and progress are removed for good.
          The source videos’ transcripts stay cached.
        </DialogDescription>
      </DialogHeader>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor="confirm-title">
          Type <strong>{course.title}</strong> to confirm
        </Label>
        <Input
          id="confirm-title"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          disabled={typed !== course.title || remove.isPending}
          onClick={() => void onDelete()}
        >
          {remove.isPending ? 'Deleting…' : 'Delete course'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** The lesson as students will see it (the formatted notes renderer arrives in #34). */
function LessonPreview({ lessonId, onClose }: { lessonId: string | null; onClose: () => void }) {
  const { data: lesson, isPending } = useLessonPreview(lessonId);
  return (
    <Sheet open={lessonId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{lesson?.title ?? 'Lesson'}</SheetTitle>
          <SheetDescription>
            {lesson ? `${lesson.module.title} · lesson preview` : 'Loading…'}
          </SheetDescription>
        </SheetHeader>
        {isPending || !lesson ? (
          <div className="grid gap-3 px-4">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="grid gap-4 px-4 pb-6 text-sm">
            <a
              href={`https://www.youtube.com/watch?v=${lesson.video.youtubeId}`}
              target="_blank"
              rel="noreferrer"
              className="group grid gap-2"
            >
              {lesson.video.thumbnailUrl && (
                <Image
                  src={lesson.video.thumbnailUrl}
                  alt=""
                  width={480}
                  height={360}
                  className="aspect-video w-full rounded-lg object-cover"
                />
              )}
              <span className="text-xs text-muted-foreground group-hover:underline">
                {lesson.video.title} · {formatDuration(lesson.video.durationSec)} · opens YouTube
              </span>
            </a>
            {lesson.summary && <p>{lesson.summary}</p>}
            {lesson.keyConcepts.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Key concepts">
                {lesson.keyConcepts.map((concept) => (
                  <li key={concept} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {concept}
                  </li>
                ))}
              </ul>
            )}
            <pre className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
              {lesson.notesMarkdown}
            </pre>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
