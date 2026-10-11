import { describe, expect, it } from 'vitest';
import { createPositionSaver, linkedTime, resumePosition } from './playback';
import { parseStoredSplit, splitFromKey, splitFromPointer } from './split';

describe('resumePosition', () => {
  it.each([
    [0, 600, 0],
    [4.9, 600, 0],
    [125.7, 600, 125],
    [589, 600, 589],
    [590.5, 600, 0], // within 10 s of the end: start again
    [590, 600, 0],
    [589.9, 0, 589], // unknown duration
  ])('saved %s of %s s → %s', (saved, duration, expected) => {
    expect(resumePosition(saved, duration)).toBe(expected);
  });
});

describe('linkedTime', () => {
  it.each([
    [null, 600, null],
    ['', 600, null],
    ['abc', 600, null],
    ['-5', 600, null],
    ['12.5', 600, null],
    ['181', 600, 181],
    ['0', 600, 0],
    ['900', 600, 599], // past the end: the last second
    ['181', 0, 181], // unknown duration
  ])('t=%s of %s s → %s', (value, duration, expected) => {
    expect(linkedTime(value, duration)).toBe(expected);
  });
});

describe('createPositionSaver', () => {
  function setup() {
    let clock = 0;
    const saves: [number, boolean][] = [];
    const saver = createPositionSaver((sec, keepalive) => saves.push([sec, keepalive]), {
      intervalMs: 15_000,
      now: () => clock,
    });
    return { saver, saves, tick: (ms: number) => (clock += ms) };
  }

  it('sends nothing before the opening save is known', () => {
    const { saver, saves } = setup();
    saver.update(30);
    saver.flush(true);
    expect(saves).toEqual([]);
  });

  it('saves at most once per interval while playing', () => {
    const { saver, saves, tick } = setup();
    saver.markSaved(100);
    for (let second = 1; second <= 31; second++) {
      tick(1_000);
      saver.update(100 + second);
    }
    expect(saves).toEqual([
      [115, false],
      [130, false],
    ]);
  });

  it('flushes the latest position on pause or leave, only when it moved', () => {
    const { saver, saves, tick } = setup();
    saver.markSaved(100);
    tick(3_000);
    saver.update(103.26);
    saver.flush();
    saver.flush(true); // nothing new
    tick(1_000);
    saver.update(103.5); // under a second away
    saver.flush(true);
    saver.update(40); // seeking back counts as a move
    saver.flush(true);
    expect(saver.position()).toBe(40);
    expect(saves).toEqual([
      [103.3, false],
      [40, true],
    ]);
  });
});

describe('split', () => {
  it('follows the pointer within the limits', () => {
    const row = { left: 100, width: 1000 };
    expect(splitFromPointer(600, row)).toBe(50);
    expect(splitFromPointer(433.33, row)).toBe(33.3);
    expect(splitFromPointer(0, row)).toBe(30);
    expect(splitFromPointer(2000, row)).toBe(70);
  });

  it('moves with the keyboard', () => {
    expect(splitFromKey(50, 'ArrowLeft')).toBe(45);
    expect(splitFromKey(68, 'ArrowRight')).toBe(70);
    expect(splitFromKey(50, 'Home')).toBe(30);
    expect(splitFromKey(50, 'End')).toBe(70);
    expect(splitFromKey(35, 'Enter')).toBe(50);
    expect(splitFromKey(50, 'a')).toBeNull();
  });

  it('reads a stored split defensively', () => {
    expect(parseStoredSplit(null)).toBe(50);
    expect(parseStoredSplit('nonsense')).toBe(50);
    expect(parseStoredSplit('')).toBe(50);
    expect(parseStoredSplit('62.5')).toBe(62.5);
    expect(parseStoredSplit('5')).toBe(30);
  });
});
