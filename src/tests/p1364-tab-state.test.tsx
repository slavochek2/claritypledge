/**
 * @file p1364-tab-state.test.tsx
 * @description P1364 scope extension — every list a story or point is opened from keeps its tab
 * (or walk position, or filter) in the URL, written with REPLACE, so Back returns to it and tab
 * clicks add no Back steps:
 *   - /org/:slug (and /groups/:slug)  `?tab=`    — default tab (Events, or About for an invite) has no param
 *   - /letters                         `?tab=`    — was a push per click (P893); now replace
 *   - /point/:id holders               `?filter=` — 'all' has no param
 *   - /letter/:id/results walk         `?story=`  — the walk index; Back no longer restarts at story 1
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import type { ReactElement } from 'react';

// ─── shared mocks ─────────────────────────────────────────────────────────────
const org = vi.hoisted(() => ({
  getOrganizationBySlug: vi.fn(),
  getMembers: vi.fn(async () => []),
  getParticipation: vi.fn(async () => ({})),
  getMyMembership: vi.fn(async () => null),
  leaveOrganization: vi.fn(),
}));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: org }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => ({ user: null, session: null }) }));
vi.mock('@/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: null, isLoading: false, sessionChecked: true }),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/app/components/organizations/org-header', () => ({ OrgHeader: () => <div>org header</div> }));
vi.mock('@/app/prototypes/events/components/EventsList', () => ({ EventsList: () => <div>events list</div> }));
vi.mock('@/app/components/social/pledger-grid', () => ({ PledgerGrid: () => <div>members grid</div> }));
vi.mock('@/app/components/letters/drafts-tab', () => ({ DraftsTab: () => <div>drafts</div> }));
vi.mock('@/app/components/letters/sent-tab', () => ({ SentTab: () => <div>sent</div> }));
vi.mock('@/app/components/letters/inbox-tab', () => ({ InboxTab: () => <div>inbox</div> }));
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({ useUnreadLetterCount: () => ({ count: 0 }) }));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: null }) }));
vi.mock('@/app/data/docs-service', () => ({ docsService: {} }));
// The walk's heavy children: the index is what is under test.
vi.mock('@/app/components/partners/live-mode-view', () => ({ JourneyToUnderstanding: () => null }));
vi.mock('@/app/components/partners/live-story-card-expanded', () => ({ LiveStoryCardExpanded: () => null }));

import { OrgPage } from '@/app/pages/org-page';
import { LettersPage } from '@/app/pages/letters-page';
import { StoryWalk } from '@/app/components/letters/story-walk';

let nav: NavigateFunction;
function NavGrab() {
  nav = useNavigate();
  return null;
}
function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
const where = () => screen.getByTestId('where').textContent;
const go = (to: string | number) => act(() => { if (typeof to === 'number') nav(to); else nav(to); });

function renderAt(entries: string[], route: string, element: ReactElement) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <NavGrab />
      <Where />
      <Routes>
        <Route path="/start" element={<p>start</p>} />
        <Route path="/p/:id" element={<p>a profile</p>} />
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>
  );
}
/** Radix tabs activate on mousedown (left button), not click. */
const pressTab = (name: RegExp) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });

beforeEach(() => {
  vi.clearAllMocks();
  org.getOrganizationBySlug.mockResolvedValue({
    id: 'o1', slug: 'acme', name: 'Acme', hasEvents: true, visibility: 'public', description: 'About Acme',
  });
});

describe('/org/:slug — the tab is in the URL', () => {
  it('opens on the default tab with no param; a tab press REPLACES; Back from a member profile returns to the tab', async () => {
    renderAt(['/start', '/org/acme'], '/org/:slug', <OrgPage />);
    await screen.findByText('events list');
    expect(screen.getByRole('tab', { name: 'Events' })).toHaveAttribute('aria-selected', 'true');
    pressTab(/^Members$/);
    expect(where()).toBe('/org/acme?tab=members');
    await screen.findByText('Be the first to join'); // an empty roster
    go('/p/someone');
    go(-1);
    expect(where()).toBe('/org/acme?tab=members');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Members' })).toHaveAttribute('aria-selected', 'true'));
    go(-1); // the tab press added no history entry
    expect(where()).toBe('/start');
  });

  it('pressing the default tab removes the param; an invite link (?from=) still defaults to About', async () => {
    renderAt(['/org/acme?from=x'], '/org/:slug', <OrgPage />);
    await screen.findByText('About Acme');
    expect(screen.getByRole('tab', { name: 'About' })).toHaveAttribute('aria-selected', 'true');
    pressTab(/^Events$/);
    expect(where()).toBe('/org/acme?from=x&tab=events');
    pressTab(/^About$/);
    expect(where()).toBe('/org/acme?from=x');
  });
});

describe('/letters — tab presses add no Back steps', () => {
  it('each press REPLACES the entry; Back leaves /letters', async () => {
    renderAt(['/start', '/letters?tab=drafts'], '/letters', <LettersPage />);
    await screen.findByText('drafts');
    pressTab(/Published/i);
    expect(where()).toBe('/letters?tab=sent');
    pressTab(/Inbox/i);
    expect(where()).toBe('/letters?tab=inbox');
    go(-1);
    expect(where()).toBe('/start');
  });
});

describe('/letter/:id/results — the walk position survives Back', () => {
  const item = (id: string, position: number) => ({
    storyId: id, position,
    snapshot: { letter_id: 'l1', story_id: id, version_id: 'v', position, point_config: {}, visibility: 'public' },
    prediction: undefined, rating: undefined, gap: undefined, isOverconfident: false,
    receiverPositions: new Map(),
  });
  const profile = { id: 'p1', name: 'Sender', hasPledged: false, earsCount: 0 };

  it('Next reports the new index to the page', () => {
    const onIndexChange = vi.fn();
    render(
      <MemoryRouter>
        <StoryWalk
          stories={[item('s1', 0), item('s2', 1), item('s3', 2)] as never}
          perspective="sender" senderProfile={profile} receiverProfile={null}
          senderName="Sender" receiverName={null} onIndexChange={onIndexChange}
        />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /next story/i }));
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByText(/story 2 of 3/i)).toBeTruthy();
  });

  it('the results page writes that index to ?story= with replace, and reads it back as the starting story', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/app/pages/letter-results-page.tsx', 'utf8');
    expect(src).toMatch(/onIndexChange=\{\(index\) => \{[\s\S]*?params\.set\('story', next\)[\s\S]*?\{ replace: true \}/);
    expect(src).toMatch(/const storyId = searchParams\.get\('story'\)/);
    expect(src).toMatch(/initialIndex=\{\s*storyId/);
  });
});
