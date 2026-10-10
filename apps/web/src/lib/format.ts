/** 44709 → "12h 25m", 2700 → "45m", 59 → "1m" (rounded up so short videos never show "0m"). */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(totalSeconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Plural helper: plural(4, 'lesson') → "4 lessons". */
export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
