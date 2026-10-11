import { findAnchors } from '@coursecraft/shared';

export interface TocEntry {
  level: 2 | 3;
  text: string;
  id: string;
  /** The heading's `[▶ m:ss]` anchor, when it has one. */
  seconds: number | null;
}

const ANCHOR = /\[▶ (?:\d+:)?\d{1,2}:\d{2}\]/g;

/** "Joins `JOIN` [▶ 1:02]" → "Joins JOIN": the text a heading shows, without anchors or markup. */
export function plainHeadingText(markdown: string): string {
  return markdown
    .replace(ANCHOR, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images → their text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** URL fragment for a heading: lowercase words joined by hyphens ("Joins & Keys" → "joins-keys"). */
export function headingSlug(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  );
}

/** Ids in document order, de-duplicated with -2, -3 … (shared by the TOC and the renderer). */
export function createIdAllocator() {
  const used = new Map<string, number>();
  return (text: string) => {
    const base = headingSlug(text);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

/** `##` and `###` headings outside code fences, in order. */
export function tableOfContents(markdown: string): TocEntry[] {
  const allocate = createIdAllocator();
  const entries: TocEntry[] = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const match = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = plainHeadingText(match[2]!);
    const id = allocate(text); // every heading takes an id, so they stay in step with the DOM
    if (match[1]!.length === 1) continue; // a `#` title is not listed
    const anchor = findAnchors(match[2]!)[0];
    entries.push({ level: match[1]!.length as 2 | 3, text, id, seconds: anchor?.seconds ?? null });
  }
  return entries;
}
