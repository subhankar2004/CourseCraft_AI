// @vitest-environment jsdom
import type { CognitiveLoad } from '@coursecraft/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CognitiveLoadBadge, CognitiveLoadDetails, courseLoadSummary } from './cognitive-load';

const load = (over: Partial<CognitiveLoad> = {}): CognitiveLoad => ({
  fleschKincaid: 9.46,
  avgSentenceLen: 14.2,
  conceptDensity: 3.06,
  index: 21.4,
  words: 420,
  simplified: false,
  simplifyAttempted: false,
  originalIndex: null,
  ...over,
});

afterEach(cleanup);

describe('cognitive load display (#43)', () => {
  it('labels the badge for screen readers, flagging values above the target', () => {
    render(
      <>
        <CognitiveLoadBadge load={load()} />
        <CognitiveLoadBadge load={load({ index: 72.6 })} />
        <CognitiveLoadBadge load={null} />
      </>,
    );
    expect(screen.getByText('Cognitive load 21 of 100')).toBeTruthy();
    expect(screen.getByText('Cognitive load 73 of 100, above the target of 60')).toBeTruthy();
    expect(screen.getByText('Cognitive load not measured')).toBeTruthy();
  });

  it('shows the parts and what the simplify loop did', () => {
    render(
      <CognitiveLoadDetails
        load={load({ index: 48, simplified: true, simplifyAttempted: true, originalIndex: 71.2 })}
      />,
    );
    expect(screen.getByText('9.5')).toBeTruthy(); // reading grade
    expect(screen.getByText('14.2')).toBeTruthy(); // words per sentence
    expect(screen.getByText('3.1')).toBeTruthy(); // key terms per 100 words
    expect(screen.getByText(/Simplified automatically from 71/)).toBeTruthy();
    cleanup();
    render(<CognitiveLoadDetails load={load({ index: 70, simplifyAttempted: true })} />);
    expect(screen.getByText(/the original was kept/)).toBeTruthy();
    cleanup();
    render(<CognitiveLoadDetails load={null} />);
    expect(screen.getByText(/Not measured/)).toBeTruthy();
  });

  it('summarises a course over its measured lessons', () => {
    expect(courseLoadSummary([load({ index: 20 }), load({ index: 70 }), null])).toBe(
      'cognitive load avg 45 · 1 of 2 above 60',
    );
    expect(courseLoadSummary([null])).toBeNull();
  });
});
