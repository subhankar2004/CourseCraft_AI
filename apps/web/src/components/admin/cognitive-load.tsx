import { COGNITIVE_LOAD_TARGET, type CognitiveLoad } from '@coursecraft/shared';
import { cn } from '@/lib/utils';

const heavy = (load: CognitiveLoad) => load.index > COGNITIVE_LOAD_TARGET;

/** "CLI 21": a lesson's Cognitive Load Index (#43), amber above the SPEC §9 target. */
export function CognitiveLoadBadge({ load }: { load: CognitiveLoad | null }) {
  if (!load) {
    return (
      <span className="text-xs text-muted-foreground" title="Cognitive load not measured">
        <span aria-hidden>CLI –</span>
        <span className="sr-only">Cognitive load not measured</span>
      </span>
    );
  }
  const label = `Cognitive load ${Math.round(load.index)} of 100${heavy(load) ? `, above the target of ${COGNITIVE_LOAD_TARGET}` : ''}${load.simplified ? ', simplified' : ''}`;
  return (
    <span
      title={label}
      className={cn(
        'rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums',
        heavy(load)
          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
          : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
      )}
    >
      <span aria-hidden>
        CLI {Math.round(load.index)}
        {load.simplified ? ' ↓' : ''}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The index and its three parts, for the lesson preview. */
export function CognitiveLoadDetails({ load }: { load: CognitiveLoad | null }) {
  return (
    <section aria-labelledby="readability" className="grid gap-2 rounded-lg border p-3">
      <h3 id="readability" className="text-sm font-medium">
        Readability
      </h3>
      {!load ? (
        <p className="text-muted-foreground">
          Not measured (generated before measuring was added, or the AI service was unavailable when
          the notes were edited).
        </p>
      ) : (
        <>
          <p>
            Cognitive load <strong className="tabular-nums">{Math.round(load.index)}</strong>/100 ·
            target ≤ {COGNITIVE_LOAD_TARGET} <CognitiveLoadBadge load={load} />
          </p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <dt>Reading grade (Flesch-Kincaid)</dt>
            <dd className="text-right tabular-nums">{load.fleschKincaid.toFixed(1)}</dd>
            <dt>Words per sentence</dt>
            <dd className="text-right tabular-nums">{load.avgSentenceLen.toFixed(1)}</dd>
            <dt>Key terms per 100 words</dt>
            <dd className="text-right tabular-nums">{load.conceptDensity.toFixed(1)}</dd>
            <dt>Words measured</dt>
            <dd className="text-right tabular-nums">{load.words}</dd>
          </dl>
          {load.simplified && load.originalIndex !== null && (
            <p className="text-xs">
              Simplified automatically from {Math.round(load.originalIndex)}.
            </p>
          )}
          {load.simplifyAttempted && !load.simplified && (
            <p className="text-xs">
              An automatic simplification was tried but lost content or wasn&apos;t lighter, so the
              original was kept. Consider editing the notes.
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** "avg 21 · 0 of 25 above 60" for the course header (only measured lessons count). */
export function courseLoadSummary(loads: (CognitiveLoad | null)[]): string | null {
  const measured = loads.filter((l): l is CognitiveLoad => l !== null);
  if (measured.length === 0) return null;
  const average = measured.reduce((sum, l) => sum + l.index, 0) / measured.length;
  const above = measured.filter(heavy).length;
  return `cognitive load avg ${Math.round(average)} · ${above} of ${measured.length} above ${COGNITIVE_LOAD_TARGET}`;
}
