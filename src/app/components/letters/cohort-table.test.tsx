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
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('a recipient with a position is not Waiting and gets no repeated link', () => {
    renderTable(story([POINT]), [delivery()], [{ delivery_id: 'dv1', point_id: 'p1', position: 'agree' }]);
    expect(screen.queryByText(/Waiting/)).toBeNull();
    expect(screen.queryByText(/open results/i)).toBeNull();
  });

  it('a recipient with a recorded rating for the story: the rating line is answered; only the unanswered point still waits', () => {
    renderTable(story([POINT]), [delivery()], [], [{ delivery_id: 'dv1', story_id: 's1', listener_rating: 7 }]);
    expect(screen.getByTestId('cohort-rating-cell')).toHaveTextContent('their rating 7');
    expect(screen.getAllByText('Waiting')).toHaveLength(1); // the point line, not the rating line
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

describe('CohortTable breakdown: grouped by what was asked, one layout at every width', () => {
  const POINT = { id: 'p1', text: 'Reviews work better on Monday', hashtag: '', sort_order: 0 };
  const POINT2 = { id: 'p2', text: 'A short meeting beats a thorough one', hashtag: '', sort_order: 1 };
  const ann = delivery({ delivery_id: 'a', display_name: 'Ann', full_display_name: 'Ann Example' });
  const bob = delivery({ delivery_id: 'b', display_name: 'Bob', full_display_name: 'Bob Example' });

  function renderBoth(over: { deliveries?: OverviewDelivery[]; mode?: 'one-to-one' | 'one-to-many'; ratings?: unknown[]; predictions?: unknown[]; responses?: unknown[] } = {}) {
    return render(
      <MemoryRouter>
        <CohortTable
          story={story([POINT, POINT2])}
          deliveries={over.deliveries ?? [ann, bob]}
          ratings={(over.ratings ?? []) as never}
          predictions={(over.predictions ?? []) as never}
          responses={(over.responses ?? []) as never}
          letterMode={over.mode ?? 'one-to-one'}
        />
      </MemoryRouter>,
    );
  }

  it('is not a table: no matrix, no truncated column headers, no "You → Them" notation', () => {
    renderBoth({ ratings: [{ delivery_id: 'a', story_id: 's1', listener_rating: 8 }], predictions: [{ delivery_id: 'a', story_id: 's1', prediction: 6 }] });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('columnheader')).toBeNull();
    expect(screen.queryByText('You → Them')).toBeNull();
    expect(document.body.textContent).not.toMatch(/[\d?]\s*→\s*[\d—]/);
  });

  it('one-to-one: "Story rating" first, one line per recipient in plain words', () => {
    renderBoth({
      ratings: [{ delivery_id: 'a', story_id: 's1', listener_rating: 8 }],
      predictions: [{ delivery_id: 'a', story_id: 's1', prediction: 6 }],
    });
    const heading = screen.getByRole('heading', { name: 'Story rating' });
    const cells = screen.getAllByTestId('cohort-rating-cell').map(c => c.textContent);
    expect(cells).toEqual(['your guess 6 · their rating 8', 'Waiting']); // not answered: plain "Waiting"
    const firstPoint = screen.getByRole('heading', { name: 'Reviews work better on Monday' });
    expect(heading.compareDocumentPosition(firstPoint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // rating block first
  });

  it('every point text appears ONCE, as a subheading, however many recipients', () => {
    renderBoth({ deliveries: [ann, bob, delivery({ delivery_id: 'c', display_name: 'Cy', full_display_name: 'Cy Example' })] });
    expect(screen.getAllByText('Reviews work better on Monday')).toHaveLength(1);
    expect(screen.getAllByText('A short meeting beats a thorough one')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Reviews work better on Monday' })).toHaveAttribute('href', '/point/p1');
    // one compact line per recipient under each point
    const lines = screen.getAllByTestId('cohort-point-line');
    expect(lines).toHaveLength(3 * 2);
  });

  it('a point line is "name" then the position label, or plain "Waiting"', () => {
    renderBoth({ responses: [{ delivery_id: 'a', point_id: 'p1', position: 'agree' }] });
    const [first, second] = screen.getAllByTestId('cohort-point-line'); // point 1: Ann, Bob
    expect(first).toHaveTextContent('Ann Example');
    expect(first).toHaveTextContent('Agree');
    expect(second).toHaveTextContent('Bob Example');
    expect(second).toHaveTextContent('Waiting');
  });

  it('"Waiting" is a plain muted word: no leading dot, anywhere', () => {
    renderBoth();
    const waiting = screen.getAllByText('Waiting');
    expect(waiting.length).toBeGreaterThan(0);
    for (const w of waiting) {
      expect(w.className).toContain('text-muted-foreground');
      expect(w.textContent).toBe('Waiting');
    }
    expect(document.body.textContent).not.toContain('·  Waiting');
    expect(document.body.textContent).not.toMatch(/·\s*Waiting/);
  });

  it('a finished recipient who skipped a point reads "No response", not Waiting', () => {
    renderBoth({ deliveries: [delivery({ delivery_id: 'a', completed_at: '2026-10-20T10:00:00Z' })], ratings: [{ delivery_id: 'a', story_id: 's1', listener_rating: 5 }] });
    expect(screen.queryByText('Waiting')).toBeNull();
    expect(screen.getAllByText('No response')).toHaveLength(2);
  });

  it('the rating block carries the 24px avatar and the profile link; point lines stay plain text', () => {
    renderBoth({ deliveries: [delivery({ delivery_id: 'a', full_display_name: 'Ann Example', profile_slug: 'ann-e' })] });
    expect(screen.getAllByRole('link', { name: 'Ann Example' })).toHaveLength(1);
    expect(screen.getAllByTestId('cohort-recipient-cell')).toHaveLength(1);
    const avatar = screen.getByTestId('gravatar-avatar');
    expect(avatar.className).toMatch(/!w-6/);
    expect(avatar.className).toMatch(/!h-6/);
  });

  it('public letter: heading "Ratings", no "your guess" even when a prediction is stored', () => {
    renderBoth({
      mode: 'one-to-many',
      ratings: [{ delivery_id: 'a', story_id: 's1', listener_rating: 7 }],
      predictions: [{ delivery_id: null, story_id: 's1', prediction: 4 }],
    });
    expect(screen.getByRole('heading', { name: 'Ratings' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Story rating' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/your guess/i);
    expect(screen.getAllByTestId('cohort-rating-cell').map(c => c.textContent)).toEqual(['7', 'Waiting']);
  });

  it('a story with no points draws the rating block alone', () => {
    render(
      <MemoryRouter>
        <CohortTable story={story([])} deliveries={[ann]} ratings={[{ delivery_id: 'a', story_id: 's1', listener_rating: 3 } as never]} predictions={[]} responses={[]} letterMode="one-to-one" />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('heading')).toHaveLength(1);
    expect(screen.queryByTestId('cohort-point-line')).toBeNull();
  });
});

describe('CohortTable, public letter with nothing in for the story', () => {
  const POINT = { id: 'p1', text: 'Point', hashtag: '', sort_order: 0 };

  it('shows only "No ratings yet": no header, no placeholder recipient rows', () => {
    renderPublic(story([POINT]), [delivery({ display_name: 'Recipient', full_display_name: 'Recipient' }), delivery({ delivery_id: 'dv2' })]);
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    expect(screen.queryByTestId('cohort-rating-cell')).toBeNull();
    expect(screen.queryByText('Recipient')).toBeNull();
    expect(screen.queryByTestId('cohort-recipient-cell')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ratings' })).toBeNull();
  });

  it('CONTROL: once someone rated, the breakdown and the summary return', () => {
    renderPublic(story([POINT]), [delivery()], [{ delivery_id: 'dv1', story_id: 's1', listener_rating: 8 }]);
    expect(screen.getByRole('heading', { name: 'Ratings' })).toBeInTheDocument();
    expect(screen.getByTestId('cohort-recipient-cell')).toBeInTheDocument();
    expect(screen.queryByText('No ratings yet')).toBeNull();
  });

  it('CONTROL: a reader who answered a point but did not rate still gets their row', () => {
    renderPublic(story([POINT]), [delivery()], [], [{ delivery_id: 'dv1', point_id: 'p1', position: 'agree' }]);
    expect(screen.getByRole('heading', { name: 'Ratings' })).toBeInTheDocument();
    expect(screen.getByText('Agree')).toBeInTheDocument();
  });

  it('CONTROL: a one-to-one letter keeps its rows while waiting (the Waiting state is the point there)', () => {
    renderTable(story([POINT]), [delivery()]);
    expect(screen.getByTestId('cohort-recipient-cell')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting')).toHaveLength(2); // the rating line and the point line
  });
});
