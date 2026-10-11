import {
  aiHealthSchema,
  deleteVectorsResponseSchema,
  errorResponseSchema,
  ingestMetadataRequestSchema,
  ingestMetadataResponseSchema,
  ingestTranscriptResponseSchema,
  processLessonRequestSchema,
  processLessonResponseSchema,
  ragAnswerRequestSchema,
  ragStreamEvents,
  structureRequestSchema,
  structureResponseSchema,
  vectorSearchResponseSchema,
} from './index.js';
import health from './fixtures/ai/health.json' with { type: 'json' };
import ingestMetadata from './fixtures/ai/ingest-metadata.json' with { type: 'json' };
import ingestTranscript from './fixtures/ai/ingest-transcript.json' with { type: 'json' };
import processLesson from './fixtures/ai/process-lesson.json' with { type: 'json' };
import processStructure from './fixtures/ai/process-structure.json' with { type: 'json' };
import vectorSearch from './fixtures/ai/vector-search.json' with { type: 'json' };
import vectorDeleteLesson from './fixtures/ai/vector-delete-lesson.json' with { type: 'json' };
import vectorDeleteCourse from './fixtures/ai/vector-delete-course.json' with { type: 'json' };
import error422 from './fixtures/ai/error-422.json' with { type: 'json' };
import ragGrounded from './fixtures/ai/rag-answer-grounded.json' with { type: 'json' };
import ragRefused from './fixtures/ai/rag-answer-refused.json' with { type: 'json' };

/** Real responses captured from the running AI service (#26), trimmed to a few items. */
const FIXTURES: Record<string, unknown> = {
  health: health,
  'ingest-metadata': ingestMetadata,
  'ingest-transcript': ingestTranscript,
  'process-lesson': processLesson,
  'process-structure': processStructure,
  'vector-search': vectorSearch,
  'vector-delete-lesson': vectorDeleteLesson,
  'vector-delete-course': vectorDeleteCourse,
  'error-422': error422,
};

function fixture(name: string): unknown {
  return FIXTURES[name];
}

describe('AI service responses (captured from the real service)', () => {
  it.each([
    ['health', aiHealthSchema],
    ['ingest-metadata', ingestMetadataResponseSchema],
    ['ingest-transcript', ingestTranscriptResponseSchema],
    ['process-lesson', processLessonResponseSchema],
    ['process-structure', structureResponseSchema],
    ['vector-search', vectorSearchResponseSchema],
    ['vector-delete-lesson', deleteVectorsResponseSchema],
    ['vector-delete-course', deleteVectorsResponseSchema],
    ['error-422', errorResponseSchema],
  ] as const)('%s matches its schema', (name, schema) => {
    const result = schema.safeParse(fixture(name));
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('reports metadata failures separately from videos', () => {
    const body = ingestMetadataResponseSchema.parse(fixture('ingest-metadata'));
    expect(body.videos.map((v) => v.youtubeId)).toEqual(['Tk1t3WKK-ZY']);
    expect(body.failed.map((f) => f.youtubeId)).toEqual(['AAAAAAAAAAA']);
  });
});

describe('AI service requests', () => {
  it('needs exactly one metadata source', () => {
    expect(ingestMetadataRequestSchema.safeParse({ urls: ['https://youtu.be/x'] }).success).toBe(
      true,
    );
    expect(ingestMetadataRequestSchema.safeParse({ playlistUrl: 'https://x' }).success).toBe(true);
    expect(
      ingestMetadataRequestSchema.safeParse({ urls: ['a'], playlistUrl: 'https://x' }).success,
    ).toBe(false);
    expect(ingestMetadataRequestSchema.safeParse({}).success).toBe(false);
  });

  it('validates ids the AI service would reject', () => {
    const lesson = {
      courseId: 'ckcourse1',
      lessonId: 'cklesson1',
      youtubeId: 'Tk1t3WKK-ZY',
      videoTitle: 'What is a database',
      segments: [{ text: 'hi', start: 0, duration: 1 }],
    };
    expect(processLessonRequestSchema.safeParse(lesson).success).toBe(true);
    expect(processLessonRequestSchema.safeParse({ ...lesson, lessonId: '../x' }).success).toBe(
      false,
    );
    expect(processLessonRequestSchema.safeParse({ ...lesson, segments: [] }).success).toBe(false);
  });

  it('accepts a structure request with optional fields', () => {
    expect(
      structureRequestSchema.safeParse({
        domain: 'Databases',
        lessons: [{ ref: 'l1', title: 'Intro' }],
      }).success,
    ).toBe(true);
  });
});

describe('RAG answer streams (captured from the real service, #39)', () => {
  type Stream = { request: unknown; events: { event: string; data: unknown }[] };
  const parse = (stream: Stream) =>
    stream.events.map(({ event, data }) => {
      expect(Object.keys(ragStreamEvents)).toContain(event);
      return { event, data: ragStreamEvents[event as keyof typeof ragStreamEvents].parse(data) };
    });

  it('a grounded answer streams tokens, then done with citations it actually uses', () => {
    expect(ragAnswerRequestSchema.safeParse(ragGrounded.request).success).toBe(true);
    const events = parse(ragGrounded as Stream);
    const done = ragStreamEvents.done.parse(events.at(-1)!.data);
    expect(events.slice(0, -1).every((e) => e.event === 'token')).toBe(true);
    const streamed = events
      .slice(0, -1)
      .map((e) => ragStreamEvents.token.parse(e.data).text)
      .join('');
    expect(streamed.trim()).toBe(done.answer);
    expect(done.grounded).toBe(true);
    expect(done.citations.length).toBeGreaterThan(0);
    for (const citation of done.citations) {
      expect(done.answer).toContain(`[${citation.n}]`);
      expect(citation.endSec).toBeGreaterThan(citation.startSec);
    }
    expect(done.bestScore).toBeGreaterThanOrEqual(done.minScore);
  });

  it('an off-scope question is refused without calling the model', () => {
    const events = parse(ragRefused as Stream);
    expect(events.map((e) => e.event)).toEqual(['token', 'done']);
    const done = ragStreamEvents.done.parse(events[1]!.data);
    expect(done).toMatchObject({ grounded: false, refusal: 'low_score', citations: [] });
    expect(done.usage.llmCalls).toBe(0);
    expect(done.bestScore!).toBeLessThan(done.minScore);
  });
});
