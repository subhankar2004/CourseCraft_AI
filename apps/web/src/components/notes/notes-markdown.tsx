import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/**
 * Lesson notes as formatted text. react-markdown renders no raw HTML and strips dangerous link
 * protocols, so AI- or admin-written Markdown can't inject markup or scripts.
 * #34 extends this renderer (syntax highlighting, `[▶ m:ss]` anchors that seek the video).
 */
/** react-markdown passes its AST `node`; it must not reach the DOM element. */
function dom<P extends { node?: unknown }>(props: P): Omit<P, 'node'> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

const components: Components = {
  h1: (props) => <h2 className="mt-6 mb-2 text-xl font-semibold" {...dom(props)} />,
  h2: (props) => <h2 className="mt-6 mb-2 text-lg font-semibold first:mt-0" {...dom(props)} />,
  h3: (props) => <h3 className="mt-4 mb-1.5 font-semibold" {...dom(props)} />,
  p: (props) => <p className="my-2 leading-relaxed" {...dom(props)} />,
  ul: (props) => <ul className="my-2 list-disc space-y-1 pl-5" {...dom(props)} />,
  ol: (props) => <ol className="my-2 list-decimal space-y-1 pl-5" {...dom(props)} />,
  blockquote: (props) => (
    <blockquote className="my-3 border-l-2 pl-3 text-muted-foreground" {...dom(props)} />
  ),
  a: (props) => (
    <a className="underline underline-offset-2" target="_blank" rel="noreferrer" {...dom(props)} />
  ),
  pre: (props) => (
    <pre
      className="my-3 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed"
      {...props}
    />
  ),
  code: ({ className, ...props }) => (
    <code
      className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]', className)}
      {...props}
    />
  ),
  table: (props) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...dom(props)} />
    </div>
  ),
  th: (props) => <th className="border px-2 py-1 text-left font-medium" {...dom(props)} />,
  td: (props) => <td className="border px-2 py-1" {...dom(props)} />,
  hr: () => <hr className="my-4" />,
};

export function NotesMarkdown({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div className={cn('text-sm', className)}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
