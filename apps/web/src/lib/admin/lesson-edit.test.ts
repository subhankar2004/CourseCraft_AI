import type { LessonDetail } from '@coursecraft/shared';
import { describe, expect, it } from 'vitest';
import { anchorReport, lessonEditBody, lessonToForm, parseConcepts } from './lesson-edit';

const lesson: LessonDetail = {
  id: 'l1',
  title: 'Git Explained',
  order: 0,
  summary: null,
  notesMarkdown: '## Git [▶ 0:05]\nNotes.',
  keyConcepts: ['Commit', 'Branch'],
  readingTimeMin: 1,
  module: { id: 'm1', title: 'Git', order: 0 },
  course: { id: 'c1', slug: 'web', title: 'Web' },
  video: {
    youtubeId: 'HXV3zeQKqGY',
    title: 'v',
    channel: null,
    durationSec: 100,
    thumbnailUrl: null,
  },
  prevLessonId: null,
  nextLessonId: null,
};

describe('lesson editing', () => {
  it('parses concepts from lines or commas, without duplicates', () => {
    expect(parseConcepts(' Commit \nBranch, Merge,,\nCommit')).toEqual([
      'Commit',
      'Branch',
      'Merge',
    ]);
  });

  it('sends only what changed', () => {
    const form = lessonToForm(lesson);
    expect(lessonEditBody(lesson, form)).toBeNull();
    expect(lessonEditBody(lesson, { ...form, concepts: 'Commit, Branch' })).toBeNull();
    expect(
      lessonEditBody(lesson, { ...form, summary: ' Git basics ', notes: `${form.notes}\nMore.` }),
    ).toEqual({
      summary: 'Git basics',
      notesMarkdown: '## Git [▶ 0:05]\nNotes.\nMore.',
    });
    expect(lessonEditBody({ ...lesson, summary: 'x' }, { ...form, summary: '' })).toEqual({
      summary: null,
    });
  });

  it('reports anchors the API would refuse', () => {
    expect(anchorReport('[▶ 0:05] [▶ 1:41] `[▶ 9:00]`', 100)).toEqual({
      count: 2,
      invalid: ['[▶ 1:41]'],
      videoEnd: '1:40',
    });
  });
});
