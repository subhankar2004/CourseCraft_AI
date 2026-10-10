import { createDomainSchema, slugify, slugSchema, updateDomainSchema } from './index.js';

describe('slugify', () => {
  it.each([
    ['Data Structures & Algorithms', 'data-structures-algorithms'],
    ['  Machine   Learning  ', 'machine-learning'],
    ['Développement Web', 'developpement-web'],
    ['C++ / C#', 'c-c'],
    ['---', ''],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('slugSchema', () => {
  it('accepts valid slugs and rejects others', () => {
    expect(slugSchema.safeParse('database-systems').success).toBe(true);
    for (const bad of ['Database', 'two--hyphens', '-start', 'end-', 'with space', 'a']) {
      expect(slugSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('domain input schemas', () => {
  it('trims and accepts a minimal create', () => {
    expect(createDomainSchema.parse({ name: '  Cloud  ' })).toEqual({ name: 'Cloud' });
  });

  it('rejects unknown fields and empty updates', () => {
    expect(createDomainSchema.safeParse({ name: 'Cloud', courseCount: 9 }).success).toBe(false);
    expect(updateDomainSchema.safeParse({}).success).toBe(false);
  });

  it('allows clearing the description', () => {
    expect(updateDomainSchema.parse({ description: null })).toEqual({ description: null });
  });
});
