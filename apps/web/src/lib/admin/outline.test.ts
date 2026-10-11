import { describe, expect, it } from 'vitest';
import {
  addModule,
  courseCatalogTags,
  draftFrom,
  moveLessonTo,
  moveLessonWithin,
  moveModule,
  outlineChanged,
  outlineProblems,
  renameModule,
  toPayload,
} from './outline';

const lesson = (id: string) => ({
  id,
  title: id,
  order: 0,
  summary: null,
  readingTimeMin: 2,
  youtubeId: 'x',
  videoDurationSec: 100,
  cognitiveLoad: null,
});
const saved = draftFrom({
  modules: [
    { id: 'm1', title: 'Basics', summary: null, order: 0, lessons: [lesson('a'), lesson('b')] },
    { id: 'm2', title: 'More', summary: null, order: 1, lessons: [lesson('c')] },
  ],
});

describe('outline editing', () => {
  it('reorders modules and lessons', () => {
    expect(moveModule(saved, 1, 0).map((m) => m.key)).toEqual(['m2', 'm1']);
    expect(moveLessonWithin(saved, 'm1', 0, 1)[0]?.lessonIds).toEqual(['b', 'a']);
    expect(moveModule(saved, 0, 5)).toEqual(saved); // out of range: unchanged
  });

  it('moves a lesson to another module, at the end or a position', () => {
    expect(moveLessonTo(saved, 'a', 'm2').map((m) => m.lessonIds)).toEqual([['b'], ['c', 'a']]);
    expect(moveLessonTo(saved, 'c', 'm1', 1).map((m) => m.lessonIds)).toEqual([
      ['a', 'c', 'b'],
      [],
    ]);
  });

  it('builds the API body: new modules without id, empty modules dropped', () => {
    const draft = moveLessonTo(addModule(renameModule(saved, 'm1', ' Intro ')), 'c', 'new-1');
    expect(toPayload(draft)).toEqual({
      modules: [
        { id: 'm1', title: 'Intro', lessonIds: ['a', 'b'] },
        { title: 'New module', lessonIds: ['c'] }, // m2 is empty now: it will be deleted
      ],
    });
  });

  it('knows when there is something to save and what blocks it', () => {
    expect(outlineChanged(saved, saved)).toBe(false);
    expect(outlineChanged(saved, moveModule(saved, 0, 1))).toBe(true);
    expect(outlineChanged(saved, addModule(saved))).toBe(false); // an empty new module changes nothing
    expect(outlineProblems(renameModule(saved, 'm2', '  '))).toEqual(['Module 2 needs a title']);
    expect(outlineProblems(saved)).toEqual([]);
  });

  it('lists the catalog tags of old and new slugs and domains', () => {
    expect(courseCatalogTags(['sql', 'sql-2', 'sql'], ['db', undefined])).toEqual([
      'courses',
      'domains',
      'course:sql',
      'course:sql-2',
      'domain:db',
    ]);
  });
});
