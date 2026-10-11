import { z } from 'zod';

/**
 * Contracts of the internal AI service (SPEC §8.2), used by the API's AiClient (#26).
 * Mirrors services/ai/app/schemas.py; change both sides in the same PR (AGENTS.md).
 * Responses are validated when they arrive, so a drifted contract fails loudly at the boundary.
 */

const youtubeId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
/** Database ids (Prisma cuid) and other path identifiers the AI service accepts. */
export const aiIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// ─── Ingestion ──────────────────────────────────────────────────────────────

export const ingestMetadataRequestSchema = z.union([
  z.strictObject({ urls: z.array(z.string()).min(1).max(200) }),
  z.strictObject({ playlistUrl: z.string() }),
]);

export const videoMetadataSchema = z.object({
  youtubeId,
  title: z.string(),
  channel: z.string().nullable(),
  durationSec: z.number().int(),
  thumbnailUrl: z.string(),
  language: z.string().nullable(),
  chapters: z.array(z.object({ startSec: z.number(), title: z.string() })),
});

export const ingestMetadataResponseSchema = z.object({
  videos: z.array(videoMetadataSchema),
  failed: z.array(z.object({ youtubeId: z.string(), reason: z.string() })),
  truncated: z.boolean(),
  maxVideos: z.number().int(),
});

export const ingestTranscriptRequestSchema = z.strictObject({
  youtubeId,
  spokenLanguage: z.string().nullable().optional(),
});

export const transcriptSegmentSchema = z.object({
  text: z.string(),
  start: z.number().min(0),
  duration: z.number().min(0),
});

export const transcriptSourceSchema = z.enum(['YT_MANUAL', 'YT_AUTO', 'WHISPER']);

export const ingestTranscriptResponseSchema = z.object({
  youtubeId,
  source: transcriptSourceSchema,
  language: z.string(),
  translatedFrom: z.string().nullable(),
  fetchedWith: z.enum(['youtube-transcript-api', 'yt-dlp', 'whisper']),
  segmentCount: z.number().int(),
  coveredSec: z.number(),
  segments: z.array(transcriptSegmentSchema),
});

// ─── Processing ─────────────────────────────────────────────────────────────

export const chunkSchema = z.object({
  /** `{lessonId}-{index}`: the API stores its Chunk row under the same id. */
  id: z.string(),
  index: z.number().int().min(0),
  text: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  tokenCount: z.number().int(),
  overlapChars: z.number().int(),
});

export const usageSchema = z.object({
  llmCalls: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
});

export const processLessonRequestSchema = z.strictObject({
  courseId: aiIdSchema,
  /** Allocated by the API before processing; the Lesson row is created with it (#24). */
  lessonId: aiIdSchema,
  youtubeId,
  videoTitle: z.string().min(1).max(300),
  segments: z.array(transcriptSegmentSchema).min(1).max(50_000),
});

export const lessonNotesSchema = z.object({
  title: z.string(),
  summary: z.string(),
  keyConcepts: z.array(z.string()),
  notesMarkdown: z.string(),
  readingTimeMin: z.number().int().min(1),
  anchors: z.array(z.number()),
  promptIds: z.array(z.string()),
});

export const processLessonResponseSchema = z.object({
  courseId: z.string(),
  lessonId: z.string(),
  chatModel: z.string(),
  embeddingModel: z.string(),
  chunks: z.array(chunkSchema),
  notes: lessonNotesSchema,
  usage: usageSchema,
  elapsedSec: z.number(),
});

export const structureRequestSchema = z.strictObject({
  domain: z.string().min(1).max(100),
  titleHint: z.string().max(300).nullable().optional(),
  lessons: z
    .array(
      z.strictObject({
        ref: aiIdSchema,
        title: z.string().min(1).max(300),
        summary: z.string().max(4000).optional(),
        keyConcepts: z.array(z.string()).max(20).optional(),
      }),
    )
    .min(1)
    .max(200),
});

export const structureResponseSchema = z.object({
  title: z.string(),
  description: z.string(),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced']).nullable(),
  modules: z.array(
    z.object({ title: z.string(), summary: z.string(), lessonRefs: z.array(z.string()) }),
  ),
  repairs: z.array(z.string()),
  fallback: z.boolean(),
  promptId: z.string(),
  chatModel: z.string(),
  usage: usageSchema,
});

// ─── Vectors ────────────────────────────────────────────────────────────────

export const vectorSearchRequestSchema = z.strictObject({
  query: z.string().min(1).max(2000),
  k: z.number().int().min(1).max(50).optional(),
});

