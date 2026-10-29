/**
 * P1542 round 10f.
 *  1. Query shape (P1527): with the group's id on the event row, membership is ONE read and the name is read by id —
 *     the event's organiser lookup is never made; an event with no group answers at once, with no request.
 *  2. usePrepState never hands out the previous inputs' data — other viewer, other tag — even while the new read stalls.
 *  3. A page that turned the preparation reads off (no viewer) sends no social-proof read either.
 *  5. A timed-out card keeps what it displayed: a late answer changes nothing on screen.
 *  6. The WhatsApp place is decided per event.
 *  7. An event with no group is remembered per event, never shared with other groupless events.
 *  Plus: the host and an offline viewer get no learning card.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const never = () => new Promise<never>(() => {});
const ctl = vi.hoisted(() => ({
  auth: { user: { id: 'user-id-1234' } as { id: string } | null },
  offline: false,
  prep: (() => Promise.resolve(null)) as (eventId: string, viewerId: string) => Promise<unknown>,
  points: (() => new Promise(() => {})) as (tag: string, viewerId: string) => Promise<unknown>,
  membership: (() => new Promise(() => {})) as (orgId: string) => Promise<unknown>,
  orgById: (() => new Promise(() => {})) as (orgId: string) => Promise<unknown>,
  calls: { organizer: 0, organizerThrow: 0, orgById: 0, membership: 0, proof: 0, prep: 0, points: 0 },
}));

vi.mock('@/auth', () => ({
  useAuth: () => ({ user: ctl.auth.user, session: ctl.auth.user ? { user: ctl.auth.user } : null, sessionChecked: true, isLoading: false }),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: ctl.offline, reconnectTick: 0 }) }));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  getMyPreparation: (eventId: string, viewerId: string) => { ctl.calls.prep += 1; return ctl.prep(eventId, viewerId); },
  getMyPrepParts: () => Promise.resolve([]),
  getPrepSocialProof: () => { ctl.calls.proof += 1; return new Promise(() => {}); },
}));
vi.mock('@/app/data/points-service', () => ({
  pointsService: { getPublicPointsFeed: (_l: number, _o: number, tag: string, viewerId: string) => { ctl.calls.points += 1; return ctl.points(tag, viewerId); } },
}));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventOrganizer: () => { ctl.calls.organizer += 1; return never(); },
    getEventOrganizerOrThrow: () => { ctl.calls.organizerThrow += 1; return never(); },
    getOrganizationByIdOrThrow: (orgId: string) => { ctl.calls.orgById += 1; return ctl.orgById(orgId); },
  },
}));
vi.mock('@/app/data/organizations-service', () => ({
  organizationsService: { getMyMembership: (orgId: string) => { ctl.calls.membership += 1; return ctl.membership(orgId); } },
}));
vi.mock('@/app/data/group-chat-opens-service', () => ({
  readGroupChatOpenedOnServer: () => never(),
  markGroupChatOpenedOnServer: () => Promise.resolve({ ok: true, refused: false }),
}));

import { useEventCommunityName, useEventMembership } from '@/app/prototypes/events/use-event-community';
import { usePrepState } from '@/app/prototypes/events/prep/use-prep-state';
import { LearnInvitation } from '@/app/prototypes/events/prep/PrepRoom';
import { RegisteredBlock } from '@/app/prototypes/events/prep/PrepPieces';
import { eventChatOpenedHintKey } from '@/app/prototypes/events/use-group-chat-opened';
import type { EventWithHost } from '@/app/types';

const hike = (id: string, extra: Record<string, unknown> = {}) => ({
  id, slug: id, title: 'Social Hike', hostId: 'host-id-1234', seriesSlug: 'social-hike', preparationEnabled: false,
  statementTag: null, datetime: new Date(Date.now() + 864e5).toISOString(), durationMinutes: 60, location: 'Test',
  description: '', hasGroupChat: true, orgId: 'org-id-1234', ...extra,
}) as unknown as EventWithHost;

beforeEach(() => {
  localStorage.clear();
  ctl.auth.user = { id: 'user-id-1234' };
  ctl.offline = false;
  ctl.prep = () => Promise.resolve(null);
  ctl.points = () => never();
  ctl.membership = () => never();
  ctl.orgById = () => never();
  ctl.calls = { organizer: 0, organizerThrow: 0, orgById: 0, membership: 0, proof: 0, prep: 0, points: 0 };
  setVisibility('visible');
});

// The tab's visibility, as the browser reports it (when-visible.ts reads document.visibilityState).
let visibility: 'visible' | 'hidden' = 'visible';
Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
function setVisibility(v: 'visible' | 'hidden') { visibility = v; document.dispatchEvent(new Event('visibilitychange')); }

describe('1: the group comes from the event row (query shape)', () => {
  it('membership is one read by the row\'s org id; no organiser lookup', async () => {
    ctl.membership = () => Promise.resolve({ role: 'member' });
    const { result } = renderHook(() => useEventMembership({ id: 'event-a', orgId: 'org-id-1234' }, true, 'user-id-1234'));
    await waitFor(() => expect(result.current).toBe(true));
    expect(ctl.calls.membership).toBe(1);
    expect(ctl.calls.organizerThrow).toBe(0);
  });

  it('the name is read by the row\'s org id; no organiser lookup', async () => {
    ctl.orgById = () => Promise.resolve({ id: 'org-id-1234', name: 'Test Community · Chiang Mai', slug: 't' });
    const { result } = renderHook(() => useEventCommunityName({ id: 'event-a', orgId: 'org-id-1234' }));
    await waitFor(() => expect(result.current).toBe('Test Community'));
    expect(ctl.calls.orgById).toBe(1);
    expect(ctl.calls.organizer).toBe(0);
  });

  it('an event with no group answers on the first render and sends nothing', () => {
    const m = renderHook(() => useEventMembership({ id: 'event-a', orgId: null }, true, 'user-id-1234'));
    const n = renderHook(() => useEventCommunityName({ id: 'event-a', orgId: null }));
    expect(m.result.current).toBe(false);
    expect(n.result.current).toBeNull();
    expect(ctl.calls).toMatchObject({ organizer: 0, organizerThrow: 0, orgById: 0, membership: 0 });
  });
});

describe('2: usePrepState never shows the previous inputs\' data', () => {
  it('another viewer whose read stalls sees nothing of the first viewer\'s preparation or points', async () => {
    ctl.prep = (_e, viewer) => (viewer === 'user-a'
      ? Promise.resolve({ eventId: 'event-a', startedAt: 'A', completedAt: '2026-10-01T00:00:00Z', stepsDone: [] })
      : never());
    ctl.points = (_t, viewer) => (viewer === 'user-a' ? Promise.resolve([{ id: 'p1' }]) : never());
    const { result, rerender } = renderHook(({ viewer }) => usePrepState(hike('event-a'), viewer), { initialProps: { viewer: 'user-a' } });
    await waitFor(() => expect(result.current.prep).not.toBeNull());
    await waitFor(() => expect(result.current.cmp7Points).not.toBeNull());
    expect(result.current.learned).toBe(true);
    rerender({ viewer: 'user-b' });
    expect(result.current.loading).toBe(true);
    expect(result.current.prep).toBeNull();
    expect(result.current.learned).toBe(false);
    expect(result.current.cmp7Points).toBeNull();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(result.current.prep).toBeNull();
    expect(result.current.cmp7Points).toBeNull();
  });

  it('a new statement tag hides the previous tag\'s points until its own read answers (no step is skipped on them)', async () => {
    ctl.points = (tag) => (tag === 'old-tag' || tag === 'cmp7' ? Promise.resolve([{ id: `${tag}-1`, userPosition: 'agree' }]) : never());
    const { result, rerender } = renderHook(({ tag }) => usePrepState(hike('event-a', { statementTag: tag }), 'user-a'), { initialProps: { tag: 'old-tag' } });
    await waitFor(() => expect(result.current.eventPoints).not.toBeNull());
    rerender({ tag: 'new-tag' });
    expect(result.current.eventPoints).toBeNull();
  });
});

describe('3: no viewer, no preparation reads at all', () => {
  it('the hike thank-you\'s usePrepState(event, undefined) sends no social-proof read', async () => {
    renderHook(() => usePrepState(hike('event-a'), undefined));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(ctl.calls.proof).toBe(0);
  });
});

describe('5: a timed-out card keeps what it displayed', () => {
  it('remembered "show" decides at the deadline; the name read answering late does not change the title', async () => {
    localStorage.setItem('p1542-learn-card:user-id-1234:org:org-id-1234', JSON.stringify({ show: true, community: 'Remembered Name' }));
    let answerName: (v: unknown) => void = () => {};
    ctl.orgById = () => new Promise((r) => { answerName = r; });
    ctl.prep = () => never();
    vi.useFakeTimers();
    try {
      render(<MemoryRouter><LearnInvitation event={hike('event-a')} /></MemoryRouter>);
      expect(screen.getByTestId('learn-card-title')).toHaveTextContent('Remembered Name');
      await act(async () => { await vi.advanceTimersByTimeAsync(4300); });
      await act(async () => { answerName({ id: 'org-id-1234', name: 'Late Name', slug: 't' }); await vi.advanceTimersByTimeAsync(30); });
      expect(screen.getByTestId('learn-card-title')).toHaveTextContent('Remembered Name');
      expect(screen.getByTestId('learn-card-cta')).toHaveTextContent('Learn more');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('6: the WhatsApp place is decided per event', () => {
  it('moving to another event (opened before) re-decides: no place kept there', () => {
    localStorage.setItem(eventChatOpenedHintKey('user-id-1234', 'event-b'), '1');
    const { rerender } = render(<MemoryRouter><RegisteredBlock event={hike('event-a')} groupChatUrl={null} viewerId="user-id-1234" /></MemoryRouter>);
    expect(screen.getByTestId('registered-chat-pending')).toBeInTheDocument();
    rerender(<MemoryRouter><RegisteredBlock event={hike('event-b')} groupChatUrl={null} viewerId="user-id-1234" /></MemoryRouter>);
    expect(screen.queryByTestId('registered-chat-pending')).toBeNull();
  });
});

describe('7: an event with no group is remembered per event', () => {
  it('a remembered "hide" for one groupless event does not hide the card on another', () => {
    localStorage.setItem('p1542-learn-card:user-id-1234:no-org:event-x', JSON.stringify({ show: false, community: null }));
    render(<MemoryRouter><LearnInvitation event={hike('event-y', { orgId: null })} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
  });
});

describe('the host and an offline viewer get no learning card', () => {
  it('the host: nothing', () => {
    ctl.auth.user = { id: 'host-id-1234' };
    const { container } = render(<MemoryRouter><LearnInvitation event={hike('event-a')} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
  it('offline: nothing', () => {
    ctl.offline = true;
    const { container } = render(<MemoryRouter><LearnInvitation event={hike('event-a')} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('round 10g: a hidden tab makes no preparation requests', () => {
  it('mounted hidden → 0 prep, points and social-proof requests; shown → each exactly once', async () => {
    setVisibility('hidden');
    // A viewer of its own: round 9's shared in-flight point reads from earlier tests (which never answer) must not be
    // joined here.
    renderHook(() => usePrepState(hike('event-hidden', { statementTag: 'stake-tag-hidden' }), 'user-hidden'));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(ctl.calls).toMatchObject({ prep: 0, points: 0, proof: 0 });
    await act(async () => { setVisibility('visible'); await new Promise((r) => setTimeout(r, 30)); });
    expect(ctl.calls.prep).toBe(1);
    expect(ctl.calls.points).toBe(2); // the cmp7 statements and the event's own tag: two different reads, once each
    expect(ctl.calls.proof).toBe(1);
  });

  it('unmounted while hidden: becoming visible later sends nothing', async () => {
    setVisibility('hidden');
    const { unmount } = renderHook(() => usePrepState(hike('event-a', { statementTag: 'stake-tag' }), 'user-id-1234'));
    unmount();
    await act(async () => { setVisibility('visible'); await new Promise((r) => setTimeout(r, 30)); });
    expect(ctl.calls).toMatchObject({ prep: 0, points: 0, proof: 0 });
  });
});

