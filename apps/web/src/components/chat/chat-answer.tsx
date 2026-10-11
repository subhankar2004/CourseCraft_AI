'use client';

import type { ChatCitation } from '@coursecraft/shared';
import Link from 'next/link';
import type { ComponentProps, MouseEvent } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { citationHref, citationLabel, remarkCitationMarkers } from '@/lib/chat/citations';
import { cn } from '@/lib/utils';

export interface CitationTarget {
  courseSlug: string;
  /** Called instead of navigating when a citation is clicked (e.g. it's the open lesson). */
  onCite?: (citation: ChatCitation, event: MouseEvent<HTMLAnchorElement>) => void;
}

/** The anchor for a citation: the lesson at that moment, or the `onCite` handler. */
export function CitationLink({
  citation,
  courseSlug,
  onCite,
  className,
  children,
  ...rest
}: CitationTarget & { citation: ChatCitation } & Omit<ComponentProps<typeof Link>, 'href'>) {
  return (
    <Link
      href={citationHref(courseSlug, citation)}
      className={className}
      onClick={(event) => onCite?.(citation, event)}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** react-markdown passes its AST `node`; it must not reach the DOM element. */
function dom<P extends { node?: unknown }>(props: P): Omit<P, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

/**
 * An assistant answer: Markdown (no raw HTML, dangerous links stripped by react-markdown), with
 * each [n] marker linked to the lesson moment it cites. Markers with no citation stay text
 * (possible mid-stream, before the final answer is cleaned).
 */
export function ChatAnswer({
  text,
  citations,
  courseSlug,
  onCite,
}: { text: string; citations: ChatCitation[] } & CitationTarget) {
  const byN = new Map(citations.map((c) => [c.n, c]));
  const components: Components = {
    p: (props) => <p className="leading-6 [&:not(:first-child)]:mt-2" {...dom(props)} />,
    ul: (props) => <ul className="mt-2 list-disc space-y-1 pl-5" {...dom(props)} />,
    ol: (props) => <ol className="mt-2 list-decimal space-y-1 pl-5" {...dom(props)} />,
    a: (props) => (
      <a
        className="underline underline-offset-2"
        target="_blank"
        rel="noreferrer"
        {...dom(props)}
      />
    ),
    code: ({ className, ...props }) => (
      <code
        className={cn('rounded bg-background/70 px-1 py-0.5 text-[0.85em]', className)}
        {...dom(props)}
      />
    ),
    pre: (props) => (
      <pre
        tabIndex={0}
        className="mt-2 overflow-x-auto rounded-md bg-background/70 p-3 text-xs [&>code]:bg-transparent [&>code]:p-0"
        {...dom(props)}
      />
    ),
    sup: (props) => {
      const n = Number((props.node?.properties as { dataCite?: unknown } | undefined)?.dataCite);
      const citation = byN.get(n);
      if (!citation) return <sup>[{dom(props).children}]</sup>;
      return (
        <sup>
          <CitationLink
            citation={citation}
            courseSlug={courseSlug}
            onCite={onCite}
            aria-label={`Source ${n}: ${citationLabel(citation)}`}
            className="ml-0.5 rounded px-0.5 font-medium text-primary hover:bg-primary/10"
          >
            {n}
          </CitationLink>
        </sup>
      );
    },
  };
  return (
    <div className="text-sm break-words">
      <Markdown remarkPlugins={[remarkGfm, remarkCitationMarkers]} components={components}>
        {text}
      </Markdown>
    </div>
  );
}
