/**
 * P1347: /topics behaviour with the data layer mocked.
 *   - each card rates 0–5, several topics can be rated;
 *   - results (order + rating counts + next event) are hidden until this device rates;
 *   - suggestions ask a signed-out visitor to sign in instead of showing a form;
 *   - the pure helpers rank by score and accept only https links.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const topicsState = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/app/data/topic-voting', async (orig) => {
  const real = await orig<typeof import('@/app/data/topic-voting')>();
  return {
    ...real,
    getVoterToken: () => '00000000-0000-4000-8000-000000000001',
    getOpenTopics: vi.fn(async () => topicsState.rows.map((r) => ({ ...r }))),
    rateTopic: vi.fn(async (id: string, _t: string, rating: number) => {
      const row = topicsState.rows.find((r) => r.id === id)!;
      row.myRating = rating;
      row.ratingCount = 1;
      row.ratingAvg = rating;
      row.score = rating >= 3 ? rating : 0;
      return true;
    }),
    suggestTopic: vi.fn(async () => true),
  };
});

vi.mock('@/app/data/api', () => ({
  getUpcomingEvents: vi.fn(async () => [
    { slug: 'clarity-night-3', datetime: new Date(Date.now() + 86_400_000 * 5).toISOString(), status: 'upcoming' },
  ]),
}));

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

import { TopicsPage } from '@/app/pages/topics-page';
import { rankTopics, isValidOptionalLink, type OpenTopic } from '@/app/data/topic-voting';

function topic(id: string, title: string): Record<string, unknown> {
  return {
    id, title, why: `${title} is contested.`, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    thinkerName: `Thinker ${id}`, ratingAvg: null, ratingCount: 0, score: 0, myRating: null,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TopicsPage />
    </MemoryRouter>,
  );
}

describe('P1347 /topics', () => {
  beforeEach(() => {
    topicsState.rows = [topic('a', 'AI and work'), topic('b', 'Free will'), topic('c', 'Ikigai')];
  });

  it('shows each topic with a 0–5 rating control and no results before rating', async () => {
    renderPage();
    const cards = await screen.findAllByTestId('topic-card');
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(within(card).getAllByRole('radio').map((b) => b.textContent)).toEqual(['0', '1', '2', '3', '4', '5']);
    }
    expect(screen.queryByTestId('topic-results')).toBeNull();
  });

  it('rating several topics marks each, then reveals the order with counts and the next event', async () => {
    renderPage();
    const cards = await screen.findAllByTestId('topic-card');
    fireEvent.click(within(cards[0]).getByRole('radio', { name: /^4$/ }));
    fireEvent.click(within(cards[1]).getByRole('radio', { name: /5, I really want it/ }));

    const results = await screen.findByTestId('topic-results');
    await waitFor(() => {
      expect(within(cards[0]).getByRole('radio', { name: /^4$/ })).toHaveAttribute('aria-checked', 'true');
      expect(within(cards[1]).getByRole('radio', { name: /5, I really/ })).toHaveAttribute('aria-checked', 'true');
    });
    const items = within(results).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items[0]).toContain('Free will');
    expect(items[0]).toContain('from 1 rating');
    expect(items[2]).toContain('No ratings yet');
    expect(within(results).getByRole('link')).toHaveAttribute('href', '/events/clarity-night-3');
    expect(results.textContent).toContain('Top-rated now: Free will');
  });

  it('asks a signed-out visitor to sign in before suggesting', async () => {
    renderPage();
    await screen.findAllByTestId('topic-card');
    fireEvent.click(screen.getByRole('button', { name: /suggest a topic or a speaker/i }));
    expect(screen.getAllByRole('link', { name: 'Sign in' })[0]).toHaveAttribute('href', '/login?redirect=%2Ftopics');
    expect(screen.queryByLabelText('Your suggestion')).toBeNull();
  });

  it('says so when nothing is open, and still offers a suggestion', async () => {
    topicsState.rows = [];
    renderPage();
    expect(await screen.findByText(/no topics to rate yet/)).toBeInTheDocument();
    expect(screen.getByTestId('suggest-new')).toBeInTheDocument();
  });

  it('a failed save rolls the selection back, says so, and does not reveal results', async () => {
    const mod = await import('@/app/data/topic-voting');
    vi.mocked(mod.rateTopic).mockResolvedValueOnce(false);
    renderPage();
    const cards = await screen.findAllByTestId('topic-card');
    fireEvent.click(within(cards[0]).getByRole('radio', { name: /^3$/ }));
    expect(await within(cards[0]).findByText(/Not saved/)).toBeInTheDocument();
    expect(within(cards[0]).getByRole('radio', { name: /^3$/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByTestId('topic-results')).toBeNull();
  });
});

describe('P1347 helpers', () => {
  const t = (id: string, score: number, ratingCount: number) => ({ id, score, ratingCount }) as OpenTopic;

  it('ranks by score, then by number of raters, then keeps published order', () => {
    expect(rankTopics([t('a', 1, 5), t('b', 3, 1), t('c', 1, 9), t('d', 0, 0), t('e', 0, 0)]).map((x) => x.id)).toEqual([
      'b', 'c', 'a', 'd', 'e',
    ]);
  });

  it('accepts only https links, and blank', () => {
    expect(isValidOptionalLink('')).toBe(true);
    expect(isValidOptionalLink('https://youtu.be/x')).toBe(true);
    expect(isValidOptionalLink('http://youtu.be/x')).toBe(false);
    expect(isValidOptionalLink('javascript:alert(1)')).toBe(false);
    expect(isValidOptionalLink('youtube.com')).toBe(false);
  });
});
