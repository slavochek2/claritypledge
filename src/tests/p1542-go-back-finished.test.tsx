// @vitest-environment jsdom
/**
 * P1542 founder decision (A), follow-up (2026-10-28, founder: "they can go back"): in a hike's learning, a person who
 * finished steps elsewhere
 *  (1) can open any finished row in the step list at any time — not only once the whole learning is finished;
 *  (2) can reach a finished statements step (cmp7) with Back — its answered cards are shown, nothing is asked again.
 * Clarity Night is unchanged: its list rows stay inert until review, and Back still passes over a finished step.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
// The statements step's cards: shown as the ids it was asked to list.
vi.mock('@/app/pages/stake-page', () => ({
  StakePage: ({ tag, onlyIds }: { tag: string; onlyIds?: string[] }) => <div data-testid={`stake-${tag}`}>{(onlyIds ?? []).join(',')}</div>,
}));

const stateRef = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  usePrepState: () => stateRef.value,
  loadTagPoints: vi.fn(async () => []),
}));

import { EventPrepPage, PrepFlow } from '@/app/prototypes/events/prep/EventPrepPage';

const answered = (id: string) => ({ id, statement: id, userPosition: { position: 'agree' } });
const open = (id: string) => ({ id, statement: id, userPosition: null });

type Opts = { started: boolean; stepsDone?: string[]; currentStep?: string | null; completedAt?: string | null; cmp7?: Record<string, unknown>[] };
function setup(seriesSlug: string | null, opts: Opts) {
  ev.value = {
    id: 'ev-1', slug: 'walk', title: 'Social Hike: Walk', datetime: '2099-01-01T08:00:00Z', timezone: 'UTC', durationMinutes: 120,
    location: 'Trailhead', hostId: 'h', hostName: 'H', seriesSlug, statementTag: 'walktag', preparationEnabled: true,
    hasGroupChat: false, attendees: [], orgId: null,
  };
  prep.value = opts.started
    ? { eventId: 'ev-1', profileId: 'u1', prepChoice: 'now', currentStep: opts.currentStep === undefined ? 'stake' : opts.currentStep, stepsDone: ['principle'], startedAt: '2026-10-28T08:00:00Z', completedAt: opts.completedAt ?? null,
        optedIn: null, principleRating: null, researchState: null, micSetup: null, researchConsentedAt: null, researchPolicyVersion: null }
    : null;
  // Finished elsewhere: the video (story) and the cmp7 statements; this event's own positions (stake) still open.
  stateRef.value = {
    loading: false, error: false, prep: prep.value, parts: [], proof: null,
    cmp7Points: opts.cmp7 ?? [answered('c1'), answered('c2')], eventPoints: [open('s1'), open('s2')],
    plan: ['story', 'principle', 'cmp7', 'stake'],
    stepsDone: opts.stepsDone ?? (opts.started ? ['story', 'principle', 'cmp7'] : ['story', 'cmp7']),
    progress: { done: opts.started ? 3 : 2, total: 4, complete: false },
    withPrincipleIntro: false, cards: { cmp7: 0, stake: 2 }, minutes: 3, learned: false,
    reload: vi.fn(), setPrep: vi.fn(), setParts: vi.fn(), reloadPoints: vi.fn(),
  };
  return render(page());
}

function page() {
  return (
    <MemoryRouter initialEntries={['/events/walk/prepare']}>
      <Routes>
        <Route path="/events/:slug/prepare" element={<EventPrepPage />} />
        <Route path="/events/:slug" element={<p>event</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  auth.value = { user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
});

describe('a hike: finished steps can be opened again', () => {
  it('(1) on the step list, a finished row opens its step at any time (the learning is not finished)', async () => {
    setup('social-hike', { started: false });
    await waitFor(() => expect(screen.getByTestId('agenda')).toBeInTheDocument());
    // Rows 1 (story) and 3 (cmp7) are finished: each has its open target; unfinished rows do not.
    expect(screen.getByTestId('agenda-open-1')).toBeInTheDocument();
    expect(screen.getByTestId('agenda-open-3')).toBeInTheDocument();
    expect(screen.queryByTestId('agenda-open-2')).toBeNull();
    expect(screen.queryByTestId('agenda-open-4')).toBeNull();
    fireEvent.click(screen.getByTestId('agenda-open-3'));
    // The finished statements step shows its answered cards, asking nothing new.
    expect(await screen.findByTestId('stake-cmp7')).toHaveTextContent('c1,c2');
  });

  it('(2) Back from the next step reaches the finished cmp7 step and shows its answered cards', async () => {
    setup('social-hike', { started: true });
    // Resumes on this event's positions (the next unfinished step), "Step 4 of 4".
    expect(await screen.findByText('Step 4 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('header-back'));
    expect(await screen.findByText('Step 3 of 4')).toBeInTheDocument();
    expect(await screen.findByTestId('stake-cmp7')).toHaveTextContent('c1,c2');
  });
});

describe('review fixes (H1, H2, H3, M1)', () => {
  it('H1: a finished step reopened out of order continues to the first unfinished step, never to the end', async () => {
    // Positions (stake) done here, the principle still open; cmp7 finished elsewhere and reopened from the list.
    setup('social-hike', { started: true, currentStep: null, stepsDone: ['story', 'cmp7', 'stake'] });
    // Resumes on the one unfinished step.
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('header-back')); // principle → story (Back reaches finished steps)
    expect(await screen.findByText('Step 1 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('header-back')); // story → the list
    fireEvent.click(await screen.findByTestId('agenda-open-3')); // reopen the finished cmp7
    expect(await screen.findByTestId('stake-cmp7')).toHaveTextContent('c1,c2');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    // Not the end: back to the principle, and no completion written.
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
    const { savePreparation } = await import('@/app/data/event-prep-service');
    expect(vi.mocked(savePreparation).mock.calls.some(([, , patch]) => !!(patch as { completedAt?: string }).completedAt)).toBe(false);
  });

  it('H2: steps finished elsewhere that load later join the ticked list (the flow resyncs)', async () => {
    const view = setup('social-hike', { started: false, stepsDone: ['story'] });
    await waitFor(() => expect(screen.getByTestId('agenda')).toBeInTheDocument());
    expect(screen.queryByTestId('agenda-open-3')).toBeNull();
    stateRef.value = { ...stateRef.value, stepsDone: ['story', 'cmp7'] }; // the parts read lands later
    view.rerender(page());
    expect(await screen.findByTestId('agenda-open-3')).toBeInTheDocument();
  });

  it('H3: a finished statements step shows all its cards on reopen, even with an earlier empty snapshot; a card added since is listed too', async () => {
    // An earlier visit in this tab snapshotted no open cards for cmp7.
    sessionStorage.setItem('p1336-shown:u1:ev-1', JSON.stringify({ cmp7: [] }));
    setup('social-hike', { started: false, cmp7: [answered('c1'), answered('c2'), open('c3')] });
    await waitFor(() => expect(screen.getByTestId('agenda')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('agenda-open-3'));
    expect(await screen.findByTestId('stake-cmp7')).toHaveTextContent('c1,c2,c3');
  });

  it('M1: everything finished elsewhere but not recorded: opening Learn records completion and shows the end (founder UAT round)', async () => {
    setup('social-hike', { started: true, currentStep: null, stepsDone: ['story', 'principle', 'cmp7', 'stake'] });
    const { savePreparation } = await import('@/app/data/event-prep-service');
    await waitFor(() => expect(vi.mocked(savePreparation).mock.calls.some(([, , patch]) => !!(patch as { completedAt?: string }).completedAt)).toBe(true));
    expect(await screen.findByTestId('end-inline-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('agenda')).toBeNull();
  });
});

describe('review round 2', () => {
  it('1: a reopened step whose saved snapshot holds the same NUMBER of different cards shows the current cards', async () => {
    // Two old cards were replaced by two new ones since the snapshot: same length, different ids.
    sessionStorage.setItem('p1336-shown:u1:ev-1', JSON.stringify({ cmp7: ['old1', 'old2'] }));
    setup('social-hike', { started: false });
    await waitFor(() => expect(screen.getByTestId('agenda')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('agenda-open-3'));
    expect(await screen.findByTestId('stake-cmp7')).toHaveTextContent(/^c1,c2$/);
  });

  it('2 (cmp7): completion landing while the step is open widens the unanswered-only list to every card', async () => {
    const view = setup('social-hike', { started: true, currentStep: 'cmp7', stepsDone: ['story', 'principle'], cmp7: [answered('c1'), open('c2')] });
    expect(await screen.findByTestId('stake-cmp7')).toHaveTextContent(/^c2$/);
    stateRef.value = { ...stateRef.value, stepsDone: ['story', 'principle', 'cmp7'] }; // finished elsewhere, read lands now
    view.rerender(page());
    await waitFor(() => expect(screen.getByTestId('stake-cmp7')).toHaveTextContent(/^c1,c2$/));
  });

  it('2 (stake): the same for this event\'s positions step', async () => {
    const view = setup('social-hike', { started: true, currentStep: 'stake', stepsDone: ['story', 'principle', 'cmp7'] });
    stateRef.value = { ...stateRef.value, eventPoints: [answered('s1'), open('s2')] };
    view.rerender(page());
    expect(await screen.findByTestId('stake-walktag')).toHaveTextContent(/^s2$/);
    stateRef.value = { ...stateRef.value, stepsDone: ['story', 'principle', 'cmp7', 'stake'] };
    view.rerender(page());
    await waitFor(() => expect(screen.getByTestId('stake-walktag')).toHaveTextContent(/^s1,s2$/));
  });
});

describe('founder UAT round (3): every step already finished elsewhere skips the all-ticked list', () => {
  const completed = async () => {
    const { savePreparation } = await import('@/app/data/event-prep-service');
    return vi.mocked(savePreparation).mock.calls.some(([, , patch]) => !!(patch as { completedAt?: string }).completedAt);
  };

  it('never started here: opening Learn records completion and shows the end screen; no list, no button', async () => {
    setup('social-hike', { started: false, stepsDone: ['story', 'principle', 'cmp7', 'stake'] });
    await waitFor(async () => expect(await completed()).toBe(true));
    expect(await screen.findByTestId('end-inline-actions')).toBeInTheDocument();
    expect(screen.queryByTestId('agenda')).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Start now|Finish)$/ })).toBeNull();
  });

  it('round 3 (B): from a hidden tab nothing is written; the completion is recorded once the tab is visible', async () => {
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    setup('social-hike', { started: false, stepsDone: ['story', 'principle', 'cmp7', 'stake'] });
    await new Promise((r) => setTimeout(r, 50));
    expect(await completed()).toBe(false);
    vis.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await waitFor(async () => expect(await completed()).toBe(true));
    vis.mockRestore();
  });

  it('round 3 (C): a failed save brings back the list, and its "Start now" records the completion', async () => {
    const { savePreparation } = await import('@/app/data/event-prep-service');
    vi.mocked(savePreparation).mockRejectedValueOnce(new Error('offline'));
    const completions = () => vi.mocked(savePreparation).mock.calls.filter(([, , patch]) => !!(patch as { completedAt?: string }).completedAt).length;
    setup('social-hike', { started: false, stepsDone: ['story', 'principle', 'cmp7', 'stake'] });
    fireEvent.click(await screen.findByRole('button', { name: 'Start now' }));
    await waitFor(() => expect(completions()).toBe(2)); // the failed automatic one, then the list's
    expect(await screen.findByTestId('end-inline-actions')).toBeInTheDocument();
  });

  it('some steps still open: the list with "Start now", and nothing is recorded', async () => {
    setup('social-hike', { started: false });
    await waitFor(() => expect(screen.getByTestId('agenda')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Start now' })).toBeInTheDocument();
    expect(await completed()).toBe(false);
  });
});

describe('Clarity Night is unchanged', () => {
  it('list rows stay inert before review', async () => {
    setup(null, { started: false });
    await waitFor(() => expect(screen.getByTestId('agenda')).toBeInTheDocument());
    expect(screen.queryByTestId('agenda-open-1')).toBeNull();
  });

  it('Back passes over a finished statements step (positions → the principle, not cmp7)', async () => {
    setup(null, { started: true });
    expect(await screen.findByText('Step 4 of 4')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('header-back'));
    expect(await screen.findByText('Step 2 of 4')).toBeInTheDocument();
  });
});

describe('round 3 (D): learning a Join started, inside the room, finishes straight into the group terms', () => {
  it('the real embedded flow: finishing hands the room its join intent (onStep), never the ordinary "learned" end', async () => {
    setup('social-hike', { started: true, currentStep: null, stepsDone: ['story', 'principle', 'cmp7', 'stake'] });
    cleanup();
    const onStep = vi.fn();
    render(
      <MemoryRouter initialEntries={['/events/walk/meet?view=learn&then=join']}>
        <Routes>
          <Route path="/events/:slug/meet" element={<PrepFlow event={ev.value as never} groupChatUrl={null} state={stateRef.value as never} viewerId="u1" room={{ active: true, headSlot: null, onStep, thenJoin: true }} />} />
        </Routes>
      </MemoryRouter>,
    );
    const { savePreparation } = await import('@/app/data/event-prep-service');
    await waitFor(() => expect(vi.mocked(savePreparation).mock.calls.some(([, , patch]) => !!(patch as { completedAt?: string }).completedAt)).toBe(true));
    await waitFor(() => expect(onStep).toHaveBeenCalled());
    expect(screen.queryByTestId('learn-room-end')).toBeNull();
  });

  it('R5: hidden under another room view (room.active false), the all-finished learning records nothing', async () => {
    setup('social-hike', { started: true, currentStep: null, stepsDone: ['story', 'principle', 'cmp7', 'stake'] });
    cleanup();
    vi.clearAllMocks();
    const onStep = vi.fn();
    render(
      <MemoryRouter initialEntries={['/events/walk/meet']}>
        <Routes>
          <Route path="/events/:slug/meet" element={<PrepFlow event={ev.value as never} groupChatUrl={null} state={stateRef.value as never} viewerId="u1" room={{ active: false, headSlot: null, onStep }} />} />
        </Routes>
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 50));
    const { savePreparation } = await import('@/app/data/event-prep-service');
    expect(vi.mocked(savePreparation).mock.calls.some(([, , patch]) => !!(patch as { completedAt?: string }).completedAt)).toBe(false);
    expect(onStep).not.toHaveBeenCalled();
  });
});

