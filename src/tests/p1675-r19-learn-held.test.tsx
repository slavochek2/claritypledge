// @vitest-environment jsdom
/**
 * P1675 R19 review fix F17: while a hiker's answer is still being read, the learning card's optional line is a held placeholder,
 * never the reminder promise that then flips to the meeting-point line. Settled, each answer shows its own line.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const ctl = vi.hoisted(() => ({ arrival: undefined as unknown }));
vi.mock('@/auth', () => ({
  useAuth: () => ({ user: { id: 'user-id-1234' }, session: { user: { id: 'user-id-1234' } }, sessionChecked: true, isLoading: false }),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/prototypes/events/use-my-arrival', async (orig) => ({
  ...(await orig<typeof import('@/app/prototypes/events/use-my-arrival')>()),
  useMyRegistrationArrival: () => ctl.arrival,
  useMyRegistrationArrivalRead: () => ({ arrival: null, failed: false, retry: () => {} }), // the prep state's own read (mastermind only)
}));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  getMyPreparation: () => Promise.resolve(null),
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

import { LearnInvitation } from '@/app/prototypes/events/prep/PrepRoom';
import type { EventWithHost } from '@/app/types';

afterEach(() => { cleanup(); localStorage.clear(); ctl.arrival = undefined; });

const HOUR = 3600 * 1000;
const hike = (extra: Record<string, unknown> = {}) => ({
  id: 'event-f17', slug: 'event-f17', title: 'Hike', hostId: 'host-id-1234', seriesSlug: 'social-hike', preparationEnabled: false,
  statementTag: null, datetime: new Date(Date.now() + 72 * HOUR).toISOString(), durationMinutes: 60, location: 'Test',
  description: '', hasGroupChat: true, orgId: 'org-id-1234', hikeRegistration: 'when', ...extra,
}) as unknown as EventWithHost;

const optional = async () => {
  render(<MemoryRouter><LearnInvitation event={hike()} /></MemoryRouter>);
  return screen.findByTestId('learn-card-optional');
};

describe('F17: the optional line while the hiker\'s answer is read', () => {
  it('read still out: the line is a held placeholder', async () => {
    ctl.arrival = undefined;
    const el = await optional();
    expect(el.querySelector('[data-testid="learn-card-optional-held"]')).not.toBeNull();
  });
  it('now or later hiker: the reminder line, not held', async () => {
    ctl.arrival = { owner: true, atDoors: false };
    const el = await optional();
    expect(el.textContent).toBe("Required for this hike. We'll remind you by email.");
    expect(el.querySelector('[data-testid="learn-card-optional-held"]')).toBeNull();
  });
  it('event hiker: the meeting-point line, not held', async () => {
    ctl.arrival = { owner: true, atDoors: true };
    const el = await optional();
    expect(el.textContent).not.toContain("We'll remind you by email.");
    expect(el.querySelector('[data-testid="learn-card-optional-held"]')).toBeNull();
  });
  it('no answer on a hike that asks (null): the reminder line, not held', async () => {
    ctl.arrival = null;
    const el = await optional();
    expect(el.textContent).toBe("Required for this hike. We'll remind you by email.");
  });
});
