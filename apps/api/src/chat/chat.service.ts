import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ragStreamEvents,
  type ChatCitation,
  type ChatMessage,
  type ChatRequest,
  type ChatSession,
  type ChatSessionSummary,
  type ChatTurn,
  type RagCitation,
  type RagRefusal,
} from '@coursecraft/shared';
import { AiServiceError } from '../ai/ai-client.errors.js';
import { AiClient } from '../ai/ai-client.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Earlier messages sent with a question (the AI service condenses follow-ups from them). */
export const HISTORY_MESSAGES = 6;
/** The AI service accepts history turns up to this length. */
const AI_TURN_MAX = 8000;
const TITLE_LENGTH = 60;
export const FAILED_MESSAGE =
  'The course assistant is unavailable right now. Your question was saved; please try again.';

/** What is stored with an assistant message: titles are looked up when it is read, since lessons can be renamed. */
interface StoredCitation {
  n: number;
  lessonId: string;
  chunkIds: string[];
  startSec: number;
  endSec: number;
  /** Absent in messages saved before #42: the span's start is used. */
  seekSec?: number;
  score: number;
}

export interface PreparedChat {
  courseId: string;
  sessionId: string;
  userMessageId: string;
  question: string;
  history: ChatTurn[];
}

export type ChatStreamEvent =
  | { event: 'session'; data: { sessionId: string; userMessageId: string } }
  | { event: 'token'; data: { text: string } }
  | {
      event: 'done';
      data: { sessionId: string; message: ChatMessage; refusal: RagRefusal | null };
    }
  | { event: 'failed'; data: { message: string } };

const messageSelect = {
  id: true,
  role: true,
  content: true,
  citations: true,
  grounded: true,
  createdAt: true,
} satisfies Prisma.ChatMessageSelect;
type MessageRow = Prisma.ChatMessageGetPayload<{ select: typeof messageSelect }>;

