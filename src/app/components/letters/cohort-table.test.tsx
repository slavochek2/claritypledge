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

function renderTable(s: OverviewStory, deliveries: OverviewDelivery[], responses: { delivery_id: string; point_id: string; position: 'agree' }[] = []) {
  return render(
    <MemoryRouter>
      <CohortTable
        story={s}
        deliveries={deliveries}
        ratings={[]}
        predictions={[]}
        responses={responses as never}
        letterId="l1"
        letterMode="one-to-one"
      />
    </MemoryRouter>,
  );
}

describe('CohortTable results link', () => {
  it('a completed recipient keeps Results when the story has no points', () => {
    renderTable(story([]), [delivery({ completed_at: '2026-10-20T10:00:00Z' })]);
    const link = screen.getByRole('link', { name: /open results/ });
    expect(link).toHaveAttribute('href', '/letter/l1/results?delivery=dv1&story=s1');
    expect(screen.queryByText(/Waiting/)).toBeNull();
  });

  it('a recipient who has not finished and has no position still waits', () => {
    renderTable(story([]), [delivery()]);
    expect(screen.queryByRole('link', { name: /open results/ })).toBeNull();
    expect(screen.getByText(/Waiting/)).toBeInTheDocument();
  });

  it('a recipient with a position keeps Results (unchanged)', () => {
    renderTable(story([{ id: 'p1', text: 'Point', hashtag: '', sort_order: 0 }]), [delivery()], [{ delivery_id: 'dv1', point_id: 'p1', position: 'agree' }]);
    expect(screen.getByRole('link', { name: /open results/ })).toBeInTheDocument();
  });
});
