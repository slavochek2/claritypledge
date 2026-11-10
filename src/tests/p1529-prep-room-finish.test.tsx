// @vitest-environment jsdom
/**
 * P1529 founder UAT: finishing preparation inside the room (embedded PrepFlow, a flow without its own learning
 * words: Sales Mastermind, Clarity Night) ends on a short "You're ready" with ONE primary to the room's next step;
 * outside the room the confirmation is unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
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



function setup(seriesSlug: string | null) {
  ev.value = {
    id: 'ev-1', slug: 'walk', title: 'Sales Night', datetime: '2099-01-01T18:30:00Z', timezone: 'UTC', durationMinutes: 120,
    location: 'Hall 1', hostId: 'h', hostName: 'H', seriesSlug, statementTag: 'walktag', preparationEnabled: true,
    hasGroupChat: false, attendees: [], orgId: null,
  };
  prep.value = { eventId: 'ev-1', profileId: 'u1', prepChoice: 'now', currentStep: null, stepsDone: ['story', 'principle'], startedAt: '2026-10-28T08:00:00Z', completedAt: null,
    optedIn: null, principleRating: null, researchState: null, micSetup: null, researchConsentedAt: null, researchPolicyVersion: null };
  stateRef.value = {
    loading: false, error: false, prep: prep.value, parts: [], proof: null, cmp7Points: [], eventPoints: [],
    plan: ['story', 'principle'], stepsDone: ['story', 'principle'], progress: { done: 2, total: 2, complete: false },
    withPrincipleIntro: false, cards: {}, minutes: 3, learned: false, arrival: null,
    reload: vi.fn(), setPrep: vi.fn(), setParts: vi.fn(), reloadPoints: vi.fn(),
  };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  auth.value = { user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
});

function renderInRoom(nextStep: 'principle' | 'table' | undefined, onStep = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/events/walk/meet?view=learn']}>
      <Routes>
        <Route path="/events/:slug/meet" element={<PrepFlow event={ev.value as never} groupChatUrl={null} state={stateRef.value as never} viewerId="u1" room={{ active: true, headSlot: null, onStep, nextStep }} />} />
      </Routes>
    </MemoryRouter>,
  );
  return onStep;
}

describe('preparation finished inside the room (no learning words)', () => {
  it('shows "You\'re ready" with ONE primary to Principle while its decision is not made; no calendar, share, card or secondary', async () => {
    setup(null);
    const onStep = renderInRoom('principle');
    expect(await screen.findByTestId('prep-room-finish')).toBeInTheDocument();
    expect(screen.getByText("You're ready")).toBeInTheDocument();
    expect(screen.queryByText('Thank you for preparing')).toBeNull();
    expect(screen.queryByTestId('end-card')).toBeNull();
    expect(screen.queryByText(/Add to Calendar/i)).toBeNull();
    expect(screen.queryByText(/Share/i)).toBeNull();
    expect(screen.queryByText('Join the room')).toBeNull();
    expect(screen.queryByText('Back to the event')).toBeNull();
    const buttons = within(screen.getByTestId('prep-room-finish')).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(screen.getByText('Continue to Principle'));
    expect(onStep).toHaveBeenCalledWith('principle');
  });

  it('continues to the table once the Principle decision is made', async () => {
    setup(null);
    const onStep = renderInRoom('table');
    fireEvent.click(await screen.findByText('Continue to your table'));
    expect(onStep).toHaveBeenCalledWith('table');
  });

  it('outside the room (/prepare) the confirmation is unchanged', async () => {
    setup(null);
    render(
      <MemoryRouter initialEntries={['/events/walk/prepare']}>
        <Routes>
          <Route path="/events/:slug/prepare" element={<EventPrepPage />} />
          <Route path="/events/:slug" element={<p>event</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Thank you for preparing')).toBeInTheDocument();
    expect(screen.getByTestId('end-card')).toBeInTheDocument();
    expect(screen.queryByTestId('prep-room-finish')).toBeNull();
  });
});
