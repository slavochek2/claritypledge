/**
 * P1336 HARD RULE — a shared component may only gain an opt-in prop whose default is the
 * current behaviour. This pins the defaults of the props the preparation uses on StakePage and
 * MeetingPrincipleView (LetterProgressBar `tone`, LetterFlowContent reveals-off and
 * Mp4VideoFacade have their own files: p1336-letter-progress-bar-tone, p1336-letter-reveals-off,
 * mp4-video-facade), and shows each opt-in actually changes something (so the default test can
 * fail).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { PointWithUserPosition } from '@/app/types';

const feeds = vi.hoisted(() => ({
  points: vi.fn(),
  stories: vi.fn(async () => []),
}));

vi.mock('@/app/data/points-service', () => ({
  pointsService: { getPublicPointsFeed: feeds.points },
}));
vi.mock('@/app/data/stories-service', () => ({
  storiesService: {
    getPublicStoriesFeed: feeds.stories,
    getPointsForStories: vi.fn(async () => new Map()),
    getStoriesForPoints: vi.fn(async () => new Map()),
  },
}));
vi.mock('@/auth', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('@/app/components/feed/feed-point-card', () => ({
  FeedPointCard: ({ point }: { point: PointWithUserPosition }) => <div data-testid="point-card">{point.statement}</div>,
}));
vi.mock('@/app/components/feed/feed-skeleton', () => ({ FeedSkeleton: () => <div data-testid="skeleton" /> }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

import { StakePage } from '@/app/pages/stake-page';
import { MeetingPrincipleView, UNDERSTANDING_QUESTION } from '@/app/components/agreements/meeting-principle-view';

const pt = (id: string): PointWithUserPosition =>
  ({ id, statement: `Statement ${id}`, totalPositions: 1, positionCounts: {}, tags: ['cmp7'] }) as unknown as PointWithUserPosition;

function renderStake(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/stake/cmp7']}>
      <Routes>
        <Route path="/stake/:tag" element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StakePage defaults (P1336 props off)', () => {
  beforeEach(() => {
    feeds.points.mockReset().mockResolvedValue([pt('a'), pt('b'), pt('c')]);
    feeds.stories.mockClear();
  });

  it('default: the tag heading and Back render, stories are fetched, every point listed', async () => {
    renderStake(<StakePage />);
    expect(await screen.findAllByTestId('point-card')).toHaveLength(3);
    expect(screen.getByRole('heading', { level: 1, name: 'cmp7' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /back/i }).length).toBeGreaterThan(0);
    expect(feeds.stories).toHaveBeenCalled();
  });

  it('embedded + pointsOnly + onlyIds: no heading/Back, no stories fetch, only the given ids', async () => {
    renderStake(<StakePage tag="cmp7" embedded pointsOnly onlyIds={['b']} />);
    await waitFor(() => expect(screen.getAllByTestId('point-card')).toHaveLength(1));
    expect(screen.getByText('Statement b')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: 'cmp7' })).toBeNull();
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
    expect(feeds.stories).not.toHaveBeenCalled();
  });
});

describe('MeetingPrincipleView defaults', () => {
  const base = {
    level: 3 as const,
    rating: null,
    onAnswer: vi.fn(),
    onRatingChange: vi.fn(),
    onRatingSubmit: vi.fn(),
    submitLabel: 'Submit',
  };

  it('default question is /meet\'s UNDERSTANDING_QUESTION; no P1336 slots render', () => {
    render(<MemoryRouter><MeetingPrincipleView {...base} answer="in" /></MemoryRouter>);
    expect(screen.getByText(UNDERSTANDING_QUESTION)).toBeInTheDocument();
    expect(screen.queryByTestId('p1336-above-rating')).toBeNull();
  });

  it('opt-in: question, header, aboveChoice and aboveRating render where given', () => {
    const { rerender } = render(
      <MemoryRouter>
        <MeetingPrincipleView {...base} answer={null} header={<h1>Custom header</h1>} aboveChoice={<p data-testid="p1336-above-choice">proof</p>} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Custom header')).toBeInTheDocument();
    expect(screen.getByTestId('p1336-above-choice')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <MeetingPrincipleView {...base} answer="in" question="Custom question?" aboveRating={<p data-testid="p1336-above-rating">host</p>} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Custom question?')).toBeInTheDocument();
    expect(screen.queryByText(UNDERSTANDING_QUESTION)).toBeNull();
    expect(screen.getByTestId('p1336-above-rating')).toBeInTheDocument();
  });
});
