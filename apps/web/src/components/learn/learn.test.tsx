// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import type { YouTubeProps } from 'react-youtube';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LessonPlayerHandle, LessonPlayer } from './lesson-player';
import { type SplitPane, SplitView } from './split-view';

// The real component loads YouTube's script; the tests drive its events directly.
let youtube: YouTubeProps = {};
vi.mock('react-youtube', () => ({
  default: (props: YouTubeProps) => {
    youtube = props;
    return null;
  },
}));

function fakePlayer(connected = true) {
  return {
    getIframe: () => ({ isConnected: connected }),
    getCurrentTime: vi.fn(() => 42.5),
    seekTo: vi.fn(),
    playVideo: vi.fn(),
  };
}

const PLAYING = 1;
const PAUSED = 2;
type Fake = ReturnType<typeof fakePlayer>;
const ready = (player: Fake) => act(() => youtube.onReady?.({ target: player, data: undefined }));
const state = (player: Fake, data: number) =>
  act(() => youtube.onStateChange?.({ target: player, data }));

afterEach(cleanup);

describe('LessonPlayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const handle = createRef<LessonPlayerHandle>();
    const onPosition = vi.fn();
    const onStop = vi.fn();
    render(
      <LessonPlayer
        ref={handle}
        youtubeId="HXV3zeQKqGY"
        title="SQL"
        startSec={125.7}
        onPosition={onPosition}
        onStop={onStop}
      />,
    );
    return { handle, onPosition, onStop };
  }

  it('starts at the resume position, in privacy-enhanced mode', () => {
    setup();
    expect(youtube.videoId).toBe('HXV3zeQKqGY');
    expect(youtube.opts).toMatchObject({
      host: 'https://www.youtube-nocookie.com',
      playerVars: { start: 125 },
    });
  });

  it('seeks and plays a ready player', () => {
    const { handle } = setup();
    const player = fakePlayer();
    ready(player);
    act(() => handle.current!.seek(156));
    expect(player.seekTo).toHaveBeenCalledWith(156, true);
    expect(player.playVideo).toHaveBeenCalled();
  });

  it('queues a seek until a current player is ready, and keeps it until playback starts', () => {
    const { handle } = setup();
    act(() => handle.current!.seek(2611));
    const replaced = fakePlayer(false); // destroyed before it got ready (e.g. a quick remount)
    ready(replaced);
    expect(replaced.seekTo).not.toHaveBeenCalled();

    const first = fakePlayer();
    ready(first);
    expect(first.seekTo).toHaveBeenCalledWith(2611, true);
    const second = fakePlayer(); // react-youtube swapped its player before playback
    ready(second);
    expect(second.seekTo).toHaveBeenCalledWith(2611, true);

    state(second, PLAYING);
    const later = fakePlayer();
    ready(later);
    expect(later.seekTo).not.toHaveBeenCalled(); // done: playback started
  });

  it('reports the position every second while playing, and on pause', () => {
    const { onPosition, onStop } = setup();
    const player = fakePlayer();
    ready(player);
    state(player, PLAYING);
    act(() => vi.advanceTimersByTime(3_000));
    expect(onPosition).toHaveBeenCalledTimes(3);
    expect(onPosition).toHaveBeenLastCalledWith(42.5);

    state(player, PAUSED);
    expect(onStop).toHaveBeenCalledWith(42.5);
    act(() => vi.advanceTimersByTime(3_000));
    expect(onPosition).toHaveBeenCalledTimes(3); // stopped ticking
  });

  it('ignores events from a player that is no longer on the page', () => {
    const { onPosition, onStop } = setup();
    const stale = fakePlayer(false);
    state(stale, PLAYING);
    state(stale, PAUSED);
    act(() => vi.advanceTimersByTime(3_000));
    expect(onPosition).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  it('explains an embedding refusal and links to YouTube', () => {
    setup();
    act(() => youtube.onError?.({ target: fakePlayer(), data: 150 }));
    expect(screen.getByRole('alert').textContent).toContain('does not allow it to be embedded');
    expect(screen.getByRole('link', { name: /Watch on YouTube/ }).getAttribute('href')).toBe(
      'https://www.youtube.com/watch?v=HXV3zeQKqGY&t=125s',
    );
  });
});

describe('SplitView', () => {
  // An in-memory Storage: Node 25's own (incomplete without --localstorage-file) shadows jsdom's.
  beforeEach(() => {
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, String(value)),
      removeItem: (key: string) => items.delete(key),
      clear: () => items.clear(),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  function Harness() {
    const [pane, setPane] = useState<SplitPane>('video');
    return (
      <SplitView
        video={<p>the video</p>}
        notes={<p>the notes</p>}
        mobilePane={pane}
        onMobilePaneChange={setPane}
      />
    );
  }

  it('resizes from the keyboard within limits and remembers the split', () => {
    render(<Harness />);
    const separator = screen.getByRole('separator', { name: 'Resize the video and notes' });
    expect(separator.getAttribute('aria-valuenow')).toBe('50');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator.getAttribute('aria-valuenow')).toBe('45');
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator.getAttribute('aria-valuenow')).toBe('30');
    expect(window.localStorage.getItem('coursecraft:lesson-split')).toBe('30');

    cleanup();
    render(<Harness />);
    expect(screen.getByRole('separator').getAttribute('aria-valuenow')).toBe('30');
  });

  it('shows one pane at a time on small screens, keeping both mounted', () => {
    render(<Harness />);
    const video = screen.getByRole('region', { name: 'Video' });
    const notes = screen.getByRole('region', { name: 'Notes' });
    const notesButton = screen.getByRole('button', { name: 'Notes' });
    expect(notes.className).toContain('max-lg:hidden');
    expect(video.className).not.toContain('max-lg:hidden');

    fireEvent.click(notesButton);
    expect(notesButton.getAttribute('aria-pressed')).toBe('true');
    expect(video.className).toContain('max-lg:hidden');
    expect(notes.className).not.toContain('max-lg:hidden');
    expect(screen.getByText('the video')).toBeTruthy(); // still mounted: the player survives
  });
});
