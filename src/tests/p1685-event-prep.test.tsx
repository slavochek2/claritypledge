// @vitest-environment jsdom
/**
 * P1685 — event preparation: the Listening Game is its own numbered step after the principle (every series), required,
 * recorded as the listening_game part, resumable.
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
import { markPrepPart } from '@/app/data/event-prep-service';
import { buildPlan, type PlanStep } from '@/app/prototypes/events/prep/prep-plan';
import { prepareStepsFor } from '@/app/prototypes/events/prep/prep-timing';
import { recipeForEvent } from '@/app/prototypes/events/series-recipes';

const cards = [{ id: 'c1', statement: 'c1', userPosition: null }];

const page = () => (
  <MemoryRouter initialEntries={['/events/walk/prepare']}>
    <Routes><Route path="/events/:slug/prepare" element={<EventPrepPage />} /></Routes>
  </MemoryRouter>
);

type Kind = 'night' | 'hike' | 'mastermind';
const SHAPE: Record<Kind, Record<string, unknown>> = {
  night: { seriesSlug: 'clarity-night', flow: null },
  hike: { seriesSlug: null, flow: 'social-hike' },
  mastermind: { seriesSlug: null, flow: 'sales-mastermind', canvasTiming: 'before' },
};

function setup(kind: Kind, over: { currentStep?: string; stepsDone?: string[]; plan?: PlanStep[] } = {}) {
  ev.value = {
    id: 'ev-1', slug: 'walk', title: 'Event', datetime: '2099-01-01T08:00:00Z', timezone: 'UTC', durationMinutes: 120,
    location: 'Trailhead', hostId: 'h', hostName: 'H', statementTag: 'walktag', preparationEnabled: true,
    hasGroupChat: false, attendees: [], orgId: null, ...SHAPE[kind],
  };
  // The plan the real hook derives: the recipe's steps through buildPlan (no parts done, started now), welcome/story/research
  // dropped from this harness so the game is the first screen.
  const plan = over.plan ?? buildPlan({
    parts: [], startedAt: '2026-10-28T08:00:00Z', hasStatementTag: true, eventPointCount: 3, steps: prepareStepsFor(ev.value as never),
    keepFinished: !!recipeForEvent(ev.value as never).prepare.keepFinished, canvas: kind === 'mastermind',
  }).filter((s) => !['welcome', 'story', 'research', 'stake', 'canvas'].includes(s));
  const stepsDone = over.stepsDone ?? [];
  prep.value = { eventId: 'ev-1', profileId: 'u1', prepChoice: 'now', currentStep: over.currentStep ?? 'game', stepsDone, startedAt: '2026-10-28T08:00:00Z', completedAt: null,
    optedIn: null, principleRating: null, researchState: null, micSetup: null, researchConsentedAt: null, researchPolicyVersion: null };
  stateRef.value = {
    loading: false, error: false, prep: prep.value, parts: [], proof: null, cmp7Points: cards, eventPoints: [],
    plan, stepsDone, progress: { done: stepsDone.length, total: plan.length, complete: false },
    withPrincipleIntro: false, cards: { cmp7: 1, stake: 0 }, minutes: 3, learned: false,
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
afterEach(cleanup);

describe.each<Kind>(['night', 'hike', 'mastermind'])('P1685 event preparation: %s', (kind) => {
  it('the game comes before the principle: "Step 1 of 3", subtitle above a required video, roles below, then the principle', async () => {
    setup(kind);
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByText('The Listening Game')).toBeInTheDocument();
    expect(screen.getByText('The roles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play the video' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(screen.queryByText(/without video/i)).toBeNull();
    click('Play the video');
    click('Continue');
    expect(await screen.findByText('Opt out')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
    await optOutAndContinue();
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    // The part is recorded once, as completed.
    await waitFor(() => expect(markPrepPart).toHaveBeenCalledWith('u1', 'listening_game', 1, 'completed'));
  });

  it('a video that cannot load: Try again remounts it; Continue moves on, recording the part as skipped, never completed', async () => {
    setup(kind);
    const game = await screen.findByTestId('listening-game');
    click('Play the video');
    fireEvent.error(game.querySelector('video')!);
    expect(await screen.findByTestId('video-load-error')).toBeInTheDocument();
    click('Try the video again');
    await waitFor(() => expect(screen.queryByTestId('video-load-error')).toBeNull());
    fireEvent.error(screen.getByTestId('listening-game').querySelector('video')!);
    click('Continue');
    expect(await screen.findByText('Opt out')).toBeInTheDocument();
    expect(markPrepPart).toHaveBeenCalledWith('u1', 'listening_game', 1, 'skipped');
    expect(markPrepPart).not.toHaveBeenCalledWith('u1', 'listening_game', 1, 'completed');
  });

  it('resumes on the game when the person left on it', async () => {
    setup(kind, { currentStep: 'game', stepsDone: [] });
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });
});

describe('P1685 event preparation, other cases', () => {
  it('opt in, try it now, rating, Confirm: the next screen is the statements; Back from the principle returns to the game, not a blank', async () => {
    setup('night');
    await screen.findByTestId('listening-game');
    click('Play the video');
    click('Continue');
    click('Back');
    expect(await screen.findByTestId('listening-game')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    click('Play the video');
    click('Continue');
    fireEvent.click(await screen.findByText('Opt in'));
    click('Try it now');
    fireEvent.click(await screen.findByRole('button', { name: 'Rate 8' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }));
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
  });

  it('once per person: a plan without the game (part already done) opens on the principle and goes on to the statements', async () => {
    setup('night', { plan: ['principle', 'cmp7'], currentStep: 'principle' });
    await optOutAndContinue();
    expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-game')).toBeNull();
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
  });

  it('the recipe switch off: the plan has no game and the numbering is as before', async () => {
    const recipe = recipeForEvent({ seriesSlug: 'clarity-night', flow: null } as never);
    recipe.prepare.listeningGame = false;
    try {
      const steps = prepareStepsFor({ seriesSlug: 'clarity-night', flow: null } as never);
      expect(steps).not.toContain('game');
      setup('night', { plan: steps.filter((s) => s === 'principle' || s === 'cmp7') });
      await optOutAndContinue();
      expect(await screen.findByTestId('stake-cmp7')).toBeInTheDocument();
      expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    } finally { recipe.prepare.listeningGame = true; }
  });
});
