/**
 * P1347: /topics behaviour with the data layer mocked (founder redesign: list + stars,
 * no videos, one "Add your own" at the top, attendee topics above the host's).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const db = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, user: null as null | { id: string } }));

vi.mock('@/app/data/topic-voting', async (orig) => {
  const real = await orig<typeof import('@/app/data/topic-voting')>();
  return {
    ...real,
    getOpenTopics: vi.fn(async () => db.rows.map((r) => ({ ...r }))),
    rateTopic: vi.fn(async (id: string, rating: number, isPublic: boolean) => {
      const row = db.rows.find((r) => r.id === id)!;
      Object.assign(row, {
        myRating: rating, myIsPublic: isPublic, ratingCount: 1, ratingAvg: rating,
        voters: isPublic ? [{ name: 'Test Voter', slug: 'test-voter', avatarUrl: null, avatarColor: null, hasPledged: false }] : [],
      });
      return true;
    }),
    setMyVotesPublic: vi.fn(async () => true),
    clearTopicRating: vi.fn(async (id: string) => {
      const row = db.rows.find((r) => r.id === id)!;
      Object.assign(row, { myRating: null, myIsPublic: null, ratingCount: null, ratingAvg: null, voters: null });
      return true;
    }),
    addTopic: vi.fn(async ({ title }: { title: string }) => {
      db.rows.push(topic('new', title, 'community'));
      return 'ok';
    }),
  };
});
vi.mock('@/app/data/api', () => ({ getUpcomingEvents: vi.fn(async () => []) }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: db.user, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

import { TopicsPage } from '@/app/pages/topics-page';
import { rankTopics, isValidOptionalLink, type OpenTopic } from '@/app/data/topic-voting';

function topic(id: string, title: string, source: 'host' | 'community' = 'host'): Record<string, unknown> {
  return { id, title, why: null, track: 'room', source, myRating: null, myIsPublic: null, ratingAvg: null, ratingCount: null, voters: null, author: null };
}

const renderPage = () => render(<MemoryRouter><TopicsPage /></MemoryRouter>);
const titles = () => screen.getAllByTestId('topic-title').map((t) => t.textContent);

describe('P1347 /topics', () => {
  beforeEach(() => {
    db.user = { id: 'user-id-1234' };
    db.rows = [topic('a', 'Free will'), topic('b', 'Loneliness'), topic('c', 'Quit a job?', 'community')];
  });

  it('is a list with five stars per topic, no video, and attendee topics on top', async () => {
    renderPage();
    const rows = await screen.findAllByTestId('topic-row');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(within(row).getAllByRole('radio')).toHaveLength(5);
    expect(titles()[0]).toBe('Quit a job?');
    fireEvent.click(within(rows[0]).getByRole('button', { name: /Quit a job/ }));
    expect(within(rows[0]).getByTestId('topic-author')).toHaveTextContent('Added by an attendee');
    expect(document.querySelector('iframe, img')).toBeNull();
  });

  it('tapping a topic shows a short "read more"; online topics are tagged', async () => {
    db.rows = [{ ...topic('a', 'Free will'), why: 'If every choice has a cause, are we still free?', track: 'online' }];
    renderPage();
    const row = (await screen.findAllByTestId('topic-row'))[0];
    expect(within(row).getByText('Online')).toBeInTheDocument();
    expect(within(row).queryByTestId('topic-why')).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: /Free will/ }));
    expect(within(row).getByTestId('topic-why')).toHaveTextContent('If every choice has a cause');
  });

  it('shows 8 topics, then 8 more per tap', async () => {
    db.rows = Array.from({ length: 20 }, (_, i) => topic(`t${i}`, `Topic ${i}`));
    renderPage();
    expect(await screen.findAllByTestId('topic-row')).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Show 8 more' }));
    expect(screen.getAllByTestId('topic-row')).toHaveLength(16);
    fireEvent.click(screen.getByRole('button', { name: 'Show 4 more' }));
    expect(screen.getAllByTestId('topic-row')).toHaveLength(20);
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
  });

  it('has exactly one way to add ideas: the "Add your own topic" button at the top', async () => {
    renderPage();
    await screen.findAllByTestId('topic-row');
    expect(screen.getAllByRole('button', { name: /add a topic/i })).toHaveLength(1);
    expect(screen.queryByText(/ideas/i)).toBeNull();
  });

  it('the result shows only on the topic you voted on, with your photo when you chose to show it', async () => {
    renderPage();
    const rows = await screen.findAllByTestId('topic-row');
    expect(screen.queryByTestId('topic-average')).toBeNull();
    fireEvent.click(within(rows[1]).getByRole('radio', { name: '4 stars' }));
    await waitFor(() => expect(screen.getAllByTestId('topic-average')).toHaveLength(1));
    expect(within(rows[1]).getByTestId('topic-average')).toHaveTextContent('4.0');
    expect(within(rows[1]).getByTestId('topic-voters')).toBeInTheDocument();
    expect(within(rows[0]).queryByTestId('topic-average')).toBeNull();
  });

  it('ticking "Hide my photo on my votes" hides your photo', async () => {
    const mod = await import('@/app/data/topic-voting');
    renderPage();
    const rows = await screen.findAllByTestId('topic-row');
    fireEvent.click(screen.getByLabelText('Hide my photo on my votes'));
    await waitFor(() => expect(mod.setMyVotesPublic).toHaveBeenCalledWith(false));
    fireEvent.click(within(rows[0]).getByRole('radio', { name: '5 stars' }));
    await waitFor(() => expect(mod.rateTopic).toHaveBeenLastCalledWith(expect.any(String), 5, false));
    await waitFor(() => expect(within(rows[0]).getByTestId('topic-average')).toBeInTheDocument());
    expect(within(within(rows[0]).getByTestId('topic-voters')).queryAllByTestId('gravatar-avatar')).toHaveLength(0); // counted, no face
  });

  it('signed out: can tap stars; asked to sign up or log in to save; nothing is sent', async () => {
    const mod = await import('@/app/data/topic-voting');
    vi.mocked(mod.rateTopic).mockClear();
    db.user = null;
    renderPage();
    const rows = await screen.findAllByTestId('topic-row');
    expect(screen.queryByTestId('guest-save')).toBeNull();
    fireEvent.click(within(rows[0]).getByRole('radio', { name: '4 stars' }));
    expect(within(rows[0]).getByRole('radio', { name: '4 stars' })).toHaveAttribute('aria-checked', 'true');
    expect(within(rows[0]).getByTestId('guest-save')).toHaveTextContent('Sign up or log in to save your rating');
    expect(mod.rateTopic).not.toHaveBeenCalled();
    expect(within(rows[0]).queryByTestId('topic-average')).toBeNull();
    localStorage.clear();
  });

  it('rows keep their place while you vote (no jumping under the finger)', async () => {
    renderPage();
    await screen.findAllByTestId('topic-row');
    const before = titles();
    fireEvent.click(within(screen.getAllByTestId('topic-row')[2]).getByRole('radio', { name: '5 stars' }));
    await waitFor(() => expect(screen.getAllByTestId('topic-average').length).toBeGreaterThan(0));
    expect(titles()).toEqual(before);
  });

  it('sort: My ratings puts rated topics first, without moving rows on later taps', async () => {
    db.rows = [topic('a', 'Free will'), topic('b', 'Loneliness'), { ...topic('c', 'Work'), myRating: 5, ratingAvg: 5, ratingCount: 1, voters: [] }];
    renderPage();
    await screen.findAllByTestId('topic-row');
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'mine' } });
    expect(titles()[0]).toBe('Work');
    fireEvent.click(within(screen.getAllByTestId('topic-row')[2]).getByRole('radio', { name: '5 stars' }));
    await waitFor(() => expect(screen.getAllByTestId('topic-average')).toHaveLength(2));
    expect(titles()[0]).toBe('Work');
  });

  it('tapping your current star again takes the rating back', async () => {
    renderPage();
    const rows = await screen.findAllByTestId('topic-row');
    fireEvent.click(within(rows[0]).getByRole('radio', { name: '3 stars' }));
    await waitFor(() => expect(within(rows[0]).getByTestId('topic-average')).toBeInTheDocument());
    fireEvent.click(within(rows[0]).getByRole('radio', { name: '3 stars' }));
    await waitFor(() => expect(within(rows[0]).queryByTestId('topic-average')).toBeNull());
    expect(within(rows[0]).getByRole('radio', { name: '3 stars' })).toHaveAttribute('aria-checked', 'false');
  });

  it('stars tapped while signed out are saved after sign-in with the existing hidden-photo choice', async () => {
    const mod = await import('@/app/data/topic-voting');
    vi.mocked(mod.rateTopic).mockClear();
    db.rows[0] = { ...db.rows[0], myRating: 2, myIsPublic: false, ratingAvg: 2, ratingCount: 1, voters: [] };
    // P1414: localStorage with a timestamp (kept a day), so the email sign-in link's new tab finds them.
    localStorage.setItem('p1347-guest-ratings', JSON.stringify({ at: Date.now(), r: { b: 5 } }));
    renderPage();
    await waitFor(() => expect(mod.rateTopic).toHaveBeenCalledWith('b', 5, false));
    await waitFor(() => expect(localStorage.getItem('p1347-guest-ratings')).toBeNull());
  });

  it('a failed vote rolls the stars back and says so', async () => {
    const mod = await import('@/app/data/topic-voting');
    vi.mocked(mod.rateTopic).mockResolvedValueOnce(false);
    renderPage();
    const rows = await screen.findAllByTestId('topic-row');
    fireEvent.click(within(rows[0]).getByRole('radio', { name: '3 stars' }));
    expect(await within(rows[0]).findByText(/Not saved/)).toBeInTheDocument();
    expect(within(rows[0]).getByRole('radio', { name: '3 stars' })).toHaveAttribute('aria-checked', 'false');
  });

  it('signed in: an added topic appears above the host topics', async () => {
    renderPage();
    await screen.findAllByTestId('topic-row');
    fireEvent.click(screen.getByRole('button', { name: /add a topic/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Your topic'), { target: { value: 'Should we work 4 days?' } });
    fireEvent.change(within(dialog).getByLabelText('Comment or YouTube link (optional)'), {
      target: { value: 'Great talk https://youtu.be/abc here' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit' }));
    const mod = await import('@/app/data/topic-voting');
    await waitFor(() =>
      expect(mod.addTopic).toHaveBeenCalledWith({ title: 'Should we work 4 days?', note: 'Great talk here', link: 'https://youtu.be/abc', anonymous: false }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(screen.getAllByTestId('topic-row')).toHaveLength(4));
    const order = titles();
    expect(order.indexOf('Should we work 4 days?')).toBeLessThan(order.indexOf('Free will'));
  });
});

describe('P1347 helpers', () => {
  const t = (id: string, source: 'host' | 'community' = 'host') => ({ id, source }) as OpenTopic;

  it('attendee topics first, otherwise the server order', () => {
    expect(rankTopics([t('a'), t('b'), t('c', 'community'), t('d'), t('e', 'community')]).map((x) => x.id)).toEqual([
      'c', 'e', 'a', 'b', 'd',
    ]);
  });

  it('accepts only https links, and blank', () => {
    expect(isValidOptionalLink('')).toBe(true);
    expect(isValidOptionalLink('https://youtu.be/x')).toBe(true);
    expect(isValidOptionalLink('http://youtu.be/x')).toBe(false);
    expect(isValidOptionalLink('javascript:alert(1)')).toBe(false);
  });
});
