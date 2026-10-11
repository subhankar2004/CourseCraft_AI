'use client';

import { CHAT_MESSAGE_MAX, formatTimestamp, type ChatCitation } from '@coursecraft/shared';
import {
  ArrowUpIcon,
  HistoryIcon,
  InfoIcon,
  MessageCircleQuestionIcon,
  PlusIcon,
  SquareIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { citationLabel } from '@/lib/chat/citations';
import { type ChatEntry, useChatSessions, useCourseChat } from '@/lib/chat/hooks';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ChatAnswer, CitationLink } from './chat-answer';

interface Props {
  courseId: string;
  courseSlug: string;
  /**
   * Handles a citation itself instead of navigating (the lesson page seeks its player when the
   * citation is for the lesson already open). Return true when handled.
   */
  onCite?: (citation: ChatCitation) => boolean;
}

/**
 * The course assistant (#42, SPEC F11): a floating "Ask this course" button opening a side
 * sheet. Answers stream in, cite lesson moments, and the conversation continues with
 * follow-ups; earlier conversations can be reopened. The conversation lives here, so closing
 * the sheet doesn't lose it.
 */
export function CourseChat({ courseId, courseSlug, onCite }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const chat = useCourseChat(courseId);
  const busy = chat.status.kind === 'thinking' || chat.status.kind === 'streaming';

  const cite = (citation: ChatCitation, event: MouseEvent<HTMLAnchorElement>) => {
    if (onCite?.(citation)) event.preventDefault();
    setOpen(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) chat.restore();
      }}
    >
      <SheetTrigger asChild>
        <Button className="fixed right-4 bottom-4 z-30 rounded-full shadow-lg" size="lg">
          <MessageCircleQuestionIcon aria-hidden />
          Ask this course
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Ask this course</SheetTitle>
          <SheetDescription>Answers come only from this course&apos;s lessons.</SheetDescription>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              aria-pressed={view === 'history'}
              onClick={() => setView(view === 'history' ? 'chat' : 'history')}
            >
              <HistoryIcon aria-hidden />
              Conversations
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                chat.reset();
                setView('chat');
              }}
            >
              <PlusIcon aria-hidden />
              New chat
            </Button>
          </div>
        </SheetHeader>
        {view === 'history' ? (
          <History
            courseId={courseId}
            current={chat.sessionId}
            onOpen={(id) => {
              void chat.open(id);
              setView('chat');
            }}
          />
        ) : (
          <>
            <Conversation chat={chat} courseSlug={courseSlug} onCite={cite} />
            <Composer
              busy={busy}
              onSend={(text) => void chat.send(text)}
              onStop={() => chat.cancel()}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Conversation({
  chat,
  courseSlug,
  onCite,
}: {
  chat: ReturnType<typeof useCourseChat>;
  courseSlug: string;
  onCite: (citation: ChatCitation, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const log = useRef<HTMLDivElement>(null);
  const { messages, draft, status } = chat;
  const busy = status.kind === 'thinking' || status.kind === 'streaming';

  // Follow the answer as it grows (the log's own scroll, so the page and focus don't move).
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, draft, status.kind]);

  return (
    <div
      ref={log}
      role="log"
      aria-live="polite"
      aria-busy={busy}
      aria-label="Conversation"
      className="flex-1 space-y-4 overflow-y-auto p-4"
    >
      {status.kind === 'loading' && <Skeleton className="h-24 w-full" />}
      {messages.length === 0 && !busy && status.kind !== 'loading' && (
        <p className="text-sm text-muted-foreground">
          Ask about anything in this course&apos;s lessons, for example to explain a concept again
          or to give an example. Answers cite the lesson and the moment in the video.
        </p>
      )}
      {messages.map((message) => (
        <Bubble key={message.id} message={message} courseSlug={courseSlug} onCite={onCite} />
      ))}
      {status.kind === 'thinking' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex gap-1" aria-hidden>
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1.5 animate-bounce rounded-full bg-current"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </span>
          Thinking…
        </div>
      )}
      {status.kind === 'streaming' && (
        <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
          <ChatAnswer text={draft} citations={[]} courseSlug={courseSlug} />
          <span
            className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-foreground/60 align-middle"
            aria-hidden
          />
        </div>
      )}
      {status.kind === 'error' && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
        >
          <p>{status.message}</p>
          {status.question && !status.retryAfterSec && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void chat.send(status.question!)}
            >
              Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Bubble({
  message,
  courseSlug,
  onCite,
}: {
  message: ChatEntry;
  courseSlug: string;
  onCite: (citation: ChatCitation, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  if (message.role === 'USER') {
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
        <span className="sr-only">You: </span>
        {message.content}
      </div>
    );
  }
  if (message.grounded === false) {
    return (
      <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <InfoIcon className="size-3.5" aria-hidden />
          Not covered in this course
        </p>
        <p className="leading-6">{message.content}</p>
      </div>
    );
  }
  return (
    <div className="max-w-[90%] space-y-2">
      <div className="rounded-2xl rounded-tl-sm bg-muted px-3 py-2">
        <span className="sr-only">Assistant: </span>
        <ChatAnswer
          text={message.content}
          citations={message.citations}
          courseSlug={courseSlug}
          onCite={onCite}
        />
      </div>
      {message.citations.length > 0 && (
        <ul aria-label="Sources" className="flex flex-wrap gap-1.5">
          {message.citations.map((citation) => (
            <li key={citation.n} className="max-w-full min-w-0">
              <CitationLink
                citation={citation}
                courseSlug={courseSlug}
                onCite={onCite}
                aria-label={`Source ${citation.n}: ${citationLabel(citation)}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
              >
                <span className="font-medium text-primary">{citation.n}</span>
                {/* The title may shorten; the moment always shows. */}
                <span className="truncate">{citation.lessonTitle}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  · {formatTimestamp(Math.floor(citation.seekSec))}
                </span>
              </CitationLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Composer({
  busy,
  onSend,
  onStop,
}: {
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState('');
  // Unique per instance: Next keeps a previous lesson's page (and its chat) hidden in the DOM.
  const inputId = useId();
  const submit = () => {
    if (!text.trim() || busy) return;
    onSend(text);
    setText('');
  };
  return (
    <form
      className="border-t p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label htmlFor={inputId} className="sr-only">
        Your question
      </label>
      <div className="flex items-end gap-2">
        <Textarea
          id={inputId}
          value={text}
          maxLength={CHAT_MESSAGE_MAX}
          rows={2}
          placeholder="Ask a question about the lessons…"
          className="min-h-0 resize-none"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter starts a new line (not while composing with an IME).
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" aria-label="Stop" onClick={onStop}>
            <SquareIcon />
          </Button>
        ) : (
          <Button type="submit" size="icon" aria-label="Send" disabled={!text.trim()}>
            <ArrowUpIcon />
          </Button>
        )}
      </div>
      {text.length > CHAT_MESSAGE_MAX - 200 && (
        <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
          {text.length}/{CHAT_MESSAGE_MAX}
        </p>
      )}
    </form>
  );
}

function History({
  courseId,
  current,
  onOpen,
}: {
  courseId: string;
  current: string | null;
  onOpen: (id: string) => void;
}) {
  const sessions = useChatSessions(courseId, true);
  if (sessions.isPending) {
    return (
      <div className="space-y-2 p-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (sessions.isError) {
    return <p className="p-4 text-sm text-muted-foreground">Conversations could not be loaded.</p>;
  }
  if (sessions.data.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No conversations yet.</p>;
  }
  return (
    <ul aria-label="Conversations" className="flex-1 divide-y overflow-y-auto">
      {sessions.data.map((session) => (
        <li key={session.id}>
          <button
            type="button"
            onClick={() => onOpen(session.id)}
            aria-current={session.id === current ? 'true' : undefined}
            className={cn(
              'grid w-full gap-0.5 px-4 py-3 text-left hover:bg-muted',
              session.id === current && 'bg-muted',
            )}
          >
            <span className="truncate text-sm font-medium">{session.title}</span>
            <span className="text-xs text-muted-foreground">
              {session.messageCount} messages · {formatRelative(session.lastMessageAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
