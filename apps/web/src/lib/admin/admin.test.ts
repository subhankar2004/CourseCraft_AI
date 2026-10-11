import type { AdminCourse, Domain } from '@coursecraft/shared';
import { describe, expect, it } from 'vitest';
import { countByStatus, coursesPerDomain, filterCourses, hasActiveGeneration } from './courses';
import { catalogTagsFor, createBody, domainFormSchema, domainToForm, updateBody } from './domains';

const course = (over: Partial<AdminCourse>): AdminCourse => ({
  id: 'c',
  slug: 's',
  title: 'SQL Basics',
  status: 'DRAFT',
  level: null,
  thumbnailUrl: null,
  domain: { id: 'd1', name: 'Databases', slug: 'databases' },
  moduleCount: 0,
  lessonCount: 0,
  createdAt: '2026-10-11T10:00:00.000Z',
  updatedAt: '2026-10-11T10:00:00.000Z',
  latestJob: null,
  ...over,
});

const courses = [
  course({ id: '1', title: 'SQL Basics', status: 'PUBLISHED' }),
  course({ id: '2', title: 'Joins', status: 'GENERATING' }),
  course({
    id: '3',
    title: 'React',
    status: 'FAILED',
    domain: { id: 'd2', name: 'Web', slug: 'web' },
  }),
];

describe('admin courses', () => {
  it('filters by status and searches title and domain', () => {
    expect(filterCourses(courses, 'ALL', '').map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(filterCourses(courses, 'FAILED', '').map((c) => c.id)).toEqual(['3']);
    expect(filterCourses(courses, 'ALL', '  web ').map((c) => c.id)).toEqual(['3']);
    expect(filterCourses(courses, 'PUBLISHED', 'join')).toEqual([]);
  });

  it('counts per status for the tabs', () => {
    expect(countByStatus(courses)).toEqual({
      ALL: 3,
      DRAFT: 0,
      GENERATING: 1,
      PUBLISHED: 1,
      FAILED: 1,
    });
  });

  it('polls only while something is generating', () => {
    expect(hasActiveGeneration(courses)).toBe(true);
    expect(hasActiveGeneration([courses[0]!])).toBe(false);
    expect(hasActiveGeneration(undefined)).toBe(false);
  });

  it('counts courses of any status per domain', () => {
    expect(coursesPerDomain(courses)).toEqual(
      new Map([
        ['d1', 2],
        ['d2', 1],
      ]),
    );
  });
});

describe('admin domains', () => {
  const domain: Domain = {
    id: 'd1',
    slug: 'databases',
    name: 'Databases',
    description: null,
    courseCount: 2,
  };

  it('validates the form; an empty slug means "generate one"', () => {
    expect(domainFormSchema.safeParse({ name: 'Go', description: '', slug: '' }).success).toBe(
      true,
    );
    expect(domainFormSchema.safeParse({ name: 'G', description: '', slug: '' }).success).toBe(
      false,
    );
    expect(
      domainFormSchema.safeParse({ name: 'Go', description: '', slug: 'Bad Slug' }).success,
    ).toBe(false);
  });

  it('builds a create body without empty fields', () => {
    expect(createBody({ name: ' Go ', description: '  ', slug: '' })).toEqual({ name: 'Go' });
    expect(createBody({ name: 'Go', description: 'Lang', slug: 'golang' })).toEqual({
      name: 'Go',
      description: 'Lang',
      slug: 'golang',
    });
  });

  it('sends only the changed fields on update', () => {
    const form = domainToForm(domain);
    expect(updateBody(domain, form)).toBeNull();
    expect(updateBody(domain, { ...form, description: 'All about data' })).toEqual({
      description: 'All about data',
    });
    expect(updateBody({ ...domain, description: 'x' }, { ...form, description: ' ' })).toEqual({
      description: null,
    });
    expect(updateBody(domain, { ...form, name: 'Data', slug: 'data' })).toEqual({
      name: 'Data',
      slug: 'data',
    });
    expect(updateBody(domain, { ...form, slug: '' })).toBeNull(); // empty slug never clears it
  });

  it('invalidates the catalog pages a change can affect', () => {
    expect(catalogTagsFor('databases', 'data', 'data', undefined)).toEqual([
      'domains',
      'courses',
      'domain:databases',
      'domain:data',
    ]);
  });
});
