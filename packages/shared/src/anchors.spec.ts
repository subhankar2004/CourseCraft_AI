import {
  findAnchors,
  formatTimestamp,
  invalidAnchors,
  parseTimestamp,
  readingTimeMinutes,
} from './index.js';

describe('notes anchors', () => {
  it('parses and formats timestamps', () => {
    expect(parseTimestamp('4:05')).toBe(245);
    expect(parseTimestamp('1:02:03')).toBe(3723);
    expect(parseTimestamp('4:75')).toBeNaN();
    expect(parseTimestamp('5')).toBeNaN();
    expect(formatTimestamp(245)).toBe('4:05');
    expect(formatTimestamp(3723)).toBe('1:02:03');
  });

  it('finds anchors outside code only', () => {
    const md =
      'Intro [▶ 0:05]\n```js\nconst t = "[▶ 9:99]";\n```\nUse `[▶ 8:00]` like this. Then [▶ 1:02:03].';
    expect(findAnchors(md).map((a) => [a.raw, a.seconds])).toEqual([
      ['[▶ 0:05]', 5],
      ['[▶ 1:02:03]', 3723],
    ]);
  });

  it('flags anchors after the end of the video or malformed', () => {
    expect(invalidAnchors('[▶ 3:59] [▶ 4:01] [▶ 2:61]', 240).map((a) => a.raw)).toEqual([
      '[▶ 4:01]',
      '[▶ 2:61]',
    ]);
  });

  it('computes reading time like the pipeline (200 wpm)', () => {
    expect(readingTimeMinutes('word '.repeat(401))).toBe(3);
    expect(readingTimeMinutes('')).toBe(1);
  });
});
