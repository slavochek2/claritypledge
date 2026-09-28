/**
 * @file p1364-loading-back.test.tsx
 * @description P1364 UX Notes, review 2 D4 — "Loading: top Back only. The pill appears once the
 * content renders." Every §3 detail page is rendered in its LOADING state (auth still resolving,
 * every data call pending forever) and must show the top "Go back" control and no bottom pill.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Every data call hangs: the page can only be in its loading state.
const { pending, hangingService } = vi.hoisted(() => {
  const pending = () => new Promise<never>(() => {});
  return { pending, hangingService: () => new Proxy({}, { get: () => pending }) };
});

vi.mock('@/auth', () => ({
  useAuth: () => ({ user: null, session: null, isLoading: true, sessionChecked: false }),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: hangingService() }));
vi.mock('@/app/data/stories-service', () => ({ storiesService: hangingService() }));
vi.mock('@/app/data/stories-service-real', () => ({ resolveStorySlug: pending }));
vi.mock('@/app/data/points-service-real', () => ({ resolvePointSlug: pending }));
vi.mock('@/app/data/video-summaries-service', () => ({
  getVideoSummary: pending,
  readMinutes: () => 1,
  resetSummarisedVideoIdsCache: () => {},
  summaryParagraphs: () => [],
}));
vi.mock('@/app/hooks/useVerificationGate', () => ({ useVerificationGate: () => ({ checkVerified: () => true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

import { PointDetailPage } from '@/app/pages/point-detail-page';
import { StoryDetailPage } from '@/app/pages/story-detail-page';
import { AgreementPage } from '@/app/pages/agreement-page';
import { LetterResultsPage } from '@/app/pages/letter-results-page';
import { VideoSummaryPage } from '@/app/pages/video-summary-page';
import { CalibrationBreakdownPage } from '@/app/pages/calibration-breakdown-page';
import { ExplainBackViewPage } from '@/app/pages/explain-back-view-page';
import { LetterOverviewPage } from '@/app/pages/letter-overview-page';

const ID = '11111111-2222-3333-4444-555555555555';

const PAGES: Array<[string, string, string, ReactElement]> = [
  ['/point/:id', `/point/${ID}`, 'point', <PointDetailPage />],
  ['/story/:id', `/story/${ID}`, 'story', <StoryDetailPage />],
  ['/agreements/:id', `/agreements/${ID}`, 'agreement', <AgreementPage />],
  ['/letter/:id/results', `/letter/${ID}/results`, 'letter results', <LetterResultsPage />],
  ['/video/:videoId', '/video/abcDEF12345', 'video', <VideoSummaryPage />],
  ['/me/calibration', '/me/calibration', 'calibration', <CalibrationBreakdownPage />],
  ['/explain-back/:id', `/explain-back/${ID}`, 'explain-back', <ExplainBackViewPage />],
  ['/letter/:id/overview', `/letter/${ID}/overview`, 'letter overview', <LetterOverviewPage />],
];

describe('P1364 — loading: the top Back only', () => {
  it.each(PAGES)('%s (%s → %s) shows "Go back" and no pill while loading', (route, url, _name, element) => {
    render(
      <MemoryRouter initialEntries={['/prev', url]} initialIndex={1}>
        <Routes>
          <Route path={route} element={element} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /go back from the end/i })).toBeNull();
  });
});
