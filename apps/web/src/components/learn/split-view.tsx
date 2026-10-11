'use client';

import { type CSSProperties, type ReactNode, useRef, useState } from 'react';
import {
  parseStoredSplit,
  SPLIT_MAX,
  SPLIT_MIN,
  splitFromKey,
  splitFromPointer,
} from '@/lib/learning/split';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'coursecraft:lesson-split';
const PANE_LABELS = { video: 'Video', notes: 'Notes' } as const;

export type SplitPane = 'video' | 'notes';

function readStoredSplit(): number {
  try {
    return parseStoredSplit(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseStoredSplit(null); // storage blocked (private mode, disabled site data)
  }
}

function storeSplit(percent: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(percent));
  } catch {
    // A convenience only: the default split works without it.
  }
}

interface Props {
  video: ReactNode;
  notes: ReactNode;
  /** The pane shown on small screens, where only one fits. */
  mobilePane: SplitPane;
  onMobilePaneChange: (pane: SplitPane) => void;
}

/**
 * Video beside notes on large screens, with a draggable divider (WAI-ARIA window splitter:
 * arrow keys, Home/End, Enter resets). On small screens a switch shows one pane at a time.
 * Both panes stay mounted in every layout, so the player is never recreated.
 */
export function SplitView({ video, notes, mobilePane, onMobilePaneChange }: Props) {
  const row = useRef<HTMLDivElement>(null);
  // Rendered only on the client (after the lesson loads), so storage can be read up front.
  const [split, setSplit] = useState(readStoredSplit);
  const [dragging, setDragging] = useState(false);

  const moveTo = (percent: number) => {
    setSplit(percent);
    storeSplit(percent);
  };

  return (
    <div>
      <div
        role="group"
        aria-label="Show"
        className="sticky top-14 z-20 flex border-b bg-background/95 backdrop-blur lg:hidden"
      >
        {(['video', 'notes'] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            aria-pressed={mobilePane === pane}
            aria-controls={`lesson-${pane}`}
            onClick={() => onMobilePaneChange(pane)}
            className={cn(
              'flex-1 border-b-2 py-2.5 text-sm font-medium',
              mobilePane === pane
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {PANE_LABELS[pane]}
          </button>
        ))}
      </div>
      <div
        ref={row}
        style={{ '--split': `${split}%` } as CSSProperties}
        className={cn(
          'lg:flex lg:h-[calc(100dvh-3.5rem)]',
          // The iframe would swallow pointer events mid-drag.
          dragging && 'cursor-col-resize select-none [&_iframe]:pointer-events-none',
        )}
      >
        <section
          id="lesson-video"
          aria-label="Video"
          className={cn(
            'lg:w-(--split) lg:shrink-0 lg:overflow-y-auto',
            mobilePane !== 'video' && 'max-lg:hidden',
          )}
        >
          {video}
        </section>
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize the video and notes"
          aria-controls="lesson-video"
          aria-valuenow={split}
          aria-valuemin={SPLIT_MIN}
          aria-valuemax={SPLIT_MAX}
          className="group hidden w-3 shrink-0 cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(true);
          }}
          onPointerMove={(event) => {
            if (dragging && row.current) {
              setSplit(splitFromPointer(event.clientX, row.current.getBoundingClientRect()));
            }
          }}
          onPointerUp={() => {
            setDragging(false);
            storeSplit(split);
          }}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={(event) => {
            const next = splitFromKey(split, event.key);
            if (next !== null) {
              event.preventDefault();
              moveTo(next);
            }
          }}
        >
          <span
            className={cn(
              'h-full w-px bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:w-0.5 group-focus-visible:bg-ring',
              dragging && 'bg-primary',
            )}
          />
        </div>
        <section
          id="lesson-notes"
          aria-label="Notes"
          className={cn(
            'lg:min-w-0 lg:flex-1 lg:overflow-y-auto',
            mobilePane !== 'notes' && 'max-lg:hidden',
          )}
        >
          {notes}
        </section>
      </div>
    </div>
  );
}
