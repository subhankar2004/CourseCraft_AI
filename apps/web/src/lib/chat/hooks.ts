'use client';

import {
  chatSessionSchema,
  chatSessionSummarySchema,
  type ChatMessage,
  type RagRefusal,
} from '@coursecraft/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { askCourse, ChatLimitError } from './stream';

export const chatSessionsKey = (courseId: string) => ['chat', courseId, 'sessions'] as const;

/** My conversations in a course, most recent first. */
export function useChatSessions(courseId: string, enabled: boolean) {
  return useQuery({
    queryKey: chatSessionsKey(courseId),
    queryFn: () =>
      api(`courses/${courseId}/chat/sessions`, { schema: chatSessionSummarySchema.array() }),
    enabled,
  });
}

/** A message on screen: saved ones, plus the question and answer of the exchange in progress. */
export interface ChatEntry extends ChatMessage {
  /** Why an assistant answer is the fixed refusal (only known for answers given just now). */
  refusal?: RagRefusal | null;
}

export type ChatStatus =
  | { kind: 'idle' }
  | { kind: 'loading' } // opening an earlier conversation
  | { kind: 'thinking' } // question sent, no token yet
  | { kind: 'streaming' }
  | { kind: 'error'; message: string; question?: string; retryAfterSec?: number };

// The open conversation per course, for this tab: following a citation to another lesson (a
// new page) or reloading continues the same conversation.
const storageKey = (courseId: string) => `coursecraft:chat-session:${courseId}`;

function readStoredSession(courseId: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(courseId));
  } catch {
    return null; // storage blocked: conversations just don't survive a page change
  }
}

function storeSession(courseId: string, id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(storageKey(courseId), id);
    else window.sessionStorage.removeItem(storageKey(courseId));
  } catch {
    // a convenience only
  }
}

let localId = 0;
const pendingId = () => `local-${++localId}`;

function friendly(error: unknown): string {
  if (error instanceof ChatLimitError) {
    return error.body.message.toString().includes('still being answered')
      ? 'Your previous question is still being answered.'
      : `You've asked a lot of questions. Try again in ${error.retryAfterSec} s.`;
  }
  if (error instanceof ApiError && error.status === 403) {
    return 'Enroll in this course to ask its assistant questions.';
  }
  if (error instanceof ApiError && error.status === 0) {
    return 'You seem to be offline. Check your connection and try again.';
  }
  return 'The assistant could not answer right now. Please try again.';
}

/**
 * One conversation with a course's assistant (#42): sends questions, shows the answer as it
 * streams, and keeps the conversation id for follow-ups. `open(id)` loads an earlier one;
 * `reset()` starts a new one. Leaving (unmount) or switching aborts an answer in progress.
 */
export function useCourseChat(courseId: string) {
  const queryClient = useQueryClient();
  // Rendered only on the client (after the page's data loads), so storage can be read up front.
  const [sessionId, setSessionIdState] = useState<string | null>(() => readStoredSession(courseId));
  const [restored, setRestored] = useState(false);
  const setSessionId = useCallback(
    (id: string | null) => {
      setSessionIdState(id);
      storeSession(courseId, id);
    },
    [courseId],
  );
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<ChatStatus>({ kind: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || status.kind === 'thinking' || status.kind === 'streaming') return;
      stop();
      const abort = new AbortController();
      controller.current = abort;
      const now = new Date().toISOString();
      setMessages((list) => [
        ...list,
        {
          id: pendingId(),
          role: 'USER',
          content: question,
          citations: [],
          grounded: null,
          createdAt: now,
        },
      ]);
      setDraft('');
      setStatus({ kind: 'thinking' });
      try {
        const outcome = await askCourse(
          courseId,
          { message: question, ...(sessionId ? { sessionId } : {}) },
          {
            onSession: (id) => setSessionId(id),
            onToken: (token) => {
              setDraft((current) => current + token);
              setStatus({ kind: 'streaming' });
            },
          },
          abort.signal,
        );
        if (outcome.kind === 'done') {
          setMessages((list) => [
            ...list,
            { ...outcome.done.message, refusal: outcome.done.refusal },
          ]);
          setDraft('');
          setStatus({ kind: 'idle' });
        } else {
          setDraft('');
          setStatus({
            kind: 'error',
            question,
            message:
              outcome.kind === 'failed'
                ? outcome.message
                : 'The answer was interrupted. Please try again.',
          });
        }
        void queryClient.invalidateQueries({ queryKey: chatSessionsKey(courseId) });
      } catch (error) {
        if (abort.signal.aborted) return;
        setDraft('');
        // The question never reached the conversation: take it back off the screen.
        setMessages((list) => list.slice(0, -1));
        setStatus({
          kind: 'error',
          question,
          message: friendly(error),
          ...(error instanceof ChatLimitError ? { retryAfterSec: error.retryAfterSec } : {}),
        });
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    },
    [courseId, queryClient, sessionId, setSessionId, status.kind, stop],
  );

  /** Stops the answer being written; the question stays (the API saved it, without an answer). */
  const cancel = useCallback(() => {
    stop();
    setDraft('');
    setStatus({ kind: 'idle' });
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setSessionId(null);
    setRestored(true);
    setMessages([]);
    setDraft('');
    setStatus({ kind: 'idle' });
  }, [setSessionId, stop]);

  const open = useCallback(
    async (id: string, { quiet = false } = {}) => {
      stop();
      setRestored(true);
      setStatus({ kind: 'loading' });
      setDraft('');
      try {
        const session = await api(`courses/${courseId}/chat/sessions/${id}`, {
          schema: chatSessionSchema,
        });
        setSessionId(session.id);
        setMessages(session.messages);
        setStatus({ kind: 'idle' });
      } catch {
        if (quiet) {
          // The remembered conversation is gone (or unreadable): start a new one.
          setSessionId(null);
          setStatus({ kind: 'idle' });
        } else {
          setStatus({ kind: 'error', message: 'That conversation could not be opened.' });
        }
      }
    },
    [courseId, setSessionId, stop],
  );

  /** Brings back the conversation this tab had open (once, when the assistant is opened). */
  const restore = useCallback(() => {
    if (restored || messages.length > 0) return;
    setRestored(true);
    if (sessionId) void open(sessionId, { quiet: true });
  }, [messages.length, open, restored, sessionId]);

  return { sessionId, messages, draft, status, send, cancel, reset, open, restore };
}
