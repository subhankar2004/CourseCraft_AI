/**
 * Strict YouTube URL parsing, the TypeScript twin of services/ai/app/ingestion/youtube_urls.py
 * (keep them in sync). Used by the API to validate generation requests and by the web form.
 * Only ids extracted here are ever used; canonical URLs are rebuilt from them.
 */
export interface YoutubeRef {
  kind: 'video' | 'playlist';
  id: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const WATCH_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);
const SHORT_HOSTS = new Set(['youtu.be']);
const EMBED_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com']);
const PATH_ID_PREFIXES = ['/shorts/', '/embed/', '/live/', '/v/'];

export class InvalidYoutubeUrlError extends Error {
  override readonly name = 'InvalidYoutubeUrlError';
}

export const canonicalVideoUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
export const canonicalPlaylistUrl = (id: string) => `https://www.youtube.com/playlist?list=${id}`;

/** Accepts watch, youtu.be, shorts, embed, live and playlist URLs. Throws otherwise. */
export function parseYoutubeUrl(raw: string): YoutubeRef {
  let text = raw.trim();
  if (text.length > 2048) throw new InvalidYoutubeUrlError('URL is too long');
  if (!text.includes('://')) text = `https://${text}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new InvalidYoutubeUrlError(`not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidYoutubeUrlError(`unsupported scheme in ${raw}`);
  }
  if (url.username || url.password || !['', '80', '443'].includes(url.port)) {
    throw new InvalidYoutubeUrlError(`credentials or unusual ports are not allowed: ${raw}`);
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  let candidate: YoutubeRef['kind'];
  let value: string | null;
  if (SHORT_HOSTS.has(host)) {
    candidate = 'video';
    value = path.replace(/^\/+|\/+$/g, '').split('/')[0] || null;
  } else if (WATCH_HOSTS.has(host) && (path === '/watch' || path === '/watch/')) {
    candidate = 'video';
    value = url.searchParams.get('v');
  } else if (WATCH_HOSTS.has(host) && (path === '/playlist' || path === '/playlist/')) {
    candidate = 'playlist';
    value = url.searchParams.get('list');
  } else if (
    (WATCH_HOSTS.has(host) || EMBED_HOSTS.has(host)) &&
    PATH_ID_PREFIXES.some((prefix) => path.startsWith(prefix))
  ) {
    candidate = 'video';
    value = path.split('/')[2] || null;
  } else {
    throw new InvalidYoutubeUrlError(`not a supported YouTube video or playlist URL: ${raw}`);
  }
  const pattern = candidate === 'video' ? VIDEO_ID : PLAYLIST_ID;
  if (value === null || !pattern.test(value)) {
    throw new InvalidYoutubeUrlError(`missing or malformed ${candidate} id in ${raw}`);
  }
  return { kind: candidate, id: value };
}
