import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CohortTable } from './cohort-table';
import type { OverviewDelivery, OverviewStory } from '@/app/types';

const delivery = (over: Partial<OverviewDelivery> = {}): OverviewDelivery => ({
  delivery_id: 'dv1',
  display_name: 'Ann',
  full_display_name: 'Ann Example',
  profile_slug: null,
  profile_id: null,
  avatar_url: null,
  has_pledged: false,
  has_responded: false,
  completed_at: null,
  ...over,
});

const story = (points: OverviewStory['points'] = []): OverviewStory => ({
  story_id: 's1', position: 0, title: 'T', content: 'A story', hashtags: [], points,
});

function renderTable(
  s: OverviewStory,
  deliveries: OverviewDelivery[],
  responses: { delivery_id: string; point_id: string; position: 'agree' }[] = [],
  ratings: { delivery_id: string; story_id: string; listener_rating: number }[] = [],
) {
  return render(
    <MemoryRouter>
      <CohortTable
        story={s}
        deliveries={deliveries}
        ratings={ratings as never}
        predictions={[]}
        responses={responses as never}
        letterMode="one-to-one"
      />
    </MemoryRouter>,
  );
}

describe('CohortTable status cell', () => {
  // The person's row on the overview page opens their results; the per-story "[open results →]" link is gone.
  const POINT = { id: 'p1', text: 'Point', hashtag: '', sort_order: 0 };

  it('a completed recipient is never Waiting, even when the story has no points, and no per-story results link repeats', () => {
    renderTable(story([]), [delivery({ completed_at: '2026-10-20T10:00:00Z' })]);
    expect(screen.queryByText(/Waiting/)).toBeNull();
    expect(screen.queryByRole('link', { name: /results/i })).toBeNull();
    expect(screen.queryByText(/open results/i)).toBeNull();
  });

  it('a recipient who has not finished and has no position still waits', () => {
    renderTable(story([]), [delivery()]);
    expect(screen.getByText(/Waiting/)).toBeInTheDocument();
  });

  it('a recipient with a position is not Waiting and gets no repeated link', () => {
    renderTable(story([POINT]), [delivery()], [{ delivery_id: 'dv1', point_id: 'p1', position: 'agree' }]);
    expect(screen.queryByText(/Waiting/)).toBeNull();
    expect(screen.queryByText(/open results/i)).toBeNull();
  });

  it('a recipient with a recorded rating for the story is not Waiting', () => {
    renderTable(story([POINT]), [delivery()], [], [{ delivery_id: 'dv1', story_id: 's1', listener_rating: 7 }]);
    expect(screen.queryByText(/Waiting/)).toBeNull();
    expect(screen.getByTestId('cohort-recipient-cell')).toBeInTheDocument();
  });

  it('keeps the story detail: the recipient name and the positions stay', () => {
    renderTable(story([POINT]), [delivery({ profile_slug: 'ann-e' })], [{ delivery_id: 'dv1', point_id: 'p1', position: 'agree' }]);
    expect(screen.getByRole('link', { name: 'Ann Example' })).toHaveAttribute('href', '/p/ann-e');
    expect(screen.getByRole('link', { name: 'Point' })).toHaveAttribute('href', '/point/p1');
  });
});
