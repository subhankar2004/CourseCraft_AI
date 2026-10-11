import { parseTimestamp } from '@coursecraft/shared';
import type { Heading, Nodes, Parent, PhrasingContent, Root, Text } from 'mdast';
import { createIdAllocator, plainHeadingText } from './headings';

const ANCHOR = /\[▶ ((?:\d+:)?\d{1,2}:\d{2})\]/g;

/** Rendered as `<span data-seek="245">▶ 4:05</span>`, which the renderer turns into a chip. */
interface AnchorNode {
  type: 'timestampAnchor';
  data: {
    hName: 'span';
    hProperties: { dataSeek: number };
    hChildren: [{ type: 'text'; value: string }];
  };
}

function splitAnchors(node: Text): (Text | AnchorNode)[] | null {
  const parts: (Text | AnchorNode)[] = [];
  let last = 0;
  for (const match of node.value.matchAll(ANCHOR)) {
    const seconds = parseTimestamp(match[1]!);
    if (!Number.isFinite(seconds)) continue;
    if (match.index > last)
      parts.push({ type: 'text', value: node.value.slice(last, match.index) });
    parts.push({
      type: 'timestampAnchor',
      data: {
        hName: 'span',
        hProperties: { dataSeek: seconds },
        hChildren: [{ type: 'text', value: `▶ ${match[1]}` }],
      },
    });
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return null;
  if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
  return parts;
}

/**
 * `[▶ m:ss]` in text becomes a timestamp anchor. Code is never touched: inline code and code
 * blocks are their own node types, so anchors written there stay plain text.
 */
export function remarkTimestampAnchors() {
  const walk = (parent: Parent) => {
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i] as Nodes;
      if (child.type === 'text') {
        const parts = splitAnchors(child);
        if (parts) {
          parent.children.splice(i, 1, ...(parts as unknown as PhrasingContent[]));
          i += parts.length - 1;
        }
      } else if ('children' in child) {
        walk(child as Parent);
      }
    }
  };
  return (tree: Root) => walk(tree);
}

/** The text a heading node shows, without anchors (same rule as `plainHeadingText`). */
function headingText(node: Nodes): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value;
  if ('children' in node) return (node.children as Nodes[]).map(headingText).join('');
  return '';
}

/** Gives every heading an id, in document order, exactly like `tableOfContents`. */
export function remarkHeadingIds() {
  return (tree: Root) => {
    const allocate = createIdAllocator();
    const visit = (node: Nodes) => {
      if (node.type === 'heading') {
        const heading = node as Heading;
        const id = allocate(plainHeadingText(headingText(heading)));
        heading.data = { ...heading.data, hProperties: { ...heading.data?.hProperties, id } };
        return;
      }
      if ('children' in node) (node.children as Nodes[]).forEach(visit);
    };
    visit(tree);
  };
}
