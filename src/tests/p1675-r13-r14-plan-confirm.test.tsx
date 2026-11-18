// @vitest-environment jsdom
/**
 * P1675 UAT round 3 R13 (the /prepare plan page continues from the form) and R14 (one word for required on the
 * confirmation page). A hike that asks the questions changes; a one-tap hike and Clarity Night keep today's pages.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const ctl = vi.hoisted(() => ({ restoring: false, deciding: false }));
vi.mock('@/auth', () => ({
  useAuth: () => (ctl.restoring
    ? { user: null, session: null, sessionChecked: false, isLoading: true }
    : { user: { id: 'user-id-1234' }, session: { user: { id: 'user-id-1234' } }, sessionChecked: true, isLoading: false }),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  getMyPreparation: () => (ctl.deciding ? new Promise(() => {}) : Promise.resolve(null)),
  getMyPrepParts: () => Promise.resolve([]),
  getPrepSocialProof: () => new Promise(() => {}),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: () => new Promise(() => {}) } }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventOrganizer: () => new Promise(() => {}),
    getEventOrganizerOrThrow: () => new Promise(() => {}),
    getOrganizationByIdOrThrow: () => Promise.resolve({ id: 'org-id-1234', name: 'Test Community', slug: 't' }),
  },
}));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: { getMyMembership: () => Promise.resolve(null) } }));
vi.mock('@/app/data/group-chat-opens-service', () => ({
  readGroupChatOpenedOnServer: () => new Promise(() => {}),
  markGroupChatOpenedOnServer: () => Promise.resolve({ ok: true, refused: false }),
}));

import { PrepFlow } from '@/app/prototypes/events/prep/EventPrepPage';
import { LearnInvitation } from '@/app/prototypes/events/prep/PrepRoom';
import type { PrepState } from '@/app/prototypes/events/prep/use-prep-state';
import { recipeForEvent } from '@/app/prototypes/events/series-recipes';
import type { EventWithHost } from '@/app/types';

afterEach(() => { cleanup(); ctl.restoring = false; ctl.deciding = false; });

const HOUR = 3600 * 1000;
const event = (extra: Record<string, unknown> = {}) => ({
  id: 'event-r13', slug: 'event-r13', title: 'Hike', hostId: 'host-id-1234', seriesSlug: 'social-hike', preparationEnabled: false,
  statementTag: null, datetime: new Date(Date.now() + 72 * HOUR).toISOString(), durationMinutes: 60, location: 'Test',
  description: '', hasGroupChat: true, orgId: 'org-id-1234', ...extra,
}) as unknown as EventWithHost;
const clarityNight = () => event({ seriesSlug: 'clarity-night', title: 'Clarity Night' });

const planState = (e: EventWithHost, over: Partial<PrepState> = {}) => {
  const plan = recipeForEvent(e).prepare.steps as PrepState['plan'];
  return {
    loading: false, error: false, prep: null, parts: [], cmp7Points: [], eventPoints: [], proof: null, plan, stepsDone: [],
    progress: { done: 0, total: plan.length }, withPrincipleIntro: false, cards: {}, minutes: 15, totalOnly: true, brandNew: true,
    arrival: null, arrivalError: false, retryArrival: () => {}, learned: false, reload: () => {}, setPrep: () => {}, setParts: () => {}, reloadPoints: () => {},
    ...over,
  } as unknown as PrepState;
};

function renderPlan(e: EventWithHost, over: Partial<PrepState> = {}, room?: unknown) {
  return render(
    <MemoryRouter>
      <PrepFlow event={e} groupChatUrl={null} state={planState(e, over)} viewerId="user-id-1234" room={room as never} />
    </MemoryRouter>,
  );
}

describe('R13: the /prepare plan page on a hike that asks the questions', () => {
  it('brand-new: title, "About 15 minutes.", no step count, no why paragraphs', async () => {
    const { container } = renderPlan(event({ hikeRegistration: 'when' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Your short introduction');
    expect(screen.getByTestId('plan-summary')).toHaveTextContent(/^About 15 minutes\.$/);
    expect(container.textContent).not.toMatch(/steps ·/);
    expect(container.textContent).not.toContain('Then you decide if it is for you.');
  });

  it('parts done elsewhere: the honest number', async () => {
    renderPlan(event(), { brandNew: false, minutes: 8, progress: { done: 1, total: 3 } as PrepState['progress'] });
    expect(await screen.findByTestId('plan-summary')).toHaveTextContent("About 8 minutes left: you've done part of it before.");
  });

  it('minutes still loading: no number', async () => {
    renderPlan(event(), { minutes: null });
    expect((await screen.findByTestId('plan-summary')).textContent).not.toMatch(/\d/);
  });

  it('every step done: the line is left out', async () => {
    const e = event();
    const plan = planState(e).plan;
    renderPlan(e, { stepsDone: plan as never, brandNew: false, minutes: 0 });
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByTestId('plan-summary')).toBeNull();
  });

  it('inside the room the page is today\'s', async () => {
    const room = { onStep: () => {}, active: true, headSlot: null };
    renderPlan(event(), {}, room);
    expect(await screen.findByTestId('plan-summary')).toHaveTextContent(/steps/);
  });
});

describe('R13: pages that keep today\'s plan', () => {
  it('a one-tap hike: step count and minutes', async () => {
    renderPlan(event({ hikeRegistration: 'optional' }));
    expect(await screen.findByTestId('plan-summary')).toHaveTextContent(/\d+ steps · about 15 min/);
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Your short introduction');
  });

  it('Clarity Night: step count and minutes', async () => {
    renderPlan(clarityNight());
    expect(await screen.findByTestId('plan-summary')).toHaveTextContent(/\d+ steps · about 15 min/);
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Your short introduction');
  });
});

describe('R14: the confirmation line', () => {
  const line = async (e: EventWithHost) => {
    render(<MemoryRouter><LearnInvitation event={e} /></MemoryRouter>);
    return (await screen.findByTestId('learn-card-optional')).textContent;
  };

  it('hike that asks, before start minus 24 hours: required and the reminder', async () => {
    expect(await line(event({ hikeRegistration: 'when' }))).toBe("Required for this hike. We'll remind you by email.");
  });

  it('hike that asks, after start minus 24 hours: required only', async () => {
    expect(await line(event({ hikeRegistration: 'all', datetime: new Date(Date.now() + 5 * HOUR).toISOString() }))).toBe('Required for this hike.');
  });

  it('the loading placeholder holds the line it settles into (review fix: no jump from the shorter "Optional" line)', async () => {
    ctl.restoring = true; // the session is still being restored: the card's place shows its placeholder
    render(<MemoryRouter><LearnInvitation event={event({ hikeRegistration: 'all' })} /></MemoryRouter>);
    const skeleton = await screen.findByTestId('learn-card-skeleton');
    expect(within(skeleton).getByTestId('learn-card-optional').textContent).toBe("Required for this hike. We'll remind you by email.");
  });

  it('the placeholder while the card decides holds the same line (review round 2: the second skeleton branch)', async () => {
    // Signed in (not restoring), so the first placeholder branch cannot fire; the preparation read is still out, so the card
    // is still deciding whether to show. Earlier tests leave the card's remembered answer behind; a memory would decide.
    localStorage.clear();
    ctl.deciding = true;
    render(<MemoryRouter><LearnInvitation event={event({ hikeRegistration: 'when' })} /></MemoryRouter>);
    const skeleton = await screen.findByTestId('learn-card-skeleton');
    expect(within(skeleton).getByTestId('learn-card-optional').textContent).toBe("Required for this hike. We'll remind you by email.");
  });

  it('one-tap hike: optional, as before', async () => {
    expect(await line(event({ hikeRegistration: 'optional' }))).toBe('Optional. You can come without it.');
  });

  it('Clarity Night: no learning card at all (it has no offer), so nothing says "required"', async () => {
    const { container } = render(<MemoryRouter><LearnInvitation event={clarityNight()} /></MemoryRouter>);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).not.toContain('Required');
    expect(screen.queryByTestId('learn-card-optional')).toBeNull();
  });
});
