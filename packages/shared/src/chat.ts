import { z } from 'zod';
import { ragRefusalSchema } from './ai.js';

/**
 * The course chatbot as the browser sees it (#41, SPEC §7.2): the API checks enrollment, keeps
 * the history, and relays the AI service's answer stream with citations resolved to lessons.
 */

export const CHAT_MESSAGE_MAX = 2000;

/** `POST /courses/:id/chat`: a new message; without `sessionId` a new conversation starts. */
export const chatRequestSchema = z.strictObject({
  sessionId: z.string().min(1).max(64).optional(),
  message: z.string().trim().min(1, 'Type a question').max(CHAT_MESSAGE_MAX),
});

/** A passage of a lesson an answer cites: enough to open the lesson at that moment. */
export const chatCitationSchema = z.object({
  /** The [n] marker in the answer. */
  n: z.number().int().positive(),
  lessonId: z.string(),
  /** The lesson's current title. */
  lessonTitle: z.string(),
  /** The cited span of the video. */
  startSec: z.number(),
  endSec: z.number(),
  /** The moment to open the lesson at: where the best-matching part of the span starts. */
  seekSec: z.number(),
});

export const chatRoleSchema = z.enum(['USER', 'ASSISTANT']);

export const chatMessageSchema = z.object({
  id: z.string(),
  role: chatRoleSchema,
  content: z.string(),
  /** Assistant messages only. */
  citations: z.array(chatCitationSchema),
  /** Assistant messages: false when the course doesn't cover the question. Null for users. */
  grounded: z.boolean().nullable(),
  createdAt: z.iso.datetime(),
});

/** `GET /courses/:id/chat/sessions`: my conversations in a course, most recent first. */
export const chatSessionSummarySchema = z.object({
  id: z.string(),
  /** The first question, shortened. */
  title: z.string(),
  messageCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime(),
});

/** `GET /courses/:id/chat/sessions/:sid`: one conversation, oldest message first. */
export const chatSessionSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  createdAt: z.iso.datetime(),
  messages: z.array(chatMessageSchema),
});

/**
 * The SSE events of `POST /courses/:id/chat`: `session` first, `token`s, then `done` (the
 * saved assistant message) or `failed`; `ping` keeps an idle connection open.
 */
export const chatStreamEvents = {
  session: z.object({ sessionId: z.string(), userMessageId: z.string() }),
  token: z.object({ text: z.string() }),
  done: z.object({
    sessionId: z.string(),
    message: chatMessageSchema,
    refusal: ragRefusalSchema.nullable(),
  }),
  failed: z.object({ message: z.string() }),
  ping: z.object({}),
} as const;

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatCitation = z.infer<typeof chatCitationSchema>;
export type ChatRole = z.infer<typeof chatRoleSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatSessionSummary = z.infer<typeof chatSessionSummarySchema>;
export type ChatSession = z.infer<typeof chatSessionSchema>;
export type ChatStreamEventName = keyof typeof chatStreamEvents;
export type ChatDoneEvent = z.infer<(typeof chatStreamEvents)['done']>;
