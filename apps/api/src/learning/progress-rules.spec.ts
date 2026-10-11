import { nextProgress, summarize } from './progress-rules.js';

const now = new Date('2026-10-11T12:00:00Z');
const earlier = new Date('2026-10-10T12:00:00Z');
const DURATION = 100;

describe('progress rules (SPEC §7.3)', () => {
  it('opening a lesson marks it in progress', () => {
    expect(nextProgress(null, { lastPositionSec: 0 }, DURATION, now)).toEqual({
      status: 'IN_PROGRESS',
      lastPositionSec: 0,
      completedAt: null,
    });
  });

  it('completes at 90% of the video, not before', () => {
    expect(nextProgress(null, { lastPositionSec: 89.9 }, DURATION, now).status).toBe('IN_PROGRESS');
    expect(nextProgress(null, { lastPositionSec: 90 }, DURATION, now)).toEqual({
      status: 'COMPLETED',
      lastPositionSec: 90,
      completedAt: now,
    });
  });

  it('completes when marked so, keeping the first completion time', () => {
    const done = { status: 'COMPLETED' as const, lastPositionSec: 95, completedAt: earlier };
    expect(
      nextProgress(null, { status: 'COMPLETED', lastPositionSec: 10 }, DURATION, now).completedAt,
    ).toBe(now);
    expect(
      nextProgress(done, { status: 'COMPLETED', lastPositionSec: 20 }, DURATION, now).completedAt,
    ).toBe(earlier);
  });

  it('re-watching never undoes a completion; an explicit status does', () => {
    const done = { status: 'COMPLETED' as const, lastPositionSec: 95, completedAt: earlier };
    expect(nextProgress(done, { lastPositionSec: 5 }, DURATION, now)).toEqual({
      status: 'COMPLETED',
      lastPositionSec: 5,
      completedAt: earlier,
    });
    expect(
      nextProgress(done, { status: 'IN_PROGRESS', lastPositionSec: 5 }, DURATION, now),
    ).toEqual({
      status: 'IN_PROGRESS',
      lastPositionSec: 5,
      completedAt: null,
    });
  });

  it('clamps the position to the video', () => {
    expect(nextProgress(null, { lastPositionSec: 500 }, DURATION, now)).toMatchObject({
      lastPositionSec: 100,
      status: 'COMPLETED',
    });
  });

  it('never auto-completes a lesson without a known duration', () => {
    expect(nextProgress(null, { lastPositionSec: 0 }, 0, now).status).toBe('IN_PROGRESS');
  });

  it('summarises a course', () => {
    expect(summarize(1, 3)).toEqual({ completed: 1, total: 3, percent: 33 });
    expect(summarize(0, 0)).toEqual({ completed: 0, total: 0, percent: 0 });
    expect(summarize(25, 25).percent).toBe(100);
  });
});
