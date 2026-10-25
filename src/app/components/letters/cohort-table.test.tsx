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

function renderPublic(s: OverviewStory, deliveries: OverviewDelivery[], ratings: { delivery_id: string; story_id: string; listener_rating: number }[] = [], responses: { delivery_id: string; point_id: string; position: 'agree' }[] = []) {
  return render(
    <MemoryRouter>
      <CohortTable story={s} deliveries={deliveries} ratings={ratings as never} predictions={[]} responses={responses as never} letterMode="one-to-many" />
    </MemoryRouter>,
  );
}

describe('CohortTable on a phone (< 640px): a stacked list, the desktop table kept from 640px', () => {
  const POINT = { id: 'p1', text: 'Reviews work better on Monday', hashtag: '', sort_order: 0 };

  it('one-to-one: the table restyles in place; every value line carries its label and runs full width', () => {
    renderTable(story([POINT]), [delivery()], [{ delivery_id: 'dv1', point_id: 'p1', position: 'agree' }]);
    const table = screen.getByRole('table');
    expect(table.className).toMatch(/\bblock\b/);
    expect(table.className).toMatch(/\bsm:table\b/); // desktop matrix from 640px
    expect(table.querySelector('thead')!.className).toMatch(/\bhidden\b/);
    expect(table.querySelector('thead')!.className).toMatch(/\bsm:table-header-group\b/);
    const row = table.querySelector('tbody tr')!;
    expect(row.className).toMatch(/\bblock\b/);
    expect(row.className).toMatch(/\bsm:table-row\b/);
    const lines = [...row.querySelectorAll('td[data-label]')] as HTMLElement[];
    expect(lines.map(td => td.getAttribute('data-label'))).toEqual(['You → Them', 'Reviews work better on Monday']);
    for (const td of lines) {
      expect(td.className).toMatch(/\bflex\b/);
      expect(td.className).toMatch(/\bjustify-between\b/); // "label ... value" on one full-width line
      expect(td.className).toMatch(/before:content-\[attr\(data-label\)\]/); // the label
      expect(td.className).toMatch(/\bsm:table-cell\b/);
      expect(td.className).toMatch(/\bsm:before:content-none\b/); // no label on the desktop matrix
    }
    expect(lines[1]).toHaveTextContent('Agree');
  });

  it('a missing response keeps its label line and reads as a dash with an accessible name', () => {
    renderTable(story([POINT]), [delivery()]);
    const line = screen.getByLabelText('No response');
    expect(line).toHaveAttribute('data-label', 'Reviews work better on Monday');
    expect(line).toHaveTextContent('—');
  });

  it('one-to-many labels the rating line "Their rating"', () => {
    renderPublic(story([POINT]), [delivery()], [{ delivery_id: 'dv1', story_id: 's1', listener_rating: 7 }]);
    const cell = screen.getByTestId('cohort-rating-cell');
    expect(cell).toHaveAttribute('data-label', 'Their rating');
    expect(cell).toHaveTextContent('7');
  });
});

describe('CohortTable, public letter with nothing in for the story', () => {
  const POINT = { id: 'p1', text: 'Point', hashtag: '', sort_order: 0 };

  it('shows only "No ratings yet": no header, no placeholder recipient rows', () => {
    renderPublic(story([POINT]), [delivery({ display_name: 'Recipient', full_display_name: 'Recipient' }), delivery({ delivery_id: 'dv2' })]);
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByText('Recipient')).toBeNull();
    expect(screen.queryByTestId('cohort-recipient-cell')).toBeNull();
    expect(screen.queryByText('Their rating')).toBeNull();
  });

  it('CONTROL: once someone rated, the table and the summary return', () => {
    renderPublic(story([POINT]), [delivery()], [{ delivery_id: 'dv1', story_id: 's1', listener_rating: 8 }]);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByTestId('cohort-recipient-cell')).toBeInTheDocument();
    expect(screen.queryByText('No ratings yet')).toBeNull();
  });

  it('CONTROL: a reader who answered a point but did not rate still gets their row', () => {
    renderPublic(story([POINT]), [delivery()], [], [{ delivery_id: 'dv1', point_id: 'p1', position: 'agree' }]);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Agree')).toBeInTheDocument();
  });

  it('CONTROL: a one-to-one letter keeps its rows while waiting (the Waiting state is the point there)', () => {
    renderTable(story([POINT]), [delivery()]);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText(/Waiting/)).toBeInTheDocument();
  });
});
