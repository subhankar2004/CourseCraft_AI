// @vitest-environment jsdom
import type { ChatMessage } from '@coursecraft/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatAnswer } from './chat-answer';
import { CourseChat } from './course-chat';

// The network is mocked: askCourse (the SSE client) is scripted per test.
const net = vi.hoisted(() => ({ askCourse: vi.fn(), api: vi.fn() }));
vi.mock('@/lib/chat/stream', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chat/stream')>()),
  askCourse: net.askCourse,
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  api: net.api,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const citation = {
  n: 1,
  lessonId: 'l-graphs',
  lessonTitle: 'Graph Search',
  startSec: 0,
  endSec: 380,
  seekSec: 181.5,
};
const answer = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'a1',
  role: 'ASSISTANT',
  content: 'Depth-first search goes deep first [1]. Code: `xs = [1]`.',
  citations: [citation],
  grounded: true,
  createdAt: '2026-10-11T10:00:00.000Z',
  ...over,
});

function setup(onCite?: (c: typeof citation) => boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CourseChat courseId="c1" courseSlug="webdev" onCite={onCite} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ask this course' }));
  return within(screen.getByRole('dialog', { name: 'Ask this course' }));
}

function ask(sheet: ReturnType<typeof setup>, text: string) {
  fireEvent.change(sheet.getByLabelText('Your question'), { target: { value: text } });
  fireEvent.keyDown(sheet.getByLabelText('Your question'), { key: 'Enter' });
}

beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => items.set(k, v),
    removeItem: (k: string) => items.delete(k),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('CourseChat', () => {
  it('shows thinking, then the streamed answer, then citations linking to the moment', async () => {
    let finish!: () => void;
    net.askCourse.mockImplementation(async (_c, _b, handlers) => {
      handlers.onSession('s1');
      await new Promise<void>((resolve) => (finish = resolve));
      handlers.onToken('Depth-first ');
      handlers.onToken('search goes deep');
      await new Promise<void>((resolve) => (finish = resolve));
      return { kind: 'done', done: { sessionId: 's1', message: answer(), refusal: null } };
    });
    const sheet = setup();
    ask(sheet, 'How does DFS work?');

    expect(sheet.getByText('How does DFS work?')).toBeTruthy();
    expect(await sheet.findByText('Thinking…')).toBeTruthy();
    expect(sheet.getByRole('button', { name: 'Stop' })).toBeTruthy();
    await act(async () => finish());
    await waitFor(() => expect(sheet.getByText(/Depth-first search goes deep/)).toBeTruthy());
    expect(sheet.queryByText('Thinking…')).toBeNull();
    await act(async () => finish());

    const sources = await sheet.findByRole('list', { name: 'Sources' });
    const chip = within(sources).getByRole('link');
    expect(chip.getAttribute('href')).toBe('/learn/webdev/l-graphs?t=181');
    expect(chip.getAttribute('aria-label')).toBe('Source 1: Graph Search · 3:01');
    expect(chip.textContent).toContain('3:01'); // the moment stays visible when the title is cut
    const links = sheet.getAllByRole('link', { name: 'Source 1: Graph Search · 3:01' });
    expect(links).toHaveLength(2); // the inline [1] marker and its chip
    const inline = links.find((link) => link.closest('sup'))!;
    expect(inline.getAttribute('href')).toBe('/learn/webdev/l-graphs?t=181');
    expect(sheet.getByText('xs = [1]').closest('code')).toBeTruthy(); // code is left alone
    expect(net.askCourse).toHaveBeenCalledWith(
      'c1',
      { message: 'How does DFS work?' },
      expect.anything(),
      expect.any(AbortSignal),
    );
    expect(sessionStorage.getItem('coursecraft:chat-session:c1')).toBe('s1');

    // A follow-up continues the conversation.
    net.askCourse.mockResolvedValueOnce({
      kind: 'done',
      done: { sessionId: 's1', message: answer({ id: 'a2' }), refusal: null },
    });
    ask(sheet, 'And BFS?');
    await waitFor(() =>
      expect(net.askCourse).toHaveBeenLastCalledWith(
        'c1',
        { message: 'And BFS?', sessionId: 's1' },
        expect.anything(),
        expect.any(AbortSignal),
      ),
    );
  });

  it('lets the page handle a citation of the open lesson instead of navigating', async () => {
    net.askCourse.mockResolvedValue({
      kind: 'done',
      done: { sessionId: 's1', message: answer(), refusal: null },
    });
    const onCite = vi.fn(() => true);
    const sheet = setup(onCite);
    ask(sheet, 'q');
    const chip = within(await sheet.findByRole('list', { name: 'Sources' })).getByRole('link');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    chip.dispatchEvent(click);
    expect(onCite).toHaveBeenCalledWith(citation);
    expect(click.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); // the sheet closes
  });

  it('styles a refusal differently', async () => {
    net.askCourse.mockResolvedValue({
      kind: 'done',
      done: {
        sessionId: 's1',
        message: answer({ content: "This isn't covered.", citations: [], grounded: false }),
        refusal: 'low_score',
      },
    });
    const sheet = setup();
    ask(sheet, 'Capital of Australia?');
    expect(await sheet.findByText('Not covered in this course')).toBeTruthy();
    expect(sheet.queryByRole('list', { name: 'Sources' })).toBeNull();
  });

  it('explains failures and offers to try again', async () => {
    net.askCourse.mockResolvedValueOnce({
      kind: 'failed',
      message: 'The assistant is unavailable.',
    });
    const sheet = setup();
    ask(sheet, 'What is a join?');
    const alert = await sheet.findByRole('alert');
    expect(alert.textContent).toContain('The assistant is unavailable.');
    net.askCourse.mockResolvedValueOnce({
      kind: 'done',
      done: { sessionId: 's1', message: answer(), refusal: null },
    });
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(net.askCourse).toHaveBeenCalledTimes(2));
    expect(net.askCourse.mock.calls[1]![1]).toEqual({ message: 'What is a join?' });
  });

  it('says when the student has asked too much, without a retry button', async () => {
    const { ChatLimitError } = await import('@/lib/chat/stream');
    net.askCourse.mockRejectedValue(
      new ChatLimitError(
        { statusCode: 429, error: 'Too Many Requests', message: 'Too many questions' },
        42,
      ),
    );
    const sheet = setup();
    ask(sheet, 'q');
    const alert = await sheet.findByRole('alert');
    expect(alert.textContent).toContain('Try again in 42 s');
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(sheet.queryByText('q')).toBeNull(); // the question never reached the conversation
  });

  it('lists earlier conversations and reopens one; remembers the open one across pages', async () => {
    net.api.mockImplementation(async (path: string) =>
      path.endsWith('/sessions')
        ? [
            {
              id: 's9',
              title: 'What is BFS?',
              messageCount: 2,
              createdAt: '2026-10-11T09:00:00.000Z',
              lastMessageAt: '2026-10-11T09:01:00.000Z',
            },
          ]
        : {
            id: 's9',
            courseId: 'c1',
            createdAt: '2026-10-11T09:00:00.000Z',
            messages: [
              {
                id: 'u',
                role: 'USER',
                content: 'What is BFS?',
                citations: [],
                grounded: null,
                createdAt: '2026-10-11T09:00:00.000Z',
              },
              answer({ id: 'b' }),
            ],
          },
    );
    const sheet = setup();
    fireEvent.click(sheet.getByRole('button', { name: 'Conversations' }));
    const list = await sheet.findByRole('list', { name: 'Conversations' });
    fireEvent.click(within(list).getByRole('button', { name: /What is BFS\?/ }));
    expect(await sheet.findByText('What is BFS?')).toBeTruthy();
    expect(sessionStorage.getItem('coursecraft:chat-session:c1')).toBe('s9');

    // A new page (another lesson): opening the assistant brings the conversation back.
    cleanup();
    const again = setup();
    expect(await again.findByText('What is BFS?')).toBeTruthy();

    fireEvent.click(again.getByRole('button', { name: 'New chat' }));
    expect(again.queryByText('What is BFS?')).toBeNull();
    expect(sessionStorage.getItem('coursecraft:chat-session:c1')).toBeNull();
  });
});

describe('ChatAnswer', () => {
  it('links markers that have a citation and leaves others as text', () => {
    render(
      <ChatAnswer text="Known [1], unknown [5]." citations={[citation]} courseSlug="webdev" />,
    );
    expect(screen.getByRole('link', { name: /Source 1/ }).getAttribute('href')).toBe(
      '/learn/webdev/l-graphs?t=181',
    );
    expect(screen.getByText('[5]')).toBeTruthy();
  });
});
