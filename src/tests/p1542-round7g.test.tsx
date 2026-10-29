// @vitest-environment jsdom
/**
 * P1542 round 7g. (1) A reopened group terms decides on ready + membership in every order. (3) The organiser → org →
 * membership chain sends nothing while the tab is hidden, also when it hides part way through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const { ev, orgs } = vi.hoisted(() => ({
  ev: { getEventOrganizer: vi.fn(), getEventOrganizerOrThrow: vi.fn() },
  orgs: { getOrganizationBySlug: vi.fn(), getMyMembership: vi.fn() },
}));
vi.mock('@/app/data/events-service', () => ({ eventsService: ev }));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: orgs }));

import { useJoinResume } from '@/app/prototypes/events/close/use-join-resume';
import { MEMBERSHIP_READ_TIMEOUT_MS, useEventMembership, useOrgMembership } from '@/app/prototypes/events/use-event-community';

type Member = boolean | null | undefined;
type Props = { ready: boolean; isMember: Member; atJoin?: boolean; showable?: boolean };
function mount(initial: Props) {
  const leave = vi.fn();
  const view = renderHook((p: Props) => useJoinResume({ ready: p.ready, atJoin: p.atJoin ?? true, showable: p.showable ?? true, isMember: p.isMember, leave }), { initialProps: initial });
  return { leave, rerender: view.rerender };
}
// What the page shows on the group terms step for a given state (EventClosePage: terms on === false, loader otherwise).
const shown = (left: boolean, m: Member) => (left ? 'thank-you' : m === false ? 'terms' : 'loader');

describe('round 7g (1): reopened group terms — every ordering of ready and membership', () => {
  const expected: [Member, string][] = [[true, 'thank-you'], [null, 'thank-you'], [false, 'terms']];
  for (const [m, want] of expected) {
    it(`membership ${String(m)} BEFORE ready → ${want}`, () => {
      const { leave, rerender } = mount({ ready: false, isMember: undefined });
      rerender({ ready: false, isMember: m });
      expect(leave).not.toHaveBeenCalled(); // nothing decided before the page is ready
      rerender({ ready: true, isMember: m });
      expect(shown(leave.mock.calls.length > 0, m)).toBe(want);
    });
    it(`membership ${String(m)} AFTER ready → ${want}`, () => {
      const { leave, rerender } = mount({ ready: false, isMember: undefined });
      rerender({ ready: true, isMember: undefined });
      expect(shown(leave.mock.calls.length > 0, undefined)).toBe('loader');
      rerender({ ready: true, isMember: m });
      expect(shown(leave.mock.calls.length > 0, m)).toBe(want);
    });
    it(`membership ${String(m)} in the SAME commit as ready → ${want}`, () => {
      const { leave, rerender } = mount({ ready: false, isMember: undefined });
      rerender({ ready: true, isMember: m });
      expect(shown(leave.mock.calls.length > 0, m)).toBe(want);
    });
  }
  it('membership still out → loader, and it stays decided once (a later change does not bounce)', () => {
    const { leave, rerender } = mount({ ready: true, isMember: undefined });
    expect(shown(leave.mock.calls.length > 0, undefined)).toBe('loader');
    rerender({ ready: true, isMember: false });
    rerender({ ready: true, isMember: true }); // joined on the terms: the page's own onJoined moves on, not this
    expect(leave).not.toHaveBeenCalled();
  });
  it('terms that cannot be shown (no group, or not learned) leave at ready without waiting', () => {
    const { leave } = mount({ ready: true, isMember: undefined, showable: false });
    expect(leave).toHaveBeenCalledTimes(1);
  });
  it('opened on another step: later membership never moves the person', () => {
    const { leave, rerender } = mount({ ready: true, isMember: undefined, atJoin: false });
    rerender({ ready: true, isMember: true, atJoin: false });
    rerender({ ready: true, isMember: true, atJoin: true });
    expect(leave).not.toHaveBeenCalled();
  });
  it('the page renders the loader for every non-false membership on the terms step (never blank)', () => {
    const close = readFileSync(join(__dirname, '../app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
    expect(close).toMatch(/step === 'join' && community && learned && isMember !== false && <ClarityPageLoader \/>/);
    expect(close).toMatch(/step === 'join' && community && learned && isMember === false && \(/);
    expect(close).toMatch(/useJoinResume\(\{ ready, atJoin: step === 'join', showable: !!community && learned, isMember/);
    expect(close).not.toMatch(/joinResumeWaits/);
  });
});

let visibility: 'visible' | 'hidden' = 'visible';
const setVisibility = (v: 'visible' | 'hidden') => { visibility = v; document.dispatchEvent(new Event('visibilitychange')); };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }

describe('round 7g (3): the membership chain waits for a visible tab before EVERY request', () => {
  beforeEach(() => {
    for (const f of [ev.getEventOrganizerOrThrow, orgs.getOrganizationBySlug, orgs.getMyMembership]) f.mockReset();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  afterEach(() => { visibility = 'visible'; });

  it('hidden after the organiser read resolves → 0 further requests while hidden; continues once visible', async () => {
    // Round 9 (speed): two hops — the organiser read carries the group id, so there is no group read by slug.
    const organiser = deferred<{ id: string; name: string; slug: string } | null>();
    ev.getEventOrganizerOrThrow.mockReturnValue(organiser.promise);
    orgs.getMyMembership.mockResolvedValue(null);
    const { result } = renderHook(() => useEventMembership('e1', true, 'viewer-1'));
    await act(flush);
    expect(ev.getEventOrganizerOrThrow).toHaveBeenCalledTimes(1);
    act(() => setVisibility('hidden'));
    await act(async () => { organiser.resolve({ id: 'o1', name: 'G', slug: 'g' }); await flush(); });
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(0);
    expect(result.current).toBeUndefined();
    act(() => setVisibility('visible'));
    await act(flush);
    expect(orgs.getOrganizationBySlug).toHaveBeenCalledTimes(0);
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(1);
    expect(orgs.getMyMembership).toHaveBeenCalledWith('o1', 'viewer-1');
    expect(result.current).toBe(false);
  });

  it('unmounting part way stops the chain: becoming visible later sends nothing', async () => {
    const organiser = deferred<{ name: string; slug: string } | null>();
    ev.getEventOrganizerOrThrow.mockReturnValue(organiser.promise);
    orgs.getOrganizationBySlug.mockResolvedValue({ id: 'o1' });
    const { unmount } = renderHook(() => useEventMembership('e1'));
    await act(flush);
    expect(ev.getEventOrganizerOrThrow).toHaveBeenCalledTimes(1);
    act(() => setVisibility('hidden'));
    await act(async () => { organiser.resolve({ name: 'G', slug: 'g' }); await flush(); });
    unmount();
    act(() => setVisibility('visible'));
    await flush();
    expect(orgs.getOrganizationBySlug).toHaveBeenCalledTimes(0);
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(0);
  });

  it('a failed read anywhere in the chain is null (unknown); an event with no group is false', async () => {
    ev.getEventOrganizerOrThrow.mockRejectedValueOnce(new Error('network'));
    const failed = renderHook(() => useEventMembership('e1'));
    await act(flush);
    expect(failed.result.current).toBeNull();
    ev.getEventOrganizerOrThrow.mockResolvedValueOnce(null);
    const none = renderHook(() => useEventMembership('e2'));
    await act(flush);
    expect(none.result.current).toBe(false);
  });
});

describe('round 7g (2): the hike thank-you holds its actions until membership is known', () => {
  const close = readFileSync(join(__dirname, '../app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
  const thankYou = close.slice(close.indexOf("{step === 'end' && recipe.prepare.offer && ("), close.indexOf("{step === 'end' && !recipe.prepare.offer && ("));
  it('holds only while a named join offer has a group and the answer is out', () => {
    expect(close).toMatch(/const actionsHeld = recipe\.joinOffer\.named && !!community && isMember === undefined;/);
  });
  it('the heading is not held; both the Join block and the group-chat link are', () => {
    expect(thankYou).toMatch(/data-testid="step-question">Thank you for your feedback<\/h1>/);
    expect(thankYou).not.toMatch(/actionsHeld[^\n]*Thank you for your feedback/);
    expect(thankYou).toMatch(/\{!actionsHeld && recipe\.joinOffer\.named && community && isMember === false && !joined && \(/);
    expect(thankYou).toMatch(/\{!actionsHeld && groupChatUrl && chat\.opened === false && recipe\.afterChatCaption && \(/);
    // The heading comes before anything held.
    expect(thankYou.indexOf('Thank you for your feedback')).toBeLessThan(thankYou.indexOf('!actionsHeld'));
  });
});

describe('round 7h: a membership read that never settles becomes unknown 4s after it was SENT', () => {
  const never = () => new Promise<never>(() => {});
  const after = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  beforeEach(() => {
    vi.useFakeTimers();
    for (const f of [ev.getEventOrganizerOrThrow, orgs.getOrganizationBySlug, orgs.getMyMembership]) f.mockReset();
    visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  });
  afterEach(() => { vi.useRealTimers(); visibility = 'visible'; });

  it('is 4 seconds', () => { expect(MEMBERSHIP_READ_TIMEOUT_MS).toBe(4000); });

  it('useOrgMembership: a hang → still waiting at 3.999s, null at 4s; a late answer is ignored', async () => {
    let answer!: (v: unknown) => void;
    orgs.getMyMembership.mockReturnValue(new Promise((r) => { answer = r; }));
    const { result } = renderHook(() => useOrgMembership('o1'));
    await tick(0);
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(1);
    await tick(3999);
    expect(result.current).toBeUndefined();
    await tick(1);
    expect(result.current).toBeNull();
    await act(async () => { answer({ role: 'member' }); await vi.advanceTimersByTimeAsync(10); });
    expect(result.current).toBeNull();
  });

  it('useOrgMembership: an answer at 3s → that answer (and nothing changes at 4s)', async () => {
    orgs.getMyMembership.mockImplementation(() => after(3000, { role: 'member' }));
    const { result } = renderHook(() => useOrgMembership('o1'));
    await tick(3000);
    expect(result.current).toBe(true);
    await tick(2000);
    expect(result.current).toBe(true);
    orgs.getMyMembership.mockImplementation(() => after(3000, null));
    const other = renderHook(() => useOrgMembership('o2'));
    await tick(5000);
    expect(other.result.current).toBe(false);
  });

  it('useOrgMembership: the hidden-tab wait does not count toward the 4s', async () => {
    visibility = 'hidden';
    orgs.getMyMembership.mockImplementation(never);
    const { result } = renderHook(() => useOrgMembership('o1'));
    await tick(10_000);
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(0);
    expect(result.current).toBeUndefined();
    act(() => setVisibility('visible'));
    await tick(3999);
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(1);
    expect(result.current).toBeUndefined();
    await tick(1);
    expect(result.current).toBeNull();
  });

  it('useOrgMembership: unmount clears the timer (no state change, no pending timer left)', async () => {
    orgs.getMyMembership.mockImplementation(never);
    const { unmount } = renderHook(() => useOrgMembership('o1'));
    await tick(0);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('useEventMembership: each hop has 4s from its own send; a hang on the last hop → null at 4s after IT was sent', async () => {
    ev.getEventOrganizerOrThrow.mockImplementation(() => after(3000, { id: 'o1', name: 'G', slug: 'g' }));
    orgs.getMyMembership.mockImplementation(never);
    const { result } = renderHook(() => useEventMembership('e1'));
    await tick(3000); // the first hop took 3s: it did not trip its own 4s
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(1);
    expect(result.current).toBeUndefined();
    await tick(3999);
    expect(result.current).toBeUndefined();
    await tick(1);
    expect(result.current).toBeNull();
  });

  it('useEventMembership: a hang on the first hop → null at 4s, and the chain sends nothing more', async () => {
    let answer!: (v: unknown) => void;
    ev.getEventOrganizerOrThrow.mockReturnValue(new Promise((r) => { answer = r; }));
    const { result } = renderHook(() => useEventMembership('e1'));
    await tick(4000);
    expect(result.current).toBeNull();
    await act(async () => { answer({ name: 'G', slug: 'g' }); await vi.advanceTimersByTimeAsync(10); });
    expect(orgs.getOrganizationBySlug).toHaveBeenCalledTimes(0);
    expect(result.current).toBeNull();
  });

  it('useEventMembership: hidden between hops does not count; the next hop gets its full 4s once visible', async () => {
    ev.getEventOrganizerOrThrow.mockImplementation(() => after(1000, { id: 'o1', name: 'G', slug: 'g' }));
    orgs.getMyMembership.mockImplementation(never);
    const { result } = renderHook(() => useEventMembership('e1'));
    await tick(0);
    act(() => setVisibility('hidden'));
    await tick(20_000);
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(0);
    expect(result.current).toBeUndefined();
    act(() => setVisibility('visible'));
    await tick(3999);
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(1);
    expect(result.current).toBeUndefined();
    await tick(1);
    expect(result.current).toBeNull();
  });
});
