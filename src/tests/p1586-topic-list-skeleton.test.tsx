/**
 * P1586 §1: while the topic list waits inside an already-drawn frame (the topics page under its
 * header, the event close page's voting section) it shows a skeleton of the rows, never the page
 * loader (decisions 2026-04-11: the page loader never renders inside a drawn section).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/app/data/topic-voting', async (orig) => {
  const real = await orig<typeof import('@/app/data/topic-voting')>();
  return {
    ...real,
    getOpenTopics: vi.fn(() => new Promise(() => {})),
    getMyPhotoChoice: vi.fn(async () => null),
  };
});
vi.mock('@/app/data/api', () => ({ getUpcomingEvents: vi.fn(async () => []) }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, isLoading: false }) }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

import { TopicsPage } from '@/app/pages/topics-page';
import { TopicVotingList } from '@/app/components/topics/topic-parts';
import { getOpenTopics } from '@/app/data/topic-voting';

function expectRowSkeleton(container: HTMLElement) {
  const skeleton = screen.getByTestId('topic-list-skeleton');
  expect(skeleton.getAttribute('role')).toBe('status');
  expect(skeleton.getAttribute('aria-label')).toBe('Loading topics');
  expect(skeleton.children.length).toBeGreaterThanOrEqual(3);
  expect(skeleton.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  expect(container.querySelector('.clarity-page-loader')).toBeNull();
  expect(container.querySelector('svg[aria-label="Loading"]')).toBeNull();
  expect(container.textContent).not.toMatch(/loading/i);
}

describe('P1586 topic list wait', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the topics page shows row skeletons under its drawn header, not the page loader', () => {
    const { container } = render(<MemoryRouter><TopicsPage /></MemoryRouter>);
    expectRowSkeleton(container);
  });

  it('the voting list (event close page section) shows row skeletons, not the page loader', () => {
    const { container } = render(<MemoryRouter><TopicVotingList /></MemoryRouter>);
    expectRowSkeleton(container);
  });
});

// P1586: a stalled topic read must become a readable state with a Retry, in both places the list lives.
describe.each([
  ['the topics page', () => <MemoryRouter><TopicsPage /></MemoryRouter>],
  ['the voting list', () => <MemoryRouter><TopicVotingList /></MemoryRouter>],
])('P1586 topic list deadline: %s', (_name, ui) => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('shows the readable line and Retry once the read stalls past the deadline', () => {
    render(ui());
    expect(screen.getByTestId('topic-list-skeleton')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText(/taking longer than usual/i)).toBeTruthy();
    expect(screen.queryByTestId('topic-list-skeleton')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('Retry reads the topics again and shows the skeleton while it waits', () => {
    render(ui());
    act(() => { vi.advanceTimersByTime(10_000); });
    const before = vi.mocked(getOpenTopics).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(vi.mocked(getOpenTopics).mock.calls.length).toBe(before + 1);
    expect(screen.getByTestId('topic-list-skeleton')).toBeTruthy();
  });
});
