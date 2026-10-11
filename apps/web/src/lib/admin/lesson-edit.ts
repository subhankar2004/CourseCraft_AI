import {
  findAnchors,
  formatTimestamp,
  invalidAnchors,
  type LessonDetail,
  type UpdateLessonInput,
} from '@coursecraft/shared';

export interface LessonForm {
  title: string;
  summary: string;
  /** One concept per line (commas also separate). */
  concepts: string;
  notes: string;
}

export const lessonToForm = (lesson: LessonDetail): LessonForm => ({
  title: lesson.title,
  summary: lesson.summary ?? '',
  concepts: lesson.keyConcepts.join('\n'),
  notes: lesson.notesMarkdown,
});

export function parseConcepts(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];
}

/** Only what changed; `null` when nothing did. */
export function lessonEditBody(lesson: LessonDetail, form: LessonForm): UpdateLessonInput | null {
  const body: UpdateLessonInput = {};
  if (form.title.trim() !== lesson.title) body.title = form.title.trim();
  const summary = form.summary.trim() || null;
  if (summary !== lesson.summary) body.summary = summary;
  const concepts = parseConcepts(form.concepts);
  if (JSON.stringify(concepts) !== JSON.stringify(lesson.keyConcepts)) body.keyConcepts = concepts;
  if (form.notes.trim() !== lesson.notesMarkdown.trim()) body.notesMarkdown = form.notes.trim();
  return Object.keys(body).length > 0 ? body : null;
}

/** What the anchor check shows: how many anchors, and the ones the API will refuse. */
export function anchorReport(notes: string, videoDurationSec: number) {
  return {
    count: findAnchors(notes).length,
    invalid: invalidAnchors(notes, videoDurationSec).map((a) => a.raw),
    videoEnd: formatTimestamp(videoDurationSec),
  };
}
