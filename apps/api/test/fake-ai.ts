import type {
  IngestMetadataRequest,
  IngestMetadataResponse,
  IngestTranscriptRequest,
  IngestTranscriptResponse,
  ProcessLessonRequest,
  ProcessLessonResponse,
  StructureRequest,
  StructureResponse,
} from '@coursecraft/shared';
import { AiServiceError, type AiErrorKind } from '../src/ai/ai-client.errors.js';

export const fail = (kind: AiErrorKind, message: string) =>
  new AiServiceError(kind, message, 'fake', 'fake-request');

/**
 * The AI service, scripted per video. Counts calls so caching and resuming can be checked.
 * Behaviours by id suffix: `nc*` no captions (404), `bn*` unusable notes (502).
 */
export class FakeAi {
  constructor(private readonly sid: string) {}

  /** When set, lesson processing waits for it (to observe a job while it runs). */
  gate: Promise<void> | undefined;

  calls = { metadata: 0, transcript: new Map<string, number>(), lesson: new Map<string, number>() };
  /** Unusable notes (502) to return once, by YouTube id. */
  lessonFailures = new Set<string>();
  /** Outages to raise once, by YouTube id, at the lesson step. */
  lessonOutages = new Set<string>();
  /** Makes the outline refer to a lesson that doesn't exist (to test the transaction). */
  brokenOutline = false;

  async ingestMetadata(body: IngestMetadataRequest): Promise<IngestMetadataResponse> {
    this.calls.metadata++;
    const ids = 'urls' in body ? body.urls.map((u) => u.slice(-11)) : [];
    const known = ids.filter((id) => id.startsWith(this.sid));
    return {
      videos: known.map((youtubeId) => ({
        youtubeId,
        title: `Video ${youtubeId}`,
        channel: 'E2E',
        durationSec: 600,
        thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        language: 'en',
        chapters: [],
      })),
      failed: ids
        .filter((id) => !id.startsWith(this.sid))
        .map((youtubeId) => ({ youtubeId, reason: 'Video unavailable' })),
      truncated: false,
      maxVideos: 25,
    };
  }

  async ingestTranscript(body: IngestTranscriptRequest): Promise<IngestTranscriptResponse> {
    const n = (this.calls.transcript.get(body.youtubeId) ?? 0) + 1;
    this.calls.transcript.set(body.youtubeId, n);
    if (body.youtubeId.slice(this.sid.length).startsWith('nc'))
      throw fail('rejected', 'no captions');
    const segments = [
      { text: `Intro of ${body.youtubeId}.`, start: 0, duration: 5 },
      { text: 'Main idea explained.', start: 5, duration: 10 },
    ];
    return {
      youtubeId: body.youtubeId,
      source: 'YT_MANUAL',
      language: 'en',
      translatedFrom: null,
      fetchedWith: 'youtube-transcript-api',
      segmentCount: segments.length,
      coveredSec: 15,
      segments,
    };
  }

  async processLesson(body: ProcessLessonRequest): Promise<ProcessLessonResponse> {
    this.calls.lesson.set(body.youtubeId, (this.calls.lesson.get(body.youtubeId) ?? 0) + 1);
    await this.gate;
    if (this.lessonOutages.delete(body.youtubeId)) throw fail('unavailable', 'Ollama down');
    if (this.lessonFailures.delete(body.youtubeId)) throw fail('bad_output', 'notes failed');
    if (body.youtubeId.slice(this.sid.length).startsWith('bn'))
      throw fail('bad_output', 'notes failed');
    return {
      courseId: body.courseId,
      lessonId: body.lessonId,
      chatModel: 'fake-llm',
      embeddingModel: 'fake-embed',
      chunks: body.segments.map((s, index) => ({
        id: `${body.lessonId}-${index}`,
        index,
        text: s.text,
        startSec: s.start,
        endSec: s.start + s.duration,
        tokenCount: 5,
        overlapChars: 0,
      })),
      notes: {
        title: `Lesson about ${body.youtubeId}`,
        summary: `Summary of ${body.youtubeId}.`,
        keyConcepts: ['Idea'],
        notesMarkdown: `## Summary\nNotes for ${body.youtubeId} [▶ 0:05]\n`,
        readingTimeMin: 2,
        anchors: [5],
        promptIds: ['lesson-notes-map@2', 'lesson-notes-reduce@2'],
      },
      usage: { llmCalls: 2, inputTokens: 100, outputTokens: 50 },
      elapsedSec: 1,
    };
  }

  async processStructure(body: StructureRequest): Promise<StructureResponse> {
    const refs = body.lessons.map((l) => l.ref);
    const half = Math.ceil(refs.length / 2);
    const modules = [
      { title: 'Foundations', summary: 'First part.', lessonRefs: refs.slice(0, half) },
      { title: 'Going further', summary: 'Second part.', lessonRefs: refs.slice(half) },
    ].filter((m) => m.lessonRefs.length > 0);
    if (this.brokenOutline) modules[0]?.lessonRefs.push('no-such-lesson');
    return {
      title: `E2E ${this.sid} ${body.domain} Course`,
      description: 'A generated course.',
      level: 'Beginner',
      modules,
      repairs: [],
      fallback: false,
      promptId: 'course-structure@1',
      chatModel: 'fake-llm',
      usage: { llmCalls: 1, inputTokens: 40, outputTokens: 20 },
    };
  }
}
