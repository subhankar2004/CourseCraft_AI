import { describe, expect, it } from 'vitest';
import { formatDuration, plural } from './format';

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
