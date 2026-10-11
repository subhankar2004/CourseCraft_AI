import { formatTimestamp, type ChatCitation } from '@coursecraft/shared';
import type { Nodes, Parent, PhrasingContent, Root, Text } from 'mdast';

/** `[1]`, `[1, 3]` in an answer (the AI service removes markers that cite nothing, #40). */
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** The lesson page at the cited moment: the player starts (or seeks) there (#42). */
export function citationHref(courseSlug: string, citation: ChatCitation): string {
  return `/learn/${courseSlug}/${citation.lessonId}?t=${Math.floor(citation.seekSec)}`;
}

/** "CSS Variables in 100 Seconds · 1:05" */
export function citationLabel(citation: ChatCitation): string {
  return `${citation.lessonTitle} · ${formatTimestamp(Math.floor(citation.seekSec))}`;
}

/** Rendered as `<sup data-cite="2">2</sup>`, which the answer renderer turns into a link. */
interface MarkerNode {
  type: 'citationMarker';
  data: {
    hName: 'sup';
    hProperties: { dataCite: number };
    hChildren: [{ type: 'text'; value: string }];
  };
}

function splitMarkers(node: Text): (Text | MarkerNode)[] | null {
  const parts: (Text | MarkerNode)[] = [];
  let last = 0;
  for (const match of node.value.matchAll(MARKER)) {
    if (match.index > last)
      parts.push({ type: 'text', value: node.value.slice(last, match.index) });
    for (const n of match[1]!.split(',').map((part) => Number(part.trim()))) {
      parts.push({
        type: 'citationMarker',
        data: {
          hName: 'sup',
          hProperties: { dataCite: n },
          hChildren: [{ type: 'text', value: String(n) }],
        },
      });
    }
    last = match.index + match[0].length;
  }
  if (parts.length === 0) return null;
  if (last < node.value.length) parts.push({ type: 'text', value: node.value.slice(last) });
  return parts;
}

/** Citation markers in prose become `citationMarker` nodes; code (its own node type) is untouched. */
export function remarkCitationMarkers() {
  const walk = (parent: Parent) => {
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i] as Nodes;
      if (child.type === 'text') {
        const parts = splitMarkers(child);
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
