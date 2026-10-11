'use client';

import { ExternalLinkIcon } from 'lucide-react';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import YouTube, { type YouTubeEvent, type YouTubeProps } from 'react-youtube';

/**
 * The IFrame Player API methods used here. react-youtube passes the API's own events, whose
 * `target` is the synchronous `YT.Player` (not youtube-player's promise wrapper); neither ships
 * TypeScript types, so it arrives as `any`.
 */
interface Player {
  getIframe(): HTMLIFrameElement | null;
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
}

export interface LessonPlayerHandle {
  /** Jumps to `seconds` and plays (queued until the player is ready). */
  seek(seconds: number): void;
}

/**
 * react-youtube can replace its player before the first one is used (a quick remount, or Strict
 * Mode in development), and the old one still reports events. Only a player whose iframe is on
 * the page counts; a queued seek is re-applied on `ready` until playback really starts.
 */
const isCurrent = (target: Player) => target.getIframe()?.isConnected === true;

/** YT.PlayerState values. */
const ENDED = 0;
const PLAYING = 1;
const PAUSED = 2;

/** IFrame API error codes (https://developers.google.com/youtube/iframe_api_reference#onError). */
function errorMessage(code: number): string {
  if (code === 101 || code === 150)
    return 'The owner of this video does not allow it to be embedded.';
  if (code === 100) return 'This video is no longer available on YouTube.';
  return 'The video could not be played here.';
}

interface Props {
  youtubeId: string;
  title: string;
  /** Where playback starts (the resume position). Read once, when the player is created. */
  startSec: number;
  /** About once a second while playing. */
  onPosition: (seconds: number) => void;
  /** When playback pauses or ends. */
  onStop: (seconds: number) => void;
  ref?: Ref<LessonPlayerHandle>;
}

/**
 * The lesson's YouTube video (react-youtube over the IFrame Player API), in privacy-enhanced
 * mode (youtube-nocookie.com). Reports the position while playing and can be told to seek.
 */
export function LessonPlayer({ youtubeId, title, startSec, onPosition, onStop, ref }: Props) {
  const player = useRef<Player | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // react-youtube reloads the video when `opts` changes, so they are fixed at mount.
  const [opts] = useState<YouTubeProps['opts']>(() => ({
    host: 'https://www.youtube-nocookie.com',
    playerVars: { start: Math.floor(startSec), rel: 0, playsinline: 1 },
  }));

  const seekNow = (target: Player, seconds: number) => {
    target.seekTo(seconds, true);
    target.playVideo();
  };

  useImperativeHandle(ref, () => ({
    seek(seconds) {
      pendingSeek.current = seconds;
      if (player.current && isCurrent(player.current)) seekNow(player.current, seconds);
    },
  }));

  useEffect(() => () => clearInterval(ticker.current), []);

  const onReady = (event: YouTubeEvent) => {
    const target = event.target as Player;
    if (!isCurrent(target)) return;
    player.current = target;
    if (pendingSeek.current !== null) seekNow(target, pendingSeek.current);
  };

  const onStateChange = (event: YouTubeEvent<number>) => {
    const target = event.target as Player;
    if (!isCurrent(target)) return;
    clearInterval(ticker.current);
    if (event.data === PLAYING) {
      pendingSeek.current = null;
      ticker.current = setInterval(() => onPosition(target.getCurrentTime()), 1_000);
    } else if (event.data === PAUSED || event.data === ENDED) {
      onStop(target.getCurrentTime());
    }
  };

  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}&t=${Math.floor(startSec)}s`;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <YouTube
        videoId={youtubeId}
        title={title}
        opts={opts}
        className="absolute inset-0"
        iframeClassName="size-full"
        onReady={onReady}
        onStateChange={onStateChange}
        onError={(event: YouTubeEvent<number>) => setError(errorMessage(event.data))}
      />
      {error && (
        <div
          role="alert"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 text-center text-sm text-white"
        >
          <p>{error}</p>
          <a
            href={watchUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-4"
          >
            Watch on YouTube <ExternalLinkIcon className="size-3.5" aria-hidden />
          </a>
        </div>
      )}
    </div>
  );
}
