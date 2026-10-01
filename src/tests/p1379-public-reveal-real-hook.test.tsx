/**
 * @file p1379-public-reveal-real-hook.test.tsx
 * @description P1379 review G/D: the public story-reveal skip, driven by the REAL
 * useLetterReadingState (local mode, as anonymous public readers use it), under
 * React.StrictMode. Proves:
 *   - rating story 1 goes straight to story 2's rating (no reveal screen),
 *   - rating the LAST story completes the letter (isLocalCompleted), no double-advance,
 *   - a multi-point story (lead_count 0, two points) still presents its points after
 *     the skipped reveal (P898 remaining points are not jumped over),
 *   - CONTROL: the same flow as a one-to-one letter stops on the reveal.
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React, { useEffect } from 'react';

vi.mock('@/auth', () => ({ useAuth: () => ({ session: null, user: null }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/shared/PositionButton', async (importActual) => ({
  ...(await importActual<typeof import('@/app/components/shared/PositionButton')>()),
  PositionButtons: () => null,
}));
vi.mock('@/app/components/shared/remove-position-dialog', () => ({
  RemovePositionDialog: () => null,
  useRemovePositionGuard: () => ({ dialogProps: {}, guardedRemovePosition: vi.fn() }),
}));
vi.mock('@/app/components/letters/letter-progress-bar', () => ({ LetterProgressBar: () => null }));
vi.mock('@/app/components/partners/live-story-card-expanded', () => ({
  LiveStoryCardExpanded: () => <div data-testid="story-card" />,
  PointRow: () => <div data-testid="point-row" />,
}));
vi.mock('@/app/components/shared/fixed-bottom-bar', () => ({
  FixedBottomBar: ({ children }: { children: React.ReactNode }) => <div data-testid="fixed-bottom-bar">{children}</div>,
}));

import { LetterFlowContent } from '@/app/components/letters/letter-flow-content';
import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import type { LetterMode, LetterStorySnapshot } from '@/app/types';

function snap(storyId: string, position: number, points: Array<{ id: string; text: string }> = [], leadCount?: number): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: storyId,
    version_id: `v-${storyId}`,
    position,
    point_config: {
      storyText: `Story ${storyId}`,
      storyTitle: `Story ${storyId}`,
      points: points.map((p) => ({ ...p, visibility: 'visible', authorPosition: null })),
      ...(leadCount !== undefined ? { lead_count: leadCount } : {}),
    },
    visibility: 'published',
  };
}

const SENDER = { id: 'sender-1', name: 'Alice Author', avatarColor: '#000', avatarUrl: undefined, hasPledged: false };
const advanceSpy = vi.fn();

function Harness({ snapshots, mode }: { snapshots: LetterStorySnapshot[]; mode: LetterMode }) {
  const rs = useLetterReadingState({ mode: 'local', letterId: 'letter-1', senderId: 'sender-1', snapshots });
  // Same as LetterReadingFlowPublic: pass through the transition interstitial.
  useEffect(() => {
    if (rs.currentPhase === 'transition') rs.nextStory();
  }, [rs.currentPhase, rs.nextStory]); // eslint-disable-line react-hooks/exhaustive-deps
  const spied = {
    ...rs,
    advanceFromStoryReveal: () => { advanceSpy(rs.state.currentStoryIndex); rs.advanceFromStoryReveal(); },
  };
  return (
    <>
      <div data-testid="phase">{rs.currentPhase}</div>
      <div data-testid="story-index">{rs.state.currentStoryIndex}</div>
      <div data-testid="completed">{String(rs.isLocalCompleted)}</div>
      <LetterFlowContent
        snapshots={snapshots}
        senderName="Alice Author"
        senderProfileOwner={SENDER}
        readingState={spied}
        letterMode={mode}
        responsesMode="off"
        renderCompletion={() => <div data-testid="completion" />}
      />
    </>
  );
}

function renderHarness(snapshots: LetterStorySnapshot[], mode: LetterMode) {
  advanceSpy.mockClear();
  return render(
    <React.StrictMode>
      <BrowserRouter>
        <Harness snapshots={snapshots} mode={mode} />
      </BrowserRouter>
    </React.StrictMode>
  );
}

async function rate(value: number) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: `Rate ${value}` })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^continue$/i })); });
}

describe('P1379: public reveal skip with the real reading-state hook (StrictMode)', () => {
  it('story 1 → straight to story 2 rating; last story → completes; exactly one advance per story', async () => {
    renderHarness([snap('s1', 0), snap('s2', 1)], 'one-to-many');
    await rate(4);
    expect(screen.getByTestId('story-index')).toHaveTextContent('1');
    expect(screen.getByTestId('phase')).toHaveTextContent('story-rate');
    await rate(6);
    expect(screen.getByTestId('completed')).toHaveTextContent('true');
    // StrictMode double-invokes effects: still exactly one advance per story.
    expect(advanceSpy.mock.calls.map((c) => c[0])).toEqual([0, 1]);
    expect(document.body.textContent).not.toMatch(/You said|Calibration data unavailable/);
  });

  it('multi-point story (lead_count 0): after the skipped reveal, its points are still presented', async () => {
    renderHarness([snap('s1', 0, [{ id: 'p1', text: 'Point one' }, { id: 'p2', text: 'Point two' }], 0)], 'one-to-many');
    expect(screen.getByTestId('phase')).toHaveTextContent('story-rate');
    await rate(5);
    expect(screen.getByTestId('phase')).toHaveTextContent('remaining-point-engage');
    expect(screen.getByTestId('completed')).toHaveTextContent('false');
    expect(advanceSpy).toHaveBeenCalledTimes(1);
  });

  it('CONTROL one-to-one: stops on the reveal (no auto-advance)', async () => {
    renderHarness([snap('s1', 0), snap('s2', 1)], 'one-to-one');
    await rate(4);
    expect(screen.getByTestId('phase')).toHaveTextContent('story-revealed');
    expect(advanceSpy).not.toHaveBeenCalled();
  });
});
