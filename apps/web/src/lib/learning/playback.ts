/**
 * Playback rules of the lesson page (#35), kept free of React and the player so they can be
 * unit-tested: where to resume, and when to send the position to the API.
 */

/** Closer than this to the end, a lesson starts again from the beginning. */
export const RESTART_NEAR_END_SEC = 10;
/** Under this, there's nothing worth resuming. */
export const MIN_RESUME_SEC = 5;

/** Where the player starts: the saved position, unless it is (nearly) at either end. */
export function resumePosition(savedSec: number, durationSec: number): number {
  if (savedSec < MIN_RESUME_SEC) return 0;
  if (durationSec > 0 && savedSec >= durationSec - RESTART_NEAR_END_SEC) return 0;
  return Math.floor(savedSec);
}

export interface PositionSaverOptions {
  /** At most one save per interval while the video plays. */
  intervalMs?: number;
  /** Smaller moves aren't worth a request. */
  minDeltaSec?: number;
  now?: () => number;
}

export interface PositionSaver {
  /** The position the API already has (after the opening save). */
  markSaved(sec: number): void;
  /** The player's current position; saves when the interval has passed. */
  update(sec: number): void;
  /** Saves the latest position now if it moved (pause, end, hiding or leaving the page). */
  flush(keepalive?: boolean): void;
  /** The latest known position (null before any). */
  position(): number | null;
}

/**
 * Throttles position saves: while playing, at most one request per `intervalMs`; on pause, end
 * or leaving, the latest position at once. Nothing is sent before `markSaved` (the opening save)
 * or when the position hasn't moved.
 */
export function createPositionSaver(
  save: (sec: number, keepalive: boolean) => void,
  { intervalMs = 15_000, minDeltaSec = 1, now = Date.now }: PositionSaverOptions = {},
): PositionSaver {
  let saved: number | null = null;
  let latest: number | null = null;
  let savedAt = 0;

  const moved = () => saved !== null && latest !== null && Math.abs(latest - saved) >= minDeltaSec;
  const commit = (keepalive: boolean) => {
    saved = latest!;
    savedAt = now();
    save(Math.round(saved * 10) / 10, keepalive);
  };

  return {
    markSaved(sec) {
      saved = sec;
      latest = sec;
      savedAt = now();
    },
    update(sec) {
      latest = sec;
      if (moved() && now() - savedAt >= intervalMs) commit(false);
    },
    flush(keepalive = false) {
      if (moved()) commit(keepalive);
    },
    position: () => latest,
  };
}
