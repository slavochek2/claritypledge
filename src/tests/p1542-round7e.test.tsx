// @vitest-environment jsdom
/**
 * P1542 round 7e — metered-services rule 3, "A hidden tab makes no requests". Every read this spec's hooks make on
 * mount waits for a visible tab: mounted hidden → 0 requests; becoming visible → exactly 1.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const { readOpened, markOpened, getEventClose, ev, orgs } = vi.hoisted(() => ({
  readOpened: vi.fn(),
  markOpened: vi.fn(),
  getEventClose: vi.fn(),
  ev: { getEventOrganizer: vi.fn(), getEventOrganizerOrThrow: vi.fn() },
  orgs: { getOrganizationBySlug: vi.fn(), getMyMembership: vi.fn() },
}));
vi.mock('@/app/data/group-chat-opens-service', () => ({
  readGroupChatOpenedOnServer: (...a: unknown[]) => readOpened(...a),
  markGroupChatOpenedOnServer: (...a: unknown[]) => markOpened(...a),
}));
vi.mock('@/app/data/event-close-service', () => ({ getEventClose: (...a: unknown[]) => getEventClose(...a) }));
vi.mock('@/app/data/events-service', () => ({ eventsService: ev }));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: orgs }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

import { whenVisible } from '@/app/prototypes/events/when-visible';
import { groupChatOpenedKey, pendingWriteKey, useGroupChatOpened } from '@/app/prototypes/events/use-group-chat-opened';
import { useFeedbackFinished } from '@/app/prototypes/events/use-feedback-finished';
import { useEventCommunityName, useEventMembership, useOrgMembership } from '@/app/prototypes/events/use-event-community';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LINK = 'https://chat.whatsapp.com/R7eHidden';
let visibility: 'visible' | 'hidden' = 'visible';
const setVisibility = (v: 'visible' | 'hidden') => { visibility = v; document.dispatchEvent(new Event('visibilitychange')); };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

beforeEach(() => {
  localStorage.clear();
  for (const f of [readOpened, markOpened, getEventClose, ev.getEventOrganizer, ev.getEventOrganizerOrThrow, orgs.getOrganizationBySlug, orgs.getMyMembership]) f.mockReset();
  readOpened.mockResolvedValue({ ok: true, opened: false });
  markOpened.mockResolvedValue({ ok: true, refused: false });
  getEventClose.mockResolvedValue({ finished: false });
  ev.getEventOrganizer.mockResolvedValue({ name: 'G · X', slug: 'g' });
  ev.getEventOrganizerOrThrow.mockResolvedValue({ name: 'G', slug: 'g' });
  orgs.getOrganizationBySlug.mockResolvedValue({ id: 'o1' });
  orgs.getMyMembership.mockResolvedValue(null);
  visibility = 'hidden';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
afterEach(() => { visibility = 'visible'; });

describe('whenVisible', () => {
  it('runs at once in a visible tab; waits for visible otherwise; once; cancellable', () => {
    const run = vi.fn();
    visibility = 'visible';
    whenVisible(run);
    expect(run).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    const later = vi.fn();
    whenVisible(later);
    expect(later).not.toHaveBeenCalled();
    setVisibility('visible');
    setVisibility('hidden');
    setVisibility('visible');
    expect(later).toHaveBeenCalledTimes(1);
    visibility = 'hidden';
    const cancelled = vi.fn();
    const cancel = whenVisible(cancelled);
    cancel();
    setVisibility('visible');
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('rule 3: mounted in a hidden tab → 0 requests; visible → exactly 1', () => {
  it('group chat "opened?" server read', async () => {
    renderHook(() => useGroupChatOpened('e1', LINK, 'u1'));
    await flush();
    expect(readOpened).toHaveBeenCalledTimes(0);
    act(() => setVisibility('visible'));
    await flush();
    expect(readOpened).toHaveBeenCalledTimes(1);
  });

  it('a pending tap write is retried only once the tab is visible', async () => {
    localStorage.setItem(groupChatOpenedKey('u1', LINK), '1');
    localStorage.setItem(pendingWriteKey('u1', LINK), 'e1');
    const { result } = renderHook(() => useGroupChatOpened('e1', LINK, 'u1'));
    expect(result.current.opened).toBe(true); // the local flag is read at once (no request)
    await flush();
    expect(markOpened).toHaveBeenCalledTimes(0);
    act(() => setVisibility('visible'));
    await flush();
    expect(markOpened).toHaveBeenCalledTimes(1);
  });

  it('feedback finished read (the room)', async () => {
    renderHook(() => useFeedbackFinished('e1', true));
    await flush();
    expect(getEventClose).toHaveBeenCalledTimes(0);
    act(() => setVisibility('visible'));
    await flush();
    expect(getEventClose).toHaveBeenCalledTimes(1);
  });

  it('membership read and community name read', async () => {
    renderHook(() => useEventMembership('e1'));
    renderHook(() => useEventCommunityName('e1'));
    await flush();
    expect(ev.getEventOrganizerOrThrow).toHaveBeenCalledTimes(0);
    expect(ev.getEventOrganizer).toHaveBeenCalledTimes(0);
    act(() => setVisibility('visible'));
    await flush();
    expect(ev.getEventOrganizerOrThrow).toHaveBeenCalledTimes(1);
    expect(ev.getEventOrganizer).toHaveBeenCalledTimes(1);
  });

  it('unmounting while hidden cancels the wait: becoming visible later sends nothing', async () => {
    const { unmount } = renderHook(() => useGroupChatOpened('e1', LINK, 'u1'));
    unmount();
    act(() => setVisibility('visible'));
    await flush();
    expect(readOpened).toHaveBeenCalledTimes(0);
  });

  it('the tap itself (a user action in a visible tab) is sent at once', async () => {
    visibility = 'visible';
    const { result } = renderHook(() => useGroupChatOpened('e1', LINK, 'u1'));
    await flush();
    act(() => result.current.markOpened('event_page'));
    await flush();
    expect(markOpened).toHaveBeenCalledTimes(1);
  });
});

describe('round 7f: the close page reads membership outside the community lookup, once visible', () => {
  it('mounted hidden → 0 membership requests and no answer (no Join); visible → exactly 1', async () => {
    orgs.getMyMembership.mockResolvedValue(null);
    const { result } = renderHook(() => useOrgMembership('o1'));
    await flush();
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(0);
    expect(result.current).toBeUndefined();
    act(() => setVisibility('visible'));
    await act(flush);
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(1);
    expect(orgs.getMyMembership).toHaveBeenCalledWith('o1');
    expect(result.current).toBe(false);
  });

  it('a member reads true; a failed read is null (unknown), never false; no group yet sends nothing', async () => {
    visibility = 'visible';
    orgs.getMyMembership.mockResolvedValueOnce({ role: 'member' });
    const member = renderHook(() => useOrgMembership('o1'));
    await act(flush);
    expect(member.result.current).toBe(true);
    orgs.getMyMembership.mockRejectedValueOnce(new Error('network'));
    const failed = renderHook(() => useOrgMembership('o2'));
    await act(flush);
    expect(failed.result.current).toBeNull();
    const none = renderHook(() => useOrgMembership(null));
    await act(flush);
    expect(none.result.current).toBeUndefined();
    expect(orgs.getMyMembership).toHaveBeenCalledTimes(2);
  });

  it('the community lookup no longer waits on membership; the page reads it through the visible-only hook', () => {
    const close = readFileSync(join(__dirname, '../app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
    const lookup = close.slice(close.indexOf('getCommunitySlug(event.id)'), close.indexOf('.finally(() => setCommunityLoaded(true))'));
    expect(lookup).toMatch(/getMemberCounts\(\[org\.id\]\)/);
    expect(lookup).toMatch(/getParticipation\(\[org\.id\]\)/);
    expect(lookup).not.toMatch(/getMyMembership|setIsMember/);
    expect(close).not.toMatch(/getMyMembership/);
    // Round 9: the viewer's id is passed in (no extra auth round trip); the org gate is unchanged.
    expect(close).toMatch(/useOrgMembership\(recipe\.joinOffer\.named \? community\?\.org\.id : null, viewerId\)/);
    // A resumed group terms waits for the answer instead of leaving on "not yet known" (round 7g: the loader covers
    // every non-false state, so the step is never blank; the ordering itself is tested in p1542-round7g).
    expect(close).toMatch(/step === 'join' && community && learned && isMember !== false && <ClarityPageLoader \/>/);
  });
});
