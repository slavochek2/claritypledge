// @vitest-environment jsdom
/**
 * P1586 §2 "Page → ClarityPageLoader", the remaining pages: each is rendered in its LOADING state
 * (auth still resolving, every data call pending forever) and must show the one page loader,
 * with no "Loading" text and no page-local mark in its own centring box.
 *
 * Companion of p1586-page-loader-members.test.tsx (event room, event pages, compare).
 */
import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InShellContentContext } from '@/components/ui/loader-context';

const { pending, hangingService } = vi.hoisted(() => {
  const pending = () => new Promise<never>(() => {});
  return { pending, hangingService: () => new Proxy({}, { get: () => pending }) };
});

vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    isLoading: true,
    sessionChecked: false,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  }),
}));
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, session: null, isLoading: true, sessionChecked: false }),
}));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: hangingService() }));
vi.mock('@/app/data/events-service', () => ({ eventsService: hangingService() }));
vi.mock('@/app/data/video-summaries-service', () => ({
  getVideoSummary: pending,
  readMinutes: () => 1,
  resetSummarisedVideoIdsCache: () => {},
  summaryParagraphs: () => [],
}));
vi.mock('@/app/data/letters-service', () => ({
  confirmLetterResponse: pending,
  getLetterForPublicReading: pending,
  requestLetterResponseSignin: pending,
}));
vi.mock('@/app/data/api', () => ({ getProfileBySlug: pending }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { verifyOtp: pending, getSession: pending, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
}));
vi.mock('@/app/hooks/useVerificationGate', () => ({ useVerificationGate: () => ({ checkVerified: () => true }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

import { VideoSummaryPage } from '@/app/pages/video-summary-page';
import { LetterResponseConfirmPage } from '@/app/pages/letter-response-confirm-page';
import { CreateAgreementPage } from '@/app/pages/create-agreement-page';
import { CreateStoryPage } from '@/app/pages/create-story-page';
import { SettingsPage } from '@/app/pages/settings-page';
import { OrgPage } from '@/app/pages/org-page';
import { OrgJoinPage } from '@/app/pages/org-join-page';
import { OrgDirectoryPage } from '@/app/pages/org-directory-page';
import { TranscribeRoomPage } from '@/app/pages/transcribe-room-page';

const PAGES: Array<[string, string, string, ReactElement]> = [
  ['VideoSummaryPage', '/video/:videoId', '/video/abcDEF12345', <VideoSummaryPage />],
  ['LetterResponseConfirmPage', '/letter/:letterId/confirm', '/letter/l-1/confirm', <LetterResponseConfirmPage />],
  ['CreateAgreementPage', '/agreements/new', '/agreements/new', <CreateAgreementPage />],
  ['CreateStoryPage', '/story/new', '/story/new', <CreateStoryPage />],
  ['OrgPage', '/groups/:slug', '/groups/cm', <OrgPage />],
  ['OrgJoinPage', '/groups/:slug/join', '/groups/cm/join', <OrgJoinPage />],
  ['OrgDirectoryPage', '/groups', '/groups', <OrgDirectoryPage />],
  ['TranscribeRoomPage', '/transcribe', '/transcribe', <TranscribeRoomPage />],
  ['SettingsPage', '/settings', '/settings', <SettingsPage />],
];

describe('P1586 §2 — remaining pages show the one page loader while loading', () => {
  it.each(PAGES)('%s', (_name, route, url, element) => {
    const { container } = render(
      <InShellContentContext.Provider value={true}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={route} element={element} />
          </Routes>
        </MemoryRouter>
      </InShellContentContext.Provider>,
    );
    expect(screen.getByTestId('content-loader')).toBeTruthy();
    // The only mark is the page loader's own: no second, page-local one.
    expect(container.querySelectorAll('svg[aria-label="Loading"]')).toHaveLength(1);
    expect(screen.queryByText(/loading/i), 'no "Loading" text').toBeNull();
  });
});
