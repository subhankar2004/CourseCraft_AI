'use client';

import type { LessonDetail } from '@coursecraft/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { NotesRenderer } from '@/components/notes/notes-renderer';
import { NotesToc } from '@/components/notes/notes-toc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import {
  courseProgressKey,
  saveLessonPosition,
  storeLessonProgress,
  useCourseProgress,
  useLesson,
} from '@/lib/learning/hooks';
import { createPositionSaver, resumePosition } from '@/lib/learning/playback';
import { type LessonPlayerHandle, LessonPlayer } from './lesson-player';
import { type SplitPane, SplitView } from './split-view';

const isNotFound = (error: unknown) => error instanceof ApiError && error.status === 404;

/** `/learn/[courseSlug]/[lessonId]`: loads the lesson and where the learner left off. */
export function LessonView({ courseSlug, lessonId }: { courseSlug: string; lessonId: string }) {
  const router = useRouter();
  const lesson = useLesson(lessonId);
  const progress = useCourseProgress(lesson.data?.course.id);
  const canonicalSlug = lesson.data?.course.slug;

  // Old or mistyped course slugs still find the lesson; the address is corrected.
  useEffect(() => {
    if (canonicalSlug && canonicalSlug !== courseSlug) {
      router.replace(`/learn/${canonicalSlug}/${lessonId}`);
    }
  }, [canonicalSlug, courseSlug, lessonId, router]);

  if (lesson.isError) {
    return isNotFound(lesson.error) ? (
      <Problem title="Lesson not found">
        It may have been removed, or its course isn&apos;t published yet.
      </Problem>
    ) : (
      <Problem title="The lesson could not be loaded" onRetry={() => void lesson.refetch()}>
        Check your connection and try again.
      </Problem>
    );
  }
  // Wait for fresh progress: the resume position is decided once, when the player is created.
  if (lesson.isPending || !(progress.isFetchedAfterMount || progress.isError)) {
    return <LessonSkeleton />;
  }

  const saved = progress.data?.lessons.find((entry) => entry.lessonId === lessonId);
  return (
    <LessonStudy
      key={lesson.data.id}
      lesson={lesson.data}
      savedPositionSec={saved?.lastPositionSec ?? 0}
      // Admins previewing an unpublished course: the API keeps no progress for it.
      preview={isNotFound(progress.error)}
    />
  );
}

function LessonStudy({
  lesson,
  savedPositionSec,
  preview,
}: {
  lesson: LessonDetail;
  savedPositionSec: number;
  preview: boolean;
}) {
  const queryClient = useQueryClient();
  const player = useRef<LessonPlayerHandle>(null);
  const [pane, setPane] = useState<SplitPane>('video');
  const [saveFailed, setSaveFailed] = useState(false);
  const [startSec] = useState(() => resumePosition(savedPositionSec, lesson.video.durationSec));
  const [saver] = useState(() =>
    createPositionSaver((seconds, keepalive) => {
      saveLessonPosition(lesson.id, seconds, keepalive).then(
        (result) => storeLessonProgress(queryClient, result),
        () => setSaveFailed(true),
      );
    }),
  );

  // Opening the lesson records it as started (and enrolls); leaving saves the latest position.
  useEffect(() => {
    if (preview) return;
    saveLessonPosition(lesson.id, startSec).then(
      () => {
        saver.markSaved(startSec);
        void queryClient.invalidateQueries({ queryKey: courseProgressKey(lesson.course.id) });
      },
      () => setSaveFailed(true),
    );
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') saver.flush(true);
    };
    const onPageHide = () => saver.flush(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      saver.flush(true);
    };
  }, [preview, lesson.id, lesson.course.id, startSec, saver, queryClient]);

  useEffect(() => {
    document.title = `${lesson.title} · CourseCraft AI`;
  }, [lesson.title]);

  const seek = (seconds: number) => {
    // On small screens the notes pane hides the player, and a hidden player ignores play
    // requests: show it first, then seek once it is on screen.
    setPane('video');
    requestAnimationFrame(() => {
      document.getElementById('lesson-player')?.scrollIntoView({ block: 'nearest' });
      player.current?.seek(seconds);
    });
  };

  const video = (
    <div className="grid gap-4 p-4 lg:p-6">
      <div id="lesson-player" className="scroll-mt-28">
        <LessonPlayer
          ref={player}
          youtubeId={lesson.video.youtubeId}
          title={lesson.video.title}
          startSec={startSec}
          onPosition={(seconds) => saver.update(seconds)}
          onStop={(seconds) => {
            saver.update(seconds);
            saver.flush();
          }}
        />
      </div>
      <div className="grid gap-2">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href={`/courses/${lesson.course.slug}`} className="hover:text-foreground">
                {lesson.course.title}
              </Link>
            </li>
            <li aria-hidden>
              <ChevronRightIcon className="size-3.5" />
            </li>
            <li>{lesson.module.title}</li>
          </ol>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight">{lesson.title}</h1>
        <p className="text-sm text-muted-foreground">
          {lesson.video.title}
          {lesson.video.channel && ` · ${lesson.video.channel}`} ·{' '}
          {formatDuration(lesson.video.durationSec)}
          {lesson.readingTimeMin ? ` · ${lesson.readingTimeMin} min read` : ''}
        </p>
        {preview && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Preview of an unpublished course: your progress isn&apos;t saved.
          </p>
        )}
        {saveFailed && (
          <p role="status" className="text-sm text-destructive">
            Your place in the video couldn&apos;t be saved. Check your connection.
          </p>
        )}
      </div>
      {lesson.summary && <p className="leading-7">{lesson.summary}</p>}
      {lesson.keyConcepts.length > 0 && (
        <ul aria-label="Key concepts" className="flex flex-wrap gap-1.5">
          {lesson.keyConcepts.map((concept) => (
            <li key={concept} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
              {concept}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const notes = (
    <div className="mx-auto grid max-w-3xl gap-6 p-4 lg:p-6">
      <NotesToc markdown={lesson.notesMarkdown} className="rounded-xl border p-4" />
      <NotesRenderer markdown={lesson.notesMarkdown} onSeek={seek} />
    </div>
  );

  return <SplitView video={video} notes={notes} mobilePane={pane} onMobilePaneChange={setPane} />;
}

function LessonSkeleton() {
  return (
    <div className="grid gap-6 p-4 lg:grid-cols-2 lg:p-6" aria-busy aria-label="Loading the lesson">
      <div className="grid content-start gap-4">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid content-start gap-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
      </div>
    </div>
  );
}

function Problem({
  title,
  children,
  onRetry,
}: {
  title: string;
  children: ReactNode;
  onRetry?: () => void;
}) {
  return (
    <section className="mx-auto grid max-w-xl gap-3 px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
      <div className="flex justify-center gap-2">
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
        <Button variant="outline" asChild>
          <Link href="/dashboard">My dashboard</Link>
        </Button>
      </div>
    </section>
  );
}