export const vectorSearchResponseSchema = z.object({
  courseId: z.string(),
  hits: z.array(
    z.object({
      id: z.string(),
      lessonId: z.string(),
      youtubeId: z.string(),
      chunkIndex: z.number().int(),
      startSec: z.number(),
      endSec: z.number(),
      lessonTitle: z.string(),
      text: z.string(),
      score: z.number(),
    }),
  ),
});

export const deleteVectorsResponseSchema = z.object({
  courseId: z.string(),
  lessonId: z.string().optional(),
  deleted: z.number().int(),
});

// ─── RAG chat (#39) ─────────────────────────────────────────────────────────

export const chatTurnSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(8000),
});

/** `POST /rag/answer`: answered as Server-Sent Events (`token`…, then `done` or `failed`). */
export const ragAnswerRequestSchema = z.strictObject({
  courseId: aiIdSchema,
  question: z.string().trim().min(1).max(2000),
  /** Earlier turns, oldest first. */
  history: z.array(chatTurnSchema).max(20).default([]),
});

export const ragTokenEventSchema = z.object({ text: z.string() });

/**
 * A passage the answer cites as [n] (or was given, in `sources`): lesson + time range for a deep
 * link into the split view. A passage can span neighbouring chunks of one lesson (#40).
 */
export const ragCitationSchema = z.object({
  n: z.number().int().positive(),
  /** The passage's first chunk. */
  chunkId: z.string(),
  chunkIds: z.array(z.string()).min(1),
  lessonId: z.string(),
  /** The title when the lesson was indexed; show the API's current title instead. */
  lessonTitle: z.string(),
  youtubeId: z.string(),
  startSec: z.number(),
  endSec: z.number(),
  score: z.number(),
});

export const ragRefusalSchema = z.enum(['not_indexed', 'low_score', 'not_in_context']);

export const ragDoneEventSchema = z.object({
  grounded: z.boolean(),
  /** The final answer: [n] markers that point to no passage are removed. */
  answer: z.string(),
  /** The passages the answer cites, in order of first citation. */
  citations: z.array(ragCitationSchema),
  /** Every passage the model was given (empty when refused). */
  sources: z.array(ragCitationSchema),
  /** The follow-up rewritten as a standalone question (what retrieval used); null if not. */
  standaloneQuestion: z.string().nullable(),
  /** Best retrieval similarity; null when the course has no chunks. */
  bestScore: z.number().nullable(),
  /** Why the answer is the fixed refusal; null when grounded. */
  refusal: ragRefusalSchema.nullable(),
  minScore: z.number(),
  promptIds: z.array(z.string()),
  chatModel: z.string(),
  embeddingModel: z.string(),
  usage: usageSchema,
});

export const ragFailedEventSchema = z.object({ message: z.string() });

/** The SSE event names of `POST /rag/answer` and their payloads. */
export const ragStreamEvents = {
  token: ragTokenEventSchema,
  done: ragDoneEventSchema,
  failed: ragFailedEventSchema,
} as const;

export type IngestMetadataRequest = z.infer<typeof ingestMetadataRequestSchema>;
export type IngestMetadataResponse = z.infer<typeof ingestMetadataResponseSchema>;
export type VideoMetadata = z.infer<typeof videoMetadataSchema>;
export type IngestTranscriptRequest = z.infer<typeof ingestTranscriptRequestSchema>;
export type IngestTranscriptResponse = z.infer<typeof ingestTranscriptResponseSchema>;
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;
export type ProcessLessonRequest = z.infer<typeof processLessonRequestSchema>;
export type ProcessLessonResponse = z.infer<typeof processLessonResponseSchema>;
export type StructureRequest = z.infer<typeof structureRequestSchema>;
export type StructureResponse = z.infer<typeof structureResponseSchema>;
export type VectorSearchRequest = z.infer<typeof vectorSearchRequestSchema>;
export type VectorSearchResponse = z.infer<typeof vectorSearchResponseSchema>;
export type DeleteVectorsResponse = z.infer<typeof deleteVectorsResponseSchema>;
export type ChatTurn = z.infer<typeof chatTurnSchema>;
export type RagAnswerRequest = z.input<typeof ragAnswerRequestSchema>;
export type RagCitation = z.infer<typeof ragCitationSchema>;
export type RagRefusal = z.infer<typeof ragRefusalSchema>;
export type RagDoneEvent = z.infer<typeof ragDoneEventSchema>;
