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
    getVoterToken: () => '00000000-0000-4000-8000-000000000001',
    getOpenTopics: vi.fn(async () => db.rows.map((r) => ({ ...r }))),
    rateTopic: vi.fn(async (id: string, _t: string, rating: number) => {
      const row = db.rows.find((r) => r.id === id)!;
      Object.assign(row, { myRating: rating, ratingCount: 1, ratingAvg: rating, score: rating >= 3 ? rating : 0 });
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
  return { id, title, source, ratingAvg: null, ratingCount: 0, score: 0, myRating: null };
}

const renderPage = () => render(<MemoryRouter><TopicsPage /></MemoryRouter>);
const titles = () => screen.getAllByTestId('topic-row').map((r) => r.querySelector('p')!.textContent);

describe('P1347 /topics', () => {
  beforeEach(() => {
    db.user = null;
    db.rows = [topic('a', 'Free will'), topic('b', 'Loneliness'), topic('c', 'Quit a job?', 'community')];
  });

  it('is a list with five stars per topic, no video, and attendee topics on top', async () => {
    renderPage();
    const rows = await screen.findAllByTestId('topic-row');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(within(row).getAllByRole('radio')).toHaveLength(5);
    expect(titles()[0]).toBe('Quit a job?');
    expect(within(rows[0]).getByText('Added by an attendee')).toBeInTheDocument();
    expect(document.querySelector('iframe, img')).toBeNull();
  });

  it('has exactly one way to add ideas: the "Add your own topic" button at the top', async () => {
    renderPage();
    await screen.findAllByTestId('topic-row');
    expect(screen.getAllByRole('button', { name: /add your own/i })).toHaveLength(1);
    expect(screen.queryByText(/ideas/i)).toBeNull();
  });

  it('averages stay hidden until this phone votes, then show for every topic', async () => {
    renderPage();
    const rows = await screen.findAllByTestId('topic-row');
    expect(screen.queryByTestId('topic-average')).toBeNull();
    fireEvent.click(within(rows[1]).getByRole('radio', { name: '4 stars' }));
    await waitFor(() => expect(screen.getAllByTestId('topic-average')).toHaveLength(3));
    expect(screen.getByText('4.0 from 1 vote')).toBeInTheDocument();
  });

  it('rows keep their place while you vote (no jumping under the finger)', async () => {
    renderPage();
    await screen.findAllByTestId('topic-row');
    const before = titles();
    fireEvent.click(within(screen.getAllByTestId('topic-row')[2]).getByRole('radio', { name: '5 stars' }));
    await waitFor(() => expect(screen.getAllByTestId('topic-average').length).toBeGreaterThan(0));
    expect(titles()).toEqual(before);
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

  it('signed out: adding asks to sign in', async () => {
    renderPage();
    await screen.findAllByTestId('topic-row');
    fireEvent.click(screen.getByRole('button', { name: /add your own/i }));
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?redirect=%2Ftopics');
  });

  it('signed in: an added topic appears above the host topics', async () => {
    db.user = { id: 'user-id-1234' };
    renderPage();
    await screen.findAllByTestId('topic-row');
    fireEvent.click(screen.getByRole('button', { name: /add your own/i }));
    fireEvent.change(screen.getByLabelText('Your topic'), { target: { value: 'Should we work 4 days?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add topic' }));
    await waitFor(() => expect(screen.getAllByTestId('topic-row')).toHaveLength(4));
    const order = titles();
    expect(order.indexOf('Should we work 4 days?')).toBeLessThan(order.indexOf('Free will'));
  });
});

describe('P1347 helpers', () => {
  const t = (id: string, score: number, ratingCount: number, source: 'host' | 'community' = 'host') =>
    ({ id, score, ratingCount, source }) as OpenTopic;

  it('attendee topics first, then score, then raters, then published order', () => {
    expect(
      rankTopics([t('a', 1, 5), t('b', 3, 1), t('c', 0, 0, 'community'), t('d', 1, 9), t('e', 0, 0)]).map((x) => x.id),
    ).toEqual(['c', 'b', 'd', 'a', 'e']);
  });

  it('accepts only https links, and blank', () => {
    expect(isValidOptionalLink('')).toBe(true);
    expect(isValidOptionalLink('https://youtu.be/x')).toBe(true);
    expect(isValidOptionalLink('http://youtu.be/x')).toBe(false);
    expect(isValidOptionalLink('javascript:alert(1)')).toBe(false);
  });
});
