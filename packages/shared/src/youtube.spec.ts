import {
  canonicalPlaylistUrl,
  canonicalVideoUrl,
  generateCourseSchema,
  InvalidYoutubeUrlError,
  parseYoutubeUrl,
} from './index.js';

// The same table as services/ai/tests/test_youtube_urls.py: both parsers must agree.
const VID = 'HXV3zeQKqGY';
const PL = 'PLWKjhJtqVAbm3T2Eq1_KgloC7ogdXxdRa';

describe('parseYoutubeUrl (twin of the AI service parser)', () => {
  it.each([
    `https://www.youtube.com/watch?v=${VID}`,
    `https://youtube.com/watch?v=${VID}&t=120s`,
    `http://m.youtube.com/watch?feature=share&v=${VID}`,
    `https://music.youtube.com/watch?v=${VID}`,
    `https://youtu.be/${VID}`,
    `https://youtu.be/${VID}?si=abc123&t=42`,
    `https://www.youtube.com/shorts/${VID}`,
    `https://www.youtube.com/embed/${VID}?start=10`,
    `https://www.youtube-nocookie.com/embed/${VID}`,
    `https://www.youtube.com/live/${VID}`,
    `www.youtube.com/watch?v=${VID}`,
    `  https://WWW.YOUTUBE.COM/watch?v=${VID}  `,
    `https://www.youtube.com/watch?v=${VID}&list=${PL}`,
  ])('accepts the video URL %s', (url) => {
    expect(parseYoutubeUrl(url)).toEqual({ kind: 'video', id: VID });
  });

  it.each([
    `https://www.youtube.com/playlist?list=${PL}`,
    `https://m.youtube.com/playlist?list=${PL}&si=x`,
  ])('accepts the playlist URL %s', (url) => {
    expect(parseYoutubeUrl(url)).toEqual({ kind: 'playlist', id: PL });
  });

  it.each([
    'https://vimeo.com/123456',
    `https://youtube.com.evil.example/watch?v=${VID}`,
    `https://evil.example/?u=https://youtube.com/watch?v=${VID}`,
    `https://user:pass@www.youtube.com/watch?v=${VID}`,
    `https://www.youtube.com:8443/watch?v=${VID}`,
    `ftp://www.youtube.com/watch?v=${VID}`,
    `javascript:alert('${VID}')`,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=HXV3zeQKqGY<script>',
    'https://www.youtube.com/watch',
    'https://www.youtube.com/@freecodecamp',
    'https://www.youtube.com/results?search_query=sql',
    'https://youtu.be/',
    'file:///etc/passwd',
    'http://169.254.169.254/latest/meta-data/',
    '',
    'x'.repeat(3000),
  ])('rejects %s', (url) => {
    expect(() => parseYoutubeUrl(url)).toThrow(InvalidYoutubeUrlError);
  });

  it('builds canonical URLs from ids only', () => {
    expect(canonicalVideoUrl(VID)).toBe(`https://www.youtube.com/watch?v=${VID}`);
    expect(canonicalPlaylistUrl(PL)).toBe(`https://www.youtube.com/playlist?list=${PL}`);
  });
});

describe('generateCourseSchema', () => {
  it('rewrites video URLs to canonical, de-duplicated URLs', () => {
    const parsed = generateCourseSchema.parse({
      domainId: 'd1',
      urls: [`https://youtu.be/${VID}?t=3`, `https://www.youtube.com/watch?v=${VID}`],
      titleHint: '  SQL  ',
    });
    expect(parsed).toEqual({
      domainId: 'd1',
      titleHint: 'SQL',
      source: { urls: [`https://www.youtube.com/watch?v=${VID}`] },
    });
  });

  it('rewrites a playlist URL', () => {
    const parsed = generateCourseSchema.parse({
      domainId: 'd1',
      playlistUrl: `youtube.com/playlist?list=${PL}`,
    });
    expect(parsed.source).toEqual({ playlistUrl: `https://www.youtube.com/playlist?list=${PL}` });
    expect(parsed.titleHint).toBeNull();
  });

  it.each([
    [{ domainId: 'd1' }, 'urls', 'provide either urls or playlistUrl'],
    [
      {
        domainId: 'd1',
        urls: [`https://youtu.be/${VID}`],
        playlistUrl: `https://youtube.com/playlist?list=${PL}`,
      },
      'urls',
      'provide either',
    ],
    [
      { domainId: 'd1', urls: [`https://youtube.com/playlist?list=${PL}`] },
      'urls.0',
      'use playlistUrl',
    ],
    [{ domainId: 'd1', urls: ['ok', 'https://vimeo.com/1'] }, 'urls.1', 'not a supported'],
    [{ domainId: 'd1', playlistUrl: `https://youtu.be/${VID}` }, 'playlistUrl', 'not a playlist'],
  ])('rejects %j', (body, path, message) => {
    const result = generateCourseSchema.safeParse(body);
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path.join('.') === path);
    expect(issue?.message).toContain(message);
  });
});
