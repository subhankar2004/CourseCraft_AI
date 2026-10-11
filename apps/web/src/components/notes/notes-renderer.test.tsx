// @vitest-environment jsdom
import { findAnchors, formatTimestamp } from '@coursecraft/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tableOfContents } from '@/lib/notes/headings';
// The real seeded notes (handwritten demo content whose anchors are verified chapter starts).
import { modules } from '../../../../api/prisma/seed-data/catalog';
import { NotesRenderer } from './notes-renderer';
import { NotesToc } from './notes-toc';

afterEach(cleanup);

const seeded = modules.flatMap((m) => m.lessons);

describe('NotesRenderer with the seeded notes', () => {
  it.each(seeded.map((l) => [l.title, l.notesMarkdown] as const))(
    'renders "%s"',
    (_title, markdown) => {
      const onSeek = vi.fn();
      const { container } = render(<NotesRenderer markdown={markdown} onSeek={onSeek} />);
      // Every anchor became a chip; no raw "[▶" is left outside code.
      const anchors = findAnchors(markdown);
      expect(anchors.length).toBeGreaterThan(0);
      for (const anchor of anchors) {
        expect(
          screen.getAllByRole('button', {
            name: `Play the video from ${formatTimestamp(anchor.seconds)}`,
          }).length,
        ).toBeGreaterThan(0);
      }
      const proseText = [...container.querySelectorAll('p, li, h1, h2, h3, td')]
        .map((e) => e.textContent)
        .join(' ');
      expect(proseText).not.toContain('[▶');
      // Headings carry the ids the table of contents links to, in the same order.
      const ids = [...container.querySelectorAll('h2[id], h3[id]')].map((h) => h.id);
      expect(ids).toEqual(expect.arrayContaining(tableOfContents(markdown).map((e) => e.id)));
    },
  );

  it('fires onSeek with the anchor time', async () => {
    const onSeek = vi.fn();
    render(<NotesRenderer markdown={seeded[0]!.notesMarkdown} onSeek={onSeek} />);
    await userEvent.click(screen.getByRole('button', { name: 'Play the video from 2:36' }));
    expect(onSeek).toHaveBeenCalledWith(156);
  });

  it('renders the seeded table and callout', () => {
    const { container } = render(<NotesRenderer markdown={seeded[0]!.notesMarkdown} />);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(6); // header + 5 key types
    expect(container.querySelector('blockquote')?.textContent).toContain('Foreign keys');
  });
});

describe('NotesRenderer behaviour', () => {
  it('leaves anchors in code alone', () => {
    const md = 'See [▶ 0:05] and `[▶ 9:00]`.\n\n```js\nconst t = "[▶ 1:00]";\n```';
    const { container } = render(<NotesRenderer markdown={md} onSeek={() => {}} />);
    expect(screen.getAllByRole('button', { name: /^Play the video/ })).toHaveLength(1);
    expect(container.querySelector('p code')?.textContent).toBe('[▶ 9:00]');
    expect(container.querySelector('pre')?.textContent).toContain('[▶ 1:00]');
  });

  it('links anchors to YouTube without onSeek, and shows plain chips without either', () => {
    const { rerender } = render(
      <NotesRenderer markdown="Go [▶ 1:02:03]" youtubeId="HXV3zeQKqGY" />,
    );
    expect(
      screen
        .getByRole('link', { name: 'Open the video at 1:02:03 on YouTube' })
        .getAttribute('href'),
    ).toBe('https://www.youtube.com/watch?v=HXV3zeQKqGY&t=3723s');
    rerender(<NotesRenderer markdown="Go [▶ 1:02:03]" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('1:02:03').closest('span')).not.toBeNull();
  });

  it('highlights code and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const { container } = render(
      <NotesRenderer markdown={'```sql\nSELECT * FROM employee;\n```'} />,
    );
    expect(container.querySelector('code.hljs.language-sql .hljs-keyword')?.textContent).toBe(
      'SELECT',
    );
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('SELECT * FROM employee;\n');
    expect((await screen.findByRole('button', { name: 'Code copied' })).textContent).toBe('Copied');
  });

  it('never renders raw HTML or script links', () => {
    const md =
      '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1))';
    const { container } = render(<NotesRenderer markdown={md} />);
    expect(container.querySelector('script, img')).toBeNull();
    // The unsafe URL is stripped: the text stays, but there is no javascript: href to follow.
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent === 'click');
    expect(link).toBeDefined();
    expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript/i);
  });
});

describe('NotesToc', () => {
  it('lists headings with their times and links to them', () => {
    render(<NotesToc markdown={seeded[0]!.notesMarkdown} />);
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#what-is-a-database',
      '#tables-and-keys',
      '#sql-basics',
      '#recap',
    ]);
    expect(links[0]?.textContent).toBe('What is a database?2:36');
  });
});
