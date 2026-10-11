import {
  canonicalPlaylistUrl,
  canonicalVideoUrl,
  type GenerateCourseBody,
  InvalidYoutubeUrlError,
  parseYoutubeUrl,
} from '@coursecraft/shared';

export type SourceMode = 'videos' | 'playlist';

export interface UrlLineProblem {
  line: number;
  message: string;
}

export interface ParsedVideoLines {
  /** Canonical watch URLs, in order, without duplicates. */
  urls: string[];
  problems: UrlLineProblem[];
  duplicates: number;
}

/**
 * The textarea's lines → canonical video URLs, with a problem per bad line (1-based line numbers,
 * blank lines ignored). Uses the same strict parser as the API and the AI service.
 */
export function parseVideoLines(text: string): ParsedVideoLines {
  const seen = new Set<string>();
  const urls: string[] = [];
  const problems: UrlLineProblem[] = [];
  let duplicates = 0;
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    try {
      const ref = parseYoutubeUrl(line);
      if (ref.kind === 'playlist') {
        problems.push({
          line: index + 1,
          message: 'this is a playlist: use "Playlist URL" instead',
        });
        return;
      }
      const url = canonicalVideoUrl(ref.id);
      if (seen.has(url)) {
        duplicates++;
        return;
      }
      seen.add(url);
      urls.push(url);
    } catch (error) {
      const message =
        error instanceof InvalidYoutubeUrlError ? 'not a YouTube video URL' : 'invalid URL';
      problems.push({ line: index + 1, message });
    }
  });
  return { urls, problems, duplicates };
}

/** A playlist URL → its canonical form, or an error message. */
export function parsePlaylist(text: string): { url: string } | { error: string } {
  const value = text.trim();
  if (!value) return { error: 'Paste a playlist URL' };
  try {
    const ref = parseYoutubeUrl(value);
    if (ref.kind !== 'playlist') {
      return { error: 'This is a single video: use "Video URLs", or paste a /playlist?list= URL' };
    }
    return { url: canonicalPlaylistUrl(ref.id) };
  } catch {
    return { error: 'Not a YouTube playlist URL (https://www.youtube.com/playlist?list=…)' };
  }
}

export interface GenerateFormValues {
  domainId: string;
  mode: SourceMode;
  urlsText: string;
  playlistUrl: string;
  titleHint: string;
}

export type FormErrors = Partial<Record<'domainId' | 'urlsText' | 'playlistUrl', string>>;

/** Validates the whole form; returns the API body or the errors to show. */
export function buildGenerateBody(
  values: GenerateFormValues,
): { body: GenerateCourseBody } | { errors: FormErrors } {
  const errors: FormErrors = {};
  if (!values.domainId) errors.domainId = 'Choose a domain';
  let source: Pick<GenerateCourseBody, 'urls' | 'playlistUrl'> = {};
  if (values.mode === 'videos') {
    const parsed = parseVideoLines(values.urlsText);
    if (parsed.problems.length > 0) {
      errors.urlsText = parsed.problems.map((p) => `Line ${p.line}: ${p.message}`).join('\n');
    } else if (parsed.urls.length === 0) {
      errors.urlsText = 'Paste at least one YouTube video URL';
    } else {
      source = { urls: parsed.urls };
    }
  } else {
    const parsed = parsePlaylist(values.playlistUrl);
    if ('error' in parsed) errors.playlistUrl = parsed.error;
    else source = { playlistUrl: parsed.url };
  }
  if (Object.keys(errors).length > 0) return { errors };
  const titleHint = values.titleHint.trim();
  return {
    body: { domainId: values.domainId, ...source, ...(titleHint && { titleHint }) },
  };
}
