/**
 * The lesson page's resizable split (#35): the video pane's width as a percentage of the row,
 * moved by pointer or keyboard as in the WAI-ARIA window splitter pattern.
 */

export const SPLIT_MIN = 30;
export const SPLIT_MAX = 70;
export const SPLIT_DEFAULT = 50;
const STEP = 5;

export const clampSplit = (percent: number) =>
  Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, percent)) * 10) / 10;

/** The split under the pointer, from the row's position on screen. */
export function splitFromPointer(clientX: number, row: { left: number; width: number }): number {
  if (row.width <= 0) return SPLIT_DEFAULT;
  return clampSplit(((clientX - row.left) / row.width) * 100);
}

/** The split after a key press, or null when the key doesn't move it. */
export function splitFromKey(current: number, key: string): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampSplit(current - STEP);
    case 'ArrowRight':
      return clampSplit(current + STEP);
    case 'Home':
      return SPLIT_MIN;
    case 'End':
      return SPLIT_MAX;
    case 'Enter':
      return SPLIT_DEFAULT;
    default:
      return null;
  }
}

/** A stored split (browser storage can hold anything), or the default. */
export function parseStoredSplit(value: string | null): number {
  const percent = Number(value);
  return value?.trim() && Number.isFinite(percent) ? clampSplit(percent) : SPLIT_DEFAULT;
}
