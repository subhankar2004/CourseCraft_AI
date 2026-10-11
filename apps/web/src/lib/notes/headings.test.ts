import { describe, expect, it } from 'vitest';
import { createIdAllocator, headingSlug, plainHeadingText, tableOfContents } from './headings';

describe('notes headings', () => {
  it('strips anchors and markup from heading text', () => {
    expect(plainHeadingText('Joins and **keys** `JOIN` [▶ 1:02]')).toBe('Joins and keys JOIN');
    expect(plainHeadingText('[Docs](https://x.y) and _more_')).toBe('Docs and more');
  });

  it('makes slugs and de-duplicates them in order', () => {
    expect(headingSlug('Joins & Keys: Part 1')).toBe('joins-keys-part-1');
    expect(headingSlug('Résumé')).toBe('resume');
    expect(headingSlug('!!!')).toBe('section');
    const allocate = createIdAllocator();
    expect(['Recap', 'Recap', 'Recap'].map(allocate)).toEqual(['recap', 'recap-2', 'recap-3']);
  });

  it('builds the table of contents from ## and ### outside code', () => {
    const md = [
      '# Title',
      '## Summary',
      '## Creating a repository [▶ 0:15]',
      '### Commits [▶ 1:02:03]',
      '```bash',
      '## not a heading',
      '```',
      '## Recap',
      '## Recap',
    ].join('\n');
    expect(tableOfContents(md)).toEqual([
      { level: 2, text: 'Summary', id: 'summary', seconds: null },
      { level: 2, text: 'Creating a repository', id: 'creating-a-repository', seconds: 15 },
      { level: 3, text: 'Commits', id: 'commits', seconds: 3723 },
      { level: 2, text: 'Recap', id: 'recap', seconds: null },
      { level: 2, text: 'Recap', id: 'recap-2', seconds: null },
    ]);
  });
});
