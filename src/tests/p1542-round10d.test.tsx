/**
 * P1542 round 10d.
 *  1. usePrepState: only the latest read sets state (a late answer for earlier inputs never wins, never leaves loading
 *     stuck); disabled inputs answer "idle" on the same render.
 *  2. The learning card's deadline bounds the whole decision (a membership read held by a hidden tab included); a
 *     trusted "show" memory carries a slow decision without flicker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const never = () => new Promise<never>(() => {});

const ctl = vi.hoisted(() => ({
  prep: new Map<string, { promise: Promise<unknown>; resolve: (v: unknown) => void }>(),
  prepImpl: null as null | ((eventId: string) => Promise<unknown>),
  membership: (() => new Promise(() => {})) as () => Promise<unknown>,
  hidden: false,
  waiting: [] as Array<() => void>,
  auth: { user: { id: 'user-id-1234' } as { id: string } | null },
}));

vi.mock('@/auth', () => ({
  useAuth: () => ({ user: ctl.auth.user, session: ctl.auth.user ? { user: ctl.auth.user } : null, sessionChecked: true, isLoading: false }),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  getMyPreparation: (eventId: string) => (ctl.prepImpl ? ctl.prepImpl(eventId) : Promise.resolve(null)),
  getMyPrepParts: () => Promise.resolve([]),
  getPrepSocialProof: () => new Promise(() => {}),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: () => new Promise(() => {}) } }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventOrganizer: () => Promise.resolve({ id: 'org-id-1234', name: 'Test Community', slug: 'test' }),
    getEventOrganizerOrThrow: () => Promise.resolve({ id: 'org-id-1234', name: 'Test Community', slug: 'test' }),
    getOrganizationByIdOrThrow: () => Promise.resolve({ id: 'org-id-1234', name: 'Test Community', slug: 'test' }),
  },
}));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: { getMyMembership: () => ctl.membership() } }));
// The tab's visibility: while hidden, the membership read waits (metered-services rule 3) and never sends.
vi.mock('@/app/prototypes/events/when-visible', () => ({
  whenVisible: (run: () => void) => {
    if (!ctl.hidden) { run(); return () => {}; }
    ctl.waiting.push(run);
    return () => { ctl.waiting = ctl.waiting.filter((f) => f !== run); };
  },
}));

import { usePrepState } from '@/app/prototypes/events/prep/use-prep-state';
import { LearnInvitation } from '@/app/prototypes/events/prep/PrepRoom';
import type { EventWithHost } from '@/app/types';

const hikeOf = (id: string) => ({
  id, slug: id, title: 'Social Hike', hostId: 'host-id-1234', seriesSlug: 'social-hike', preparationEnabled: false,
  statementTag: null, datetime: new Date(Date.now() + 864e5).toISOString(), orgId: 'org-id-1234',
}) as unknown as EventWithHost;
const MEMORY = 'p1542-learn-card:user-id-1234:org:org-id-1234';

beforeEach(() => {
  localStorage.clear();
  ctl.prep.clear();
  ctl.prepImpl = null;
  ctl.membership = () => never();
  ctl.hidden = false;
  ctl.waiting = [];
  ctl.auth.user = { id: 'user-id-1234' };
});

describe('1: usePrepState — only the latest read sets state', () => {
  beforeEach(() => {
    ctl.prepImpl = (eventId) => {
      const d = deferred<unknown>();
      ctl.prep.set(eventId, d as never);
      return d.promise;
    };
  });

  it('A starts, inputs switch to B, B finishes, A finishes late → not loading, B\'s data', async () => {
    const { result, rerender } = renderHook(({ ev }) => usePrepState(ev, 'user-id-1234'), { initialProps: { ev: hikeOf('event-a') } });
    await waitFor(() => expect(ctl.prep.has('event-a')).toBe(true));
    rerender({ ev: hikeOf('event-b') });
    await waitFor(() => expect(ctl.prep.has('event-b')).toBe(true));
    await act(async () => { ctl.prep.get('event-b')!.resolve({ eventId: 'event-b', startedAt: 'B' }); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { ctl.prep.get('event-a')!.resolve({ eventId: 'event-a', startedAt: 'A' }); });
    expect(result.current.loading).toBe(false);
    expect(result.current.prep).toMatchObject({ startedAt: 'B' });
  });

  it('signing out while a read is in flight: idle at once, and the late answer is dropped', async () => {
    const { result, rerender } = renderHook(({ viewer }) => usePrepState(hikeOf('event-a'), viewer), { initialProps: { viewer: 'user-id-1234' as string | undefined } });
    await waitFor(() => expect(ctl.prep.has('event-a')).toBe(true));
    expect(result.current.loading).toBe(true);
    rerender({ viewer: undefined });
    // Same render: disabled inputs are idle, never one extra "loading" render.
    expect(result.current.loading).toBe(false);
    await act(async () => { ctl.prep.get('event-a')!.resolve({ eventId: 'event-a', startedAt: 'A' }); });
    expect(result.current.loading).toBe(false);
    expect(result.current.prep).toBeNull();
  });

  it('disabled from the start (no event) is idle on the first render', () => {
    const { result } = renderHook(() => usePrepState(null, 'user-id-1234'));
    expect(result.current.loading).toBe(false);
  });
});

describe('2: the learning card\'s deadline bounds the whole decision', () => {
  it('round 10f: in a background tab the deadline does not run; it starts when the tab is shown, then bounds the stalled decision', async () => {
    ctl.hidden = true;
    const { container } = render(<MemoryRouter><LearnInvitation event={hikeOf('event-a')} /></MemoryRouter>);
    await act(async () => { await new Promise((r) => setTimeout(r, 4500)); });
    // Hidden for longer than the deadline: the card's place is still held, nothing lost.
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
    // Shown: the membership read is sent and stalls; the 4s start now.
    ctl.membership = () => never();
    ctl.hidden = false;
    await act(async () => { const run = ctl.waiting.splice(0); run.forEach((f) => f()); });
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
    await waitFor(() => expect(container).toBeEmptyDOMElement(), { timeout: 6000 });
    expect(localStorage.getItem(MEMORY)).toBeNull();
  }, 15000);

  it('on timeout a trusted "show" memory decides: the card stays, with no skeleton or flicker, and nothing new is saved', async () => {
    const remembered = JSON.stringify({ show: true, community: 'Test Community' });
    localStorage.setItem(MEMORY, remembered);
    ctl.prepImpl = () => never();
    let sawSkeleton = false;
    const observer = new MutationObserver(() => { if (document.querySelector('[data-testid="learn-card-skeleton"]')) sawSkeleton = true; });
    observer.observe(document.body, { childList: true, subtree: true });
    render(<MemoryRouter><LearnInvitation event={hikeOf('event-a')} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-cta')).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 4500)); });
    observer.disconnect();
    expect(screen.getByTestId('learn-card-cta')).toBeInTheDocument();
    expect(sawSkeleton).toBe(false);
    expect(localStorage.getItem(MEMORY)).toBe(remembered);
  }, 10000);
});

describe('round 10e', () => {
  it('a timed-out decision stays timed out: the late read is neither shown nor remembered (Codex)', async () => {
    let answerPrep: (v: unknown) => void = () => {};
    ctl.prepImpl = () => new Promise((r) => { answerPrep = r; });
    ctl.membership = () => Promise.resolve(null);
    const { container } = render(<MemoryRouter><LearnInvitation event={hikeOf('event-a')} /></MemoryRouter>);
    await waitFor(() => expect(container).toBeEmptyDOMElement(), { timeout: 6000 });
    // The read answers late: not learned, not a member — which would be "show" had it been on time.
    await act(async () => { answerPrep(null); await new Promise((r) => setTimeout(r, 50)); });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('learn-card-cta')).toBeNull();
    expect(localStorage.getItem(MEMORY)).toBeNull();
  }, 10000);

  it('signed out: the previous viewer\'s preparation, parts and "learned" are not handed out', async () => {
    ctl.prepImpl = () => Promise.resolve({ eventId: 'event-a', startedAt: 'A', completedAt: '2026-10-01T00:00:00Z', stepsDone: [] });
    const { result, rerender } = renderHook(({ viewer }) => usePrepState(hikeOf('event-a'), viewer), { initialProps: { viewer: 'user-id-1234' as string | undefined } });
    await waitFor(() => expect(result.current.prep).not.toBeNull());
    expect(result.current.learned).toBe(true);
    rerender({ viewer: undefined });
    expect(result.current.prep).toBeNull();
    expect(result.current.parts).toEqual([]);
    expect(result.current.learned).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.cmp7Points).toBeNull();
  });
});

