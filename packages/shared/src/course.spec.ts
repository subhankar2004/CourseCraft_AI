import { courseListQuerySchema } from './index.js';

describe('courseListQuerySchema', () => {
  it('applies defaults and coerces query-string numbers', () => {
    expect(courseListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 12 });
    expect(courseListQuerySchema.parse({ page: '3', pageSize: '5' })).toMatchObject({
      page: 3,
      pageSize: 5,
    });
  });

  it('trims the search text and accepts known levels', () => {
    expect(courseListQuerySchema.parse({ q: '  sql  ', level: 'Beginner' })).toMatchObject({
      q: 'sql',
      level: 'Beginner',
    });
  });

  it.each([
    { page: '0' },
    { pageSize: '51' },
    { level: 'Expert' },
    { domain: 'Not A Slug' },
    { q: '' },
    { sort: 'title' },
  ])('rejects %o', (query) => {
    expect(courseListQuerySchema.safeParse(query).success).toBe(false);
  });
});
