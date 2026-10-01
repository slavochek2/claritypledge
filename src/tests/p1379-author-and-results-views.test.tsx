/**
 * @file p1379-author-and-results-views.test.tsx
 * @description P1379 A2/A4: the author overview (CohortTable) and the results walk
 * (StoryWalk) for one-to-many letters show ratings only — no prediction column, no
 * belief row, no gap — even when an old public letter still hands them predictions.
 * One-to-one rendering is asserted unchanged as the control.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/partners/live-story-card-expanded', () => ({
  LiveStoryCardExpanded: () => <div data-testid="story-card" />,
}));
vi.mock('@/app/components/partners/live-mode-view', () => ({
  JourneyToUnderstanding: (props: { checkerRating?: number; responderRating?: number }) => (
    <div data-testid="journey">belief {String(props.checkerRating)} confidence {String(props.responderRating)}</div>
  ),
}));
vi.mock('@/app/components/letters/start-clarity-session-button', () => ({
  StartClaritySessionButton: () => null,
}));
vi.mock('@/app/components/shared/fixed-bottom-bar', () => ({
  FixedBottomBar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CohortTable } from '@/app/components/letters/cohort-table';
import { StoryWalk } from '@/app/components/letters/story-walk';
import type { OverviewStory, OverviewDelivery, OverviewPrediction, StoryWalkItem, LetterStorySnapshot } from '@/app/types';

// ── CohortTable ──────────────────────────────────────────────────────────────

const STORY: OverviewStory = {
  story_id: 's1',
  position: 0,
  title: 'Story',
  content: 'Story body',
  hashtags: [],
  points: [],
};

function delivery(id: string, name: string): OverviewDelivery {
  return {
    delivery_id: id,
    display_name: name,
    full_display_name: name,
    profile_slug: null,
    profile_id: null,
    avatar_url: null,
    has_pledged: false,
    has_responded: true,
    completed_at: null,
  };
}

const DELIVERIES = [delivery('d1', 'Reader One'), delivery('d2', 'Reader Two'), delivery('d3', 'Reader Three')];
const RATINGS = [
  { delivery_id: 'd1', story_id: 's1', listener_rating: 9 },
  { delivery_id: 'd2', story_id: 's1', listener_rating: 2 },
  { delivery_id: 'd3', story_id: 's1', listener_rating: 5 },
];
/** Shared (delivery_id null) prediction — what an OLD public letter still stores. */
const STORED_PREDICTIONS: OverviewPrediction[] = [{ delivery_id: null, story_id: 's1', prediction: 8 }];

function renderCohort(letterMode: 'one-to-one' | 'one-to-many' | undefined, ratings = RATINGS, predictions = STORED_PREDICTIONS) {
  return render(
    <BrowserRouter>
      <CohortTable
        story={STORY}
        deliveries={DELIVERIES}
        ratings={ratings}
        predictions={predictions}
        responses={[]}
        letterId="letter-1"
        letterMode={letterMode}
      />
    </BrowserRouter>
  );
}

describe('P1379 A4: CohortTable', () => {
  it('one-to-many: summary line above rows, "Their rating" column, no prediction even when stored', () => {
    const { container } = renderCohort('one-to-many');
    expect(screen.getByTestId('cohort-rating-summary')).toHaveTextContent('3 readers · median 5 · range 2–9');
    expect(screen.queryByText('You → Them')).not.toBeInTheDocument();
    expect(screen.getByText('Their rating')).toBeInTheDocument();
    const cells = screen.getAllByTestId('cohort-rating-cell').map((c) => c.textContent);
    expect(cells).toEqual(['9', '2', '5']);
    expect(container.textContent).not.toMatch(/→/);
    expect(container.textContent).not.toMatch(/\b8\b/);
    // Per-reader rows stay
    expect(screen.getByText('Reader One')).toBeInTheDocument();
  });

  it('one-to-many with no ratings: "No ratings yet"', () => {
    renderCohort('one-to-many', [], []);
    expect(screen.getByTestId('cohort-rating-summary')).toHaveTextContent('No ratings yet');
  });

  it('CONTROL one-to-one: "You → Them" column with prediction → rating, no summary line', () => {
    renderCohort('one-to-one', RATINGS, [{ delivery_id: 'd1', story_id: 's1', prediction: 6 }]);
    expect(screen.getByText('You → Them')).toBeInTheDocument();
    expect(screen.queryByTestId('cohort-rating-summary')).not.toBeInTheDocument();
    const row = screen.getByText('Reader One').closest('tr')!;
    expect(within(row).getByText(/6\s*→\s*9/)).toBeInTheDocument();
  });

  it('letterMode unknown (failed mode read): fails closed — no prediction column', () => {
    const { container } = renderCohort(undefined);
    expect(screen.queryByText('You → Them')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b8\b/);
  });
});

