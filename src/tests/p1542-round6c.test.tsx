// @vitest-environment jsdom
/**
 * P1542 round 6c: (A) a failed organiser / group lookup is "unknown" (null), never "not a member" (false);
 * (B) a group-chat tap the server REFUSES (42501) stops being retried, while any other failure keeps retrying.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { ev, orgs, rpc } = vi.hoisted(() => ({
  ev: { getEventOrganizer: vi.fn(), getEventOrganizerOrThrow: vi.fn() },
  orgs: { getOrganizationBySlug: vi.fn(), getMyMembership: vi.fn() },
  rpc: vi.fn(),
}));
vi.mock('@/app/data/events-service', () => ({ eventsService: ev }));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: orgs }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

import { useEventMembership } from '@/app/prototypes/events/use-event-community';
import { markGroupChatOpenedOnServer } from '@/app/data/group-chat-opens-service';
import { readPendingWrite, useGroupChatOpened } from '@/app/prototypes/events/use-group-chat-opened';

describe('(A) useEventMembership: unknown is never "not a member"', () => {
  beforeEach(() => {
    Object.values(ev).forEach((f) => f.mockReset());
    Object.values(orgs).forEach((f) => f.mockReset());
    // The display read still swallows errors into null, exactly as the real service does on a DB error.
    ev.getEventOrganizer.mockResolvedValue(null);
  });

  it('the organiser lookup FAILED → null (unknown), so no member-gated offer is shown', async () => {
    ev.getEventOrganizerOrThrow.mockRejectedValue(new Error('db down'));
    const { result } = renderHook(() => useEventMembership('e1'));
    await waitFor(() => expect(result.current).not.toBeUndefined());
    expect(result.current).toBeNull();
  });

  it('the event has NO group → false (a real "not a member")', async () => {
    ev.getEventOrganizerOrThrow.mockResolvedValue(null);
    const { result } = renderHook(() => useEventMembership('e1'));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('the membership lookup failed → null; a member → true; a non-member → false (round 9: two hops, by the group id)', async () => {
    ev.getEventOrganizerOrThrow.mockResolvedValue({ id: 'o1', name: 'G', slug: 'g' });
    orgs.getMyMembership.mockRejectedValue(new Error('db down'));
    const failed = renderHook(() => useEventMembership('e1'));
    await waitFor(() => expect(failed.result.current).not.toBeUndefined());
    expect(failed.result.current).toBeNull();
    expect(orgs.getOrganizationBySlug).not.toHaveBeenCalled();

    orgs.getMyMembership.mockResolvedValue({ role: 'member' });
    const member = renderHook(() => useEventMembership('e2'));
    await waitFor(() => expect(member.result.current).toBe(true));

    orgs.getMyMembership.mockResolvedValue(null);
    const not = renderHook(() => useEventMembership('e3'));
    await waitFor(() => expect(not.result.current).toBe(false));
  });
});

describe('(B) group-chat taps the server refuses are not retried forever', () => {
  const LINK = 'https://chat.whatsapp.com/R6cTest';
  beforeEach(() => { localStorage.clear(); rpc.mockReset(); });

  it('the service reports 42501 as refused, other errors as retryable', async () => {
    rpc.mockResolvedValueOnce({ error: { code: '42501', message: 'not registered for this event' } });
    expect(await markGroupChatOpenedOnServer('e1')).toEqual({ ok: false, refused: true });
    rpc.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'function not found' } });
    expect(await markGroupChatOpenedOnServer('e1')).toEqual({ ok: false, refused: false });
    rpc.mockResolvedValueOnce({ error: null });
    expect(await markGroupChatOpenedOnServer('e1')).toEqual({ ok: true, refused: false });
  });

  it('refused: the pending marker is cleared (no retry on the next mount); the tap still counts locally', async () => {
    rpc.mockImplementation(async (fn: string) => (fn === 'group_chat_opened'
      ? { data: null, error: { code: 'PGRST202', message: 'missing' } }
      : { error: { code: '42501', message: 'not registered for this event' } }));
    const { result } = renderHook(() => useGroupChatOpened('e1', LINK, 'u1'));
    await waitFor(() => expect(result.current.opened).toBe(false));
    await act(async () => { result.current.markOpened('feedback_thankyou'); });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('mark_group_chat_opened', { p_event_id: 'e1' }));
    await waitFor(() => expect(readPendingWrite('u1', LINK)).toBeNull());
    expect(result.current.opened).toBe(true);
  });

  it('any other failure: the marker stays, so the next mount retries', async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { code: 'PGRST202', message: 'missing' } }));
    const { result } = renderHook(() => useGroupChatOpened('e1', LINK, 'u1'));
    await waitFor(() => expect(result.current.opened).toBe(false));
    await act(async () => { result.current.markOpened('feedback_thankyou'); });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('mark_group_chat_opened', { p_event_id: 'e1' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(readPendingWrite('u1', LINK)).toBe('e1');
  });
});
