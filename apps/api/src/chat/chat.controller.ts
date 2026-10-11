import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  chatRequestSchema,
  type ChatRequest,
  type ChatSession,
  type ChatSessionSummary,
} from '@coursecraft/shared';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { PING_INTERVAL_MS } from '../ingestion/generation.controller.js';
import { ChatRateLimiter } from './chat-rate-limiter.js';
import { ChatService, type ChatStreamEvent, type PreparedChat } from './chat.service.js';

/** The course chatbot (SPEC §7.2, F11): signed-in students enrolled in a published course. */
@Controller('courses/:id/chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly limiter: ChatRateLimiter,
  ) {}

  /**
   * Asks a question; the answer streams back as Server-Sent Events: `session`, `token`…, then
   * `done` (the saved assistant message, with citations) or `failed`. Errors that can be known
   * up front (404 course or conversation, 403 not enrolled, 429 too many questions, 400 invalid)
   * are ordinary HTTP errors, sent before the stream starts.
   */
  @Post()
  async ask(
    @Param('id') courseId: string,
    @Body(new ZodValidationPipe(chatRequestSchema)) body: ChatRequest,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const slot = await this.limiter.acquire(user.id);
    if (!slot.ok) {
      res.setHeader('Retry-After', String(slot.retryAfterSec));
      throw new HttpException(
        slot.reason === 'busy'
          ? 'Your previous question is still being answered'
          : `Too many questions; try again in ${slot.retryAfterSec} s`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let prepared: PreparedChat;
    try {
      prepared = await this.chat.prepare(user.id, courseId, body);
    } catch (error) {
      await slot.release();
      throw error;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // no proxy buffering (Caddy/nginx), #48
    res.flushHeaders();

    // The response closing before it ended means the student left: stop the AI answer too.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    const write = (event: ChatStreamEvent | { event: 'ping'; data: object }) => {
      if (!res.writableEnded)
        res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };
    const ping = setInterval(() => write({ event: 'ping', data: {} }), PING_INTERVAL_MS);
    try {
      for await (const event of this.chat.answer(prepared, {
        signal: abort.signal,
        requestId: String(req.id),
      })) {
        write(event);
      }
    } finally {
      clearInterval(ping);
      await slot.release();
      res.end();
    }
  }

  /** My conversations in this course, most recent first. */
  @Get('sessions')
  sessions(
    @Param('id') courseId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ChatSessionSummary[]> {
    return this.chat.sessions(user.id, courseId);
  }

  /** One of my conversations, oldest message first (404 for anyone else's). */
  @Get('sessions/:sid')
  session(
    @Param('id') courseId: string,
    @Param('sid') sessionId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ChatSession> {
    return this.chat.session(user.id, courseId, sessionId);
  }
}
