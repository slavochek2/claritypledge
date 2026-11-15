// @vitest-environment jsdom
/**
 * P1685 — event preparation: the Listening Game ends the principle step of a pass that showed the intro clip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: { user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true } }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

const ev = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: vi.fn(async () => ev.value),
    isUserRsvpd: vi.fn(async () => true),
    getEventGroupChatUrl: vi.fn(async () => null),
    getUpcomingEvents: vi.fn(async () => []),
    getEventAttendees: vi.fn(async () => []),
  },
}));
const prep = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock('@/app/data/event-prep-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/event-prep-service')>()),
  savePreparation: vi.fn(async (_e: string, _u: string, patch: Record<string, unknown>) => ({ ...prep.value, ...patch })),
  markPrepPart: vi.fn(async () => undefined),
  getPrepHostView: vi.fn(async () => []),
  getResearchPlacesLeft: vi.fn(async () => 3),
}));
vi.mock('@/app/data/event-room-service', () => ({ getMyRoomStatus: vi.fn(async () => null) }));
vi.mock('@/app/data/stories-service', () => ({ storiesService: { getPublicStoriesFeed: vi.fn(async () => []) } }));
vi.mock('@/app/data/agent-accounts-service', () => ({ getAgentAccounts: vi.fn(async () => new Map()) }));
vi.mock('@/app/pages/stake-page', () => ({
  StakePage: ({ tag }: { tag: string }) => <div data-testid={`stake-${tag}`} />,
}));
const stateRef = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  usePrepState: () => stateRef.value,
  loadTagPoints: vi.fn(async () => []),
}));

import { EventPrepPage } from '@/app/prototypes/events/prep/EventPrepPage';
import { CLARITY_NIGHT_RECIPE } from '@/app/prototypes/events/series-recipes';

const cards = [{ id: 'c1', statement: 'c1', userPosition: null }];

const page = () => (
  <MemoryRouter initialEntries={['/events/walk/prepare']}>
    <Routes><Route path="/events/:slug/prepare" element={<EventPrepPage />} /></Routes>
  </MemoryRouter>
);

function setup(seriesSlug: string | null, withPrincipleIntro: boolean) {
  ev.value = {
    id: 'ev-1', slug: 'walk', title: 'Event', datetime: '2099-01-01T08:00:00Z', timezone: 'UTC', durationMinutes: 120,
    location: 'Trailhead', hostId: 'h', hostName: 'H', seriesSlug, statementTag: 'walktag', preparationEnabled: true,
    hasGroupChat: false, attendees: [], orgId: null,
  };
  prep.value = { eventId: 'ev-1', profileId: 'u1', prepChoice: 'now', currentStep: 'principle', stepsDone: [], startedAt: '2026-10-28T08:00:00Z', completedAt: null,
    optedIn: null, principleRating: null, researchState: null, micSetup: null, researchConsentedAt: null, researchPolicyVersion: null };
  stateRef.value = {
    loading: false, error: false, prep: prep.value, parts: [], proof: null, cmp7Points: cards, eventPoints: [],
    plan: ['principle', 'cmp7'], stepsDone: [], progress: { done: 0, total: 2, complete: false },
    withPrincipleIntro, cards: { cmp7: 1, stake: 0 }, minutes: 3, learned: false,
    reload: vi.fn(), setPrep: vi.fn(), setParts: vi.fn(), reloadPoints: vi.fn(),
  };
  return render(page());
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

async function optOutAndContinue() {
  fireEvent.click(await screen.findByText('Opt out'));
  await screen.findByTestId('opt-out-ask');
  click('No, continue');
}

beforeEach(() => { sessionStorage.clear(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); CLARITY_NIGHT_RECIPE.prepare.listeningGame = true; });

describe('P1685 event preparation', () => {
  it('a pass that shows the intro ends with the game, even after the intro is recorded mid-step', async () => {
    const view = setup(null, true);
    expect(await screen.findByText('Step 1 of 2')).toBeInTheDocument();
    click('Play the video');
    await screen.findByRole('button', { name: 'Continue' });
    click('Continue');
    // The intro part is now recorded: the derived flag flips off, the snapshot must not.
    stateRef.value = { ...stateRef.value, withPrincipleIntro: false };
    view.rerender(page());
    await optOutAndContinue();
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    click('Back');
    expect(await screen.findByTestId('opt-out-ask')).toBeInTheDocument();
    click('No, continue');
    fireEvent.click(await screen.findByText('Continue without video'));
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });

  it('the opt-in path: try it now, rating, Confirm, then the game, and Back returns to the rating', async () => {
    setup(null, true);
    fireEvent.click(await screen.findByText('Continue without video'));
    fireEvent.click(await screen.findByText('Opt in'));
    click('Try it now');
    fireEvent.click(await screen.findByRole('button', { name: 'Rate 8' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    click('Back');
    expect(await screen.findByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });

  it('a pass that skipped the intro (returning attendee) does not show it', async () => {
    setup(null, false);
    await optOutAndContinue();
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument());
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });

  it('a hike shows it too', async () => {
    setup('social-hike', true);
    fireEvent.click(await screen.findByText('Continue without video'));
    await optOutAndContinue();
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
  });

  it('flag off: the principle step is exactly as before, same header', async () => {
    CLARITY_NIGHT_RECIPE.prepare.listeningGame = false;
    setup(null, true);
    fireEvent.click(await screen.findByText('Continue without video'));
    await optOutAndContinue();
    await waitFor(() => expect(screen.getByText('Step 2 of 2')).toBeInTheDocument());
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });
});