/**
 * The course chatbot's API side (SPEC §7.2 steps 1 and 6): only enrolled students of a
 * published course may ask; questions and answers are stored per conversation; the answer is
 * relayed from the AI service with its citations resolved to the course's lessons.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
  ) {}

  /**
   * Everything that can fail with an HTTP error runs here, before the stream starts: course,
   * enrollment, session. The question is saved now, so it survives an AI failure.
   */
  async prepare(userId: string, courseId: string, input: ChatRequest): Promise<PreparedChat> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: { userId: true },
    });
    if (!enrollment) {
      throw new ForbiddenException('Enroll in this course to ask its assistant questions');
    }

    const sessionId = input.sessionId
      ? (await this.ownSession(userId, courseId, input.sessionId)).id
      : (await this.prisma.chatSession.create({ data: { userId, courseId } })).id;
    const earlier = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_MESSAGES,
      select: { role: true, content: true },
    });
    const question = input.message.trim();
    const userMessage = await this.prisma.chatMessage.create({
      data: { sessionId, role: 'USER', content: question },
      select: { id: true },
    });
    return {
      courseId,
      sessionId,
      userMessageId: userMessage.id,
      question,
      history: earlier.reverse().map((m) => ({
        role: m.role === 'USER' ? 'user' : 'assistant',
        content: m.content.slice(0, AI_TURN_MAX),
      })),
    };
  }

  /** Relays the AI answer; the final `done` carries the saved assistant message. */
  async *answer(
    chat: PreparedChat,
    options: { signal?: AbortSignal; requestId?: string } = {},
  ): AsyncGenerator<ChatStreamEvent> {
    yield {
      event: 'session',
      data: { sessionId: chat.sessionId, userMessageId: chat.userMessageId },
    };
    try {
      const stream = this.ai.ragAnswer(
        { courseId: chat.courseId, question: chat.question, history: chat.history },
        options,
      );
      for await (const event of stream) {
        if (event.event === 'token') {
          yield { event: 'token', data: ragStreamEvents.token.parse(JSON.parse(event.data)) };
        } else if (event.event === 'done') {
          const done = ragStreamEvents.done.parse(JSON.parse(event.data));
          const message = await this.saveAnswer(chat, done.answer, done.grounded, done.citations);
          yield {
            event: 'done',
            data: { sessionId: chat.sessionId, message, refusal: done.refusal },
          };
          return;
        } else if (event.event === 'failed') {
          this.logger.warn(`AI answer failed mid-stream (session ${chat.sessionId})`);
          yield { event: 'failed', data: { message: FAILED_MESSAGE } };
          return;
        }
      }
      this.logger.warn(`AI answer stream ended without a result (session ${chat.sessionId})`);
    } catch (error) {
      if (options.signal?.aborted) return; // the student left: nothing to send or save
      const reason =
        error instanceof AiServiceError ? `${error.kind}: ${error.message}` : String(error);
      this.logger.warn(`AI answer failed (session ${chat.sessionId}): ${reason}`);
    }
    yield { event: 'failed', data: { message: FAILED_MESSAGE } };
  }

  async sessions(userId: string, courseId: string): Promise<ChatSessionSummary[]> {
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId, courseId },
      select: {
        id: true,
        createdAt: true,
        _count: { select: { messages: true } },
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { role: true, content: true, createdAt: true },
        },
      },
    });
    return sessions
      .map(({ id, createdAt, _count, messages }) => {
        const first = messages.find((m) => m.role === 'USER')?.content ?? 'New conversation';
        const last = messages.at(-1)?.createdAt ?? createdAt;
        return {
          id,
          title: first.length > TITLE_LENGTH ? `${first.slice(0, TITLE_LENGTH - 1)}…` : first,
          messageCount: _count.messages,
          createdAt: createdAt.toISOString(),
          lastMessageAt: last.toISOString(),
        };
      })
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }

  async session(userId: string, courseId: string, sessionId: string): Promise<ChatSession> {
    const session = await this.ownSession(userId, courseId, sessionId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: messageSelect,
    });
    const titles = await this.lessonTitles(
      courseId,
      rows.flatMap((r) => stored(r.citations)),
    );
    return {
      id: session.id,
      courseId,
      createdAt: session.createdAt.toISOString(),
      messages: rows.map((row) => toMessage(row, titles)),
    };
  }

  private async ownSession(userId: string, courseId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId, courseId },
      select: { id: true, createdAt: true },
    });
    // Someone else's conversation is "not found" too: its existence isn't revealed.
    if (!session) throw new NotFoundException('Conversation not found');
    return session;
  }

  private async saveAnswer(
    chat: PreparedChat,
    answer: string,
    grounded: boolean,
    citations: RagCitation[],
  ): Promise<ChatMessage> {
    const toStore: StoredCitation[] = citations.map((c) => ({
      n: c.n,
      lessonId: c.lessonId,
      chunkIds: c.chunkIds,
      startSec: c.startSec,
      endSec: c.endSec,
      seekSec: c.seekSec,
      score: c.score,
    }));
    const row = await this.prisma.chatMessage.create({
      data: {
        sessionId: chat.sessionId,
        role: 'ASSISTANT',
        content: answer,
        grounded,
        citations: toStore as unknown as Prisma.InputJsonValue,
      },
      select: messageSelect,
    });
    return toMessage(row, await this.lessonTitles(chat.courseId, toStore));
  }

  /** Current titles of the cited lessons that still belong to the course. */
  private async lessonTitles(
    courseId: string,
    citations: StoredCitation[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(citations.map((c) => c.lessonId))];
    if (ids.length === 0) return new Map();
    const lessons = await this.prisma.lesson.findMany({
      where: { id: { in: ids }, module: { courseId } },
      select: { id: true, title: true },
    });
    return new Map(lessons.map((l) => [l.id, l.title]));
  }
}

function stored(value: Prisma.JsonValue): StoredCitation[] {
  return Array.isArray(value) ? (value as unknown as StoredCitation[]) : [];
}

/** A stored message as the client sees it; citations of deleted lessons are left out. */
function toMessage(row: MessageRow, titles: Map<string, string>): ChatMessage {
  const citations: ChatCitation[] = stored(row.citations).flatMap((c) => {
    const lessonTitle = titles.get(c.lessonId);
    return lessonTitle === undefined
      ? []
      : [
          {
            n: c.n,
            lessonId: c.lessonId,
            lessonTitle,
            startSec: c.startSec,
            endSec: c.endSec,
            seekSec: c.seekSec ?? c.startSec,
          },
        ];
  });
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations,
    grounded: row.grounded,
    createdAt: row.createdAt.toISOString(),
  };
}