// ── StoryWalk ────────────────────────────────────────────────────────────────

const SNAPSHOT: LetterStorySnapshot = {
  letter_id: 'letter-1',
  story_id: 's1',
  version_id: 'v1',
  position: 0,
  point_config: { storyText: 'Story body', storyTitle: 'Story', points: [] },
  visibility: 'published',
};

function walkItem(prediction: number | undefined, rating: number): StoryWalkItem {
  return {
    storyId: 's1',
    position: 0,
    snapshot: SNAPSHOT,
    prediction,
    rating,
    gap: prediction !== undefined ? Math.abs(prediction - rating) : undefined,
    isOverconfident: prediction !== undefined ? prediction > rating : false,
    receiverPositions: new Map(),
    viewerPositions: new Map(),
    explainBack: null,
    explainBackUnread: false,
  };
}

const PROFILE = { id: 'sender-1', name: 'Alice', slug: null, hasPledged: false, earsCount: 0 };

function renderWalk(letterMode: 'one-to-one' | 'one-to-many' | null, perspective: 'sender' | 'receiver', item: StoryWalkItem) {
  return render(
    <BrowserRouter>
      <StoryWalk
        stories={[item]}
        perspective={perspective}
        senderProfile={PROFILE}
        receiverProfile={null}
        senderName="Alice"
        receiverName="Bob"
        letterMode={letterMode}
      />
    </BrowserRouter>
  );
}

describe('P1379 A2/A4: StoryWalk (results page)', () => {
  it('one-to-many reader: "You said N out of 10.", no belief row, no gap line', () => {
    // prediction deliberately present: the component must not render it for one-to-many
    const { container } = renderWalk('one-to-many', 'receiver', walkItem(8, 4));
    expect(screen.getByTestId('story-walk-rating-only')).toHaveTextContent('You said 4 out of 10.');
    expect(screen.queryByTestId('journey')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/thinks you understand|believes you understand/);
  });

  it('one-to-many author: the reader\'s rating alone, no gap line', () => {
    const { container } = renderWalk('one-to-many', 'sender', walkItem(8, 4));
    expect(screen.getByTestId('story-walk-rating-only')).toHaveTextContent('Bob said 4 out of 10.');
    expect(container.textContent).not.toMatch(/You think|You believe/);
  });

  it('unknown mode (failed read): fails closed — rating only, no belief row', () => {
    renderWalk(null, 'receiver', walkItem(8, 4));
    expect(screen.getByTestId('story-walk-rating-only')).toHaveTextContent('You said 4 out of 10.');
    expect(screen.queryByTestId('journey')).not.toBeInTheDocument();
  });

  it('CONTROL one-to-one reader: belief row + gap line unchanged', () => {
    renderWalk('one-to-one', 'receiver', walkItem(8, 4));
    expect(screen.getByTestId('journey')).toHaveTextContent('belief 8 confidence 4');
    expect(screen.getByText(/Alice thinks you understand/)).toBeInTheDocument();
    expect(screen.queryByTestId('story-walk-rating-only')).not.toBeInTheDocument();
  });
});
