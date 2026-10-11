/**
 * Timestamp anchors in lesson notes: `[▶ 4:05]` or `[▶ 1:02:03]`, the canonical form the
 * notes pipeline writes (services/ai/app/generation/notes.py). Used to validate edited notes
 * (#32) and to make anchors seek the video on the lesson page (#34).
 */
export interface NotesAnchor {
  /** The anchor as written, e.g. `[▶ 4:05]`. */
  raw: string;
  seconds: number;
  /** Character offset in the Markdown. */
  index: number;
}

const ANCHOR = /\[▶ ((?:\d+:)?\d{1,2}:\d{2})\]/g;
// Fenced code blocks and inline code: anchors there are text, not links.
const CODE = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;

/** "4:05" → 245, "1:02:03" → 3723; NaN for malformed input. */
export function parseTimestamp(text: string): number {
  const parts = text.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isInteger(p) || p < 0)) {
    return Number.NaN;
  }
  if (parts.slice(1).some((p) => p > 59)) return Number.NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** 245 → "4:05", 3723 → "1:02:03" (YouTube style). */
export function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function findAnchors(markdown: string): NotesAnchor[] {
  const code: [number, number][] = [];
  for (const match of markdown.matchAll(CODE))
    code.push([match.index, match.index + match[0].length]);
  const inCode = (i: number) => code.some(([start, end]) => i >= start && i < end);
  const anchors: NotesAnchor[] = [];
  for (const match of markdown.matchAll(ANCHOR)) {
    if (inCode(match.index)) continue;
    anchors.push({ raw: match[0], seconds: parseTimestamp(match[1]!), index: match.index });
  }
  return anchors;
}

/** Anchors that can't seek the video: malformed, or after its end. */
export function invalidAnchors(markdown: string, videoDurationSec: number): NotesAnchor[] {
  return findAnchors(markdown).filter(
    (a) => !Number.isFinite(a.seconds) || a.seconds > videoDurationSec,
  );
}

/** Reading time as the notes pipeline computes it: 200 words per minute, at least 1. */
export function readingTimeMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
