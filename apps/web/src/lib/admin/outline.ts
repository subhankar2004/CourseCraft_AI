import type { AdminCourseDetail, CourseOutlineUpdate } from '@coursecraft/shared';

/** The outline being edited. `key` identifies a module in the UI (its id, or `new-…`). */
export interface DraftModule {
  key: string;
  id?: string;
  title: string;
  lessonIds: string[];
}
export type DraftOutline = DraftModule[];

export function draftFrom(detail: Pick<AdminCourseDetail, 'modules'>): DraftOutline {
  return detail.modules.map((m) => ({
    key: m.id,
    id: m.id,
    title: m.title,
    lessonIds: m.lessons.map((l) => l.id),
  }));
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

export const moveModule = (outline: DraftOutline, from: number, to: number) =>
  move(outline, from, to);

export function moveLessonWithin(
  outline: DraftOutline,
  moduleKey: string,
  from: number,
  to: number,
) {
  return outline.map((m) =>
    m.key === moduleKey ? { ...m, lessonIds: move(m.lessonIds, from, to) } : m,
  );
}

/** Moves a lesson to the end of another module (or to `index` in it). */
export function moveLessonTo(
  outline: DraftOutline,
  lessonId: string,
  targetKey: string,
  index?: number,
) {
  const without = outline.map((m) => ({
    ...m,
    lessonIds: m.lessonIds.filter((id) => id !== lessonId),
  }));
  return without.map((m) => {
    if (m.key !== targetKey) return m;
    const lessonIds = [...m.lessonIds];
    lessonIds.splice(index ?? lessonIds.length, 0, lessonId);
    return { ...m, lessonIds };
  });
}

export const renameModule = (outline: DraftOutline, key: string, title: string) =>
  outline.map((m) => (m.key === key ? { ...m, title } : m));

let newKeys = 0;
export function addModule(outline: DraftOutline, title = 'New module'): DraftOutline {
  return [...outline, { key: `new-${++newKeys}`, title, lessonIds: [] }];
}

/** The API body. Empty modules are left out: a new one is not created, an existing one is deleted. */
export function toPayload(outline: DraftOutline): CourseOutlineUpdate {
  return {
    modules: outline
      .filter((m) => m.lessonIds.length > 0)
      .map((m) => ({ ...(m.id && { id: m.id }), title: m.title.trim(), lessonIds: m.lessonIds })),
  };
}

export const outlineChanged = (saved: DraftOutline, draft: DraftOutline) =>
  JSON.stringify(toPayload(saved)) !== JSON.stringify(toPayload(draft));

/** Problems that block saving (shown next to the Save button). */
export function outlineProblems(outline: DraftOutline): string[] {
  const problems: string[] = [];
  outline.forEach((m, i) => {
    if (m.lessonIds.length > 0 && !m.title.trim()) problems.push(`Module ${i + 1} needs a title`);
  });
  if (!outline.some((m) => m.lessonIds.length > 0))
    problems.push('The course needs at least one lesson');
  return problems;
}

/** Public catalog cache tags a course change can affect (old and new slugs and domains). */
export function courseCatalogTags(
  courseSlugs: (string | undefined)[],
  domainSlugs: (string | undefined)[],
) {
  const slugs = [...new Set(courseSlugs.filter((s): s is string => Boolean(s)))];
  const domains = [...new Set(domainSlugs.filter((s): s is string => Boolean(s)))];
  return [
    'courses',
    'domains',
    ...slugs.map((s) => `course:${s}`),
    ...domains.map((s) => `domain:${s}`),
  ];
}
