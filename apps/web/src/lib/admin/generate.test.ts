import type { IngestionEvent, JobDetail } from '@coursecraft/shared';
import { describe, expect, it } from 'vitest';
import { buildGenerateBody, parsePlaylist, parseVideoLines } from './generate';
import {
  applyEvent,
  currentVideoPosition,
  isActive,
  needsSnapshot,
  stepStates,
  truncationNote,
} from './job-progress';

const VID = 'HXV3zeQKqGY';
const PL = 'PLWKjhJtqVAbm3T2Eq1_KgloC7ogdXxdRa';

describe('parseVideoLines', () => {
  it('canonicalises, de-duplicates and reports bad lines by number', () => {
    const parsed = parseVideoLines(
      [
        `https://youtu.be/${VID}?t=4`,
        '',
        `https://www.youtube.com/watch?v=${VID}`,
        'https://vimeo.com/1',
        `https://youtube.com/playlist?list=${PL}`,
        'Tk1t3WKK-ZY',
      ].join('\n'),
    );
    expect(parsed.urls).toEqual([`https://www.youtube.com/watch?v=${VID}`]);
    expect(parsed.duplicates).toBe(1);
    expect(parsed.problems).toEqual([
      { line: 4, message: 'not a YouTube video URL' },
      { line: 5, message: 'this is a playlist: use "Playlist URL" instead' },
      { line: 6, message: 'not a YouTube video URL' }, // a bare id is not a URL
    ]);
  });
});

describe('parsePlaylist', () => {
  it('accepts playlist URLs only', () => {
    expect(parsePlaylist(` youtube.com/playlist?list=${PL} `)).toEqual({
      url: `https://www.youtube.com/playlist?list=${PL}`,
    });
    expect(parsePlaylist(`https://youtu.be/${VID}`)).toHaveProperty('error');
    expect(parsePlaylist('')).toEqual({ error: 'Paste a playlist URL' });
  });
});

describe('buildGenerateBody', () => {
  const base = {
    domainId: 'd1',
    mode: 'videos' as const,
    urlsText: `youtu.be/${VID}`,
    playlistUrl: '',
    titleHint: '',
  };

  it('builds the API body from the chosen source', () => {
    expect(buildGenerateBody(base)).toEqual({
      body: { domainId: 'd1', urls: [`https://www.youtube.com/watch?v=${VID}`] },
    });
    expect(
      buildGenerateBody({
        ...base,
        mode: 'playlist',
        playlistUrl: `https://www.youtube.com/playlist?list=${PL}`,
        titleHint: ' SQL ',
      }),
    ).toEqual({
      body: {
        domainId: 'd1',
        playlistUrl: `https://www.youtube.com/playlist?list=${PL}`,
        titleHint: 'SQL',
      },
    });
  });

  it('collects every error', () => {
    expect(
      buildGenerateBody({ ...base, domainId: '', urlsText: 'nope\n\nhttps://vimeo.com/2' }),
    ).toEqual({
      errors: {
        domainId: 'Choose a domain',
        urlsText: 'Line 1: not a YouTube video URL\nLine 3: not a YouTube video URL',
      },
    });
    expect(buildGenerateBody({ ...base, urlsText: '  ' })).toEqual({
      errors: { urlsText: 'Paste at least one YouTube video URL' },
    });
  });
});

const job = (over: Partial<JobDetail> = {}): JobDetail => ({
  id: 'j1',
  status: 'RUNNING',
  stage: 'TRANSCRIPT',
  progress: 10,
  error: null,
  report: null,
  createdAt: '2026-10-11T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  course: { id: 'c1', title: 'T', slug: 't', status: 'GENERATING' },
  videos: [
    { position: 0, youtubeId: 'a', title: 'A', status: 'PENDING', error: null },
    { position: 1, youtubeId: 'b', title: 'B', status: 'PENDING', error: null },
  ],
  ...over,
});
const event = (over: Partial<IngestionEvent> = {}): IngestionEvent => ({
  jobId: 'j1',
  courseId: 'c1',
  status: 'RUNNING',
  stage: 'TRANSCRIPT',
  progress: 15,
  at: '2026-10-11T10:00:01.000Z',
  ...over,
});

describe('job progress', () => {
  it('applies stage, progress and one video at a time', () => {
    const next = applyEvent(
      job(),
      event({
        video: {
          position: 1,
          youtubeId: 'b',
          title: null,
          status: 'FAILED',
          error: 'rejected: no captions',
        },
      }),
    );
    expect(next.progress).toBe(15);
    expect(next.videos[0]?.status).toBe('PENDING');
    expect(next.videos[1]).toEqual({
      position: 1,
      youtubeId: 'b',
      title: 'B',
      status: 'FAILED',
      error: 'rejected: no captions',
    });
  });

  it('never moves progress backwards, except when the job is requeued', () => {
    expect(applyEvent(job({ progress: 50 }), event({ progress: 40 })).progress).toBe(50);
    expect(
      applyEvent(job({ progress: 50 }), event({ status: 'QUEUED', progress: 40 })).progress,
    ).toBe(40);
  });

  it('ignores events of another job', () => {
    const before = job();
    expect(applyEvent(before, event({ jobId: 'other', progress: 99 }))).toBe(before);
  });

  it('asks for a fresh snapshot when the stage changes or a video is unknown', () => {
    expect(needsSnapshot(job(), event())).toBe(false);
    expect(
      needsSnapshot(job({ stage: 'METADATA', videos: [] }), event({ stage: 'TRANSCRIPT' })),
    ).toBe(true);
    expect(
      needsSnapshot(
        job(),
        event({
          video: { position: 7, youtubeId: 'z', title: null, status: 'FAILED', error: 'x' },
        }),
      ),
    ).toBe(true);
    expect(needsSnapshot(job(), event({ jobId: 'other', stage: 'NOTES' }))).toBe(false);
  });

  it('marks only the video being worked on as current', () => {
    const videos = [
      { position: 0, youtubeId: 'a', title: null, status: 'PROCESSED' as const, error: null },
      { position: 1, youtubeId: 'b', title: null, status: 'TRANSCRIBED' as const, error: null },
      { position: 2, youtubeId: 'c', title: null, status: 'TRANSCRIBED' as const, error: null },
    ];
    expect(currentVideoPosition(job({ stage: 'NOTES', videos }))).toBe(1);
    expect(currentVideoPosition(job({ stage: 'TRANSCRIPT', videos }))).toBeNull();
    expect(currentVideoPosition(job({ stage: 'NOTES', status: 'QUEUED', videos }))).toBeNull();
  });

  it('derives the stepper', () => {
    expect(stepStates({ stage: 'NOTES', status: 'RUNNING' })).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
      'upcoming',
    ]);
    expect(stepStates({ stage: 'NOTES', status: 'FAILED' })).toEqual([
      'done',
      'done',
      'failed',
      'upcoming',
      'upcoming',
    ]);
    expect(stepStates({ stage: null, status: 'QUEUED' })).toEqual(Array(5).fill('upcoming'));
    expect(stepStates({ stage: 'DONE', status: 'SUCCEEDED' })).toEqual(Array(5).fill('done'));
  });

  it('knows when to keep listening and when the input was truncated', () => {
    expect(isActive({ status: 'QUEUED' })).toBe(true);
    expect(isActive({ status: 'FAILED' })).toBe(false);
    expect(truncationNote({ report: { truncated: true, maxVideos: 25 } })).toMatch(
      /first 25 videos/,
    );
    expect(truncationNote({ report: { truncated: false, maxVideos: 25 } })).toBeNull();
  });
});
