'use client';

import { formatTimestamp } from '@coursecraft/shared';
import { CheckIcon, CopyIcon, PlayIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode, useRef, useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
import { remarkHeadingIds, remarkTimestampAnchors } from '@/lib/notes/remark-plugins';
import { cn } from '@/lib/utils';

export interface NotesRendererProps {
  markdown: string;
  /** Called with the anchor's time when a `[▶ m:ss]` chip is clicked (the lesson page seeks). */
  onSeek?: (seconds: number) => void;
  /** Without `onSeek`, chips link to the video on YouTube at that time. */
  youtubeId?: string;
  className?: string;
}

/** react-markdown passes its AST `node`; it must not reach the DOM element. */
function dom<P extends { node?: unknown }>(props: P): Omit<P, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

/**
 * Lesson notes as formatted, interactive text (SPEC F7, F10). react-markdown renders no raw HTML
 * and strips dangerous link protocols, so AI- or admin-written Markdown can't inject markup.
 */
export function NotesRenderer({ markdown, onSeek, youtubeId, className }: NotesRendererProps) {
  const components: Components = {
    h1: (props) => <h2 className="mt-8 mb-3 scroll-mt-20 text-xl font-semibold" {...dom(props)} />,
    h2: (props) => (
      <h2
        className="mt-8 mb-3 scroll-mt-20 border-b pb-1 text-lg font-semibold first:mt-0"
        {...dom(props)}
      />
    ),
    h3: (props) => <h3 className="mt-5 mb-2 scroll-mt-20 font-semibold" {...dom(props)} />,
    p: (props) => <p className="my-3 leading-7" {...dom(props)} />,
    ul: (props) => (
      <ul
        className="my-3 list-disc space-y-1.5 pl-6 marker:text-muted-foreground"
        {...dom(props)}
      />
    ),
    ol: (props) => (
      <ol
        className="my-3 list-decimal space-y-1.5 pl-6 marker:text-muted-foreground"
        {...dom(props)}
      />
    ),
    li: (props) => <li className="leading-7" {...dom(props)} />,
    strong: (props) => <strong className="font-semibold text-foreground" {...dom(props)} />,
    blockquote: (props) => (
      <blockquote
        className="my-4 rounded-r-lg border-l-4 border-sky-500/60 bg-sky-500/5 px-4 py-2 [&>p]:my-1"
        {...dom(props)}
      />
    ),
    a: (props) => (
      <a
        className="font-medium underline underline-offset-4"
        target="_blank"
        rel="noreferrer"
        {...dom(props)}
      />
    ),
    pre: (props) => <CodeBlock {...dom(props)} />,
    code: ({ className: codeClass, ...props }) => (
      <code
        className={cn(
          codeClass?.includes('hljs')
            ? codeClass
            : 'rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]',
          codeClass,
        )}
        {...dom(props)}
      />
    ),
    table: (props) => (
      <div className="my-4 overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm" {...dom(props)} />
      </div>
    ),
    thead: (props) => <thead className="bg-muted/50" {...dom(props)} />,
    th: (props) => <th className="border-b px-3 py-2 text-left font-medium" {...dom(props)} />,
    td: (props) => <td className="border-b px-3 py-2 align-top" {...dom(props)} />,
    hr: () => <hr className="my-6" />,
    span: ({ node, ...props }) => {
      const seek = node?.properties?.dataSeek;
      if (seek === undefined) return <span {...props} />;
      return <AnchorChip seconds={Number(seek)} onSeek={onSeek} youtubeId={youtubeId} />;
    },
  };

  return (
    <div className={cn('text-[0.95rem] text-foreground/90', className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkTimestampAnchors, remarkHeadingIds]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        components={components}
      >
        {markdown}
      </Markdown>
    </div>
  );
}

function AnchorChip({
  seconds,
  onSeek,
  youtubeId,
}: {
  seconds: number;
  onSeek?: (seconds: number) => void;
  youtubeId?: string;
}) {
  const label = formatTimestamp(seconds);
  const className =
    'mx-0.5 inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 align-baseline text-xs font-medium text-sky-700 tabular-nums transition-colors hover:bg-sky-500/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-sky-300';
  const content: ReactNode = (
    <>
      <PlayIcon className="size-3 fill-current" aria-hidden />
      {label}
    </>
  );
  if (onSeek) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => onSeek(seconds)}
        aria-label={`Play the video from ${label}`}
      >
        {content}
      </button>
    );
  }
  if (youtubeId) {
    return (
      <a
        className={className}
        href={`https://www.youtube.com/watch?v=${youtubeId}&t=${Math.floor(seconds)}s`}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open the video at ${label} on YouTube`}
      >
        {content}
      </a>
    );
  }
  return <span className={className}>{content}</span>;
}

/** A code block with a copy button. */
function CodeBlock(props: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (permissions, insecure context): the code can still be selected.
    }
  };
  return (
    <div className="group relative my-4">
      <pre
        ref={ref}
        className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-[0.8rem] leading-relaxed [&>code]:bg-transparent [&>code]:p-0"
        {...props}
      />
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={copied ? 'Code copied' : 'Copy code'}
      >
        {copied ? (
          <CheckIcon className="size-3.5" aria-hidden />
        ) : (
          <CopyIcon className="size-3.5" aria-hidden />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
