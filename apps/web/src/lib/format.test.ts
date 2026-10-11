import { describe, expect, it } from 'vitest';
import { formatDuration, formatRelative, plural } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '1m'],
    [59, '1m'],
    [60, '1m'],
    [61, '2m'],
    [2700, '45m'],
    [3600, '1h'],
    [15639, '4h 21m'],
    [44879, '12h 28m'],
  ])('%i s → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('plural', () => {
  it('pluralises', () => {
    expect(plural(1, 'lesson')).toBe('1 lesson');
    expect(plural(4, 'module')).toBe('4 modules');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-10-11T12:00:00Z');
  it.each([
    ['2026-10-11T11:59:40Z', 'just now'],
    ['2026-10-11T11:55:00Z', '5 minutes ago'],
    ['2026-10-11T09:00:00Z', '3 hours ago'],
    ['2026-10-10T12:00:00Z', 'yesterday'],
    ['2026-09-11T12:00:00Z', 'last month'],
  ])('%s → %s', (iso, expected) => {
    expect(formatRelative(iso, now)).toBe(expected);
  });
});
