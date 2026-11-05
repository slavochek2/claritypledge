/**
 * P1529 D24: a registration through the sign-up return must send the confirmation email. The email is requested by the event's
 * id alone (the edge function loads the event itself), so the registration needs no title or date from the caller.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ rpc: vi.fn(), emails: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a) } }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: (...a: unknown[]) => h.emails(...a) }));
vi.mock('@/lib/session-guard', () => ({
  guardSeatWrite: async () => true,
  isAnonymousRlsDenial: () => false,
  SessionMismatchError: class extends Error {},
}));
vi.mock('@/app/data/db-error-logger', () => ({ logDbError: vi.fn() }));

import { registerForEvent } from '@/app/data/event-registration';

const ANSWERS = { participation: 'canvas_before', observerPrep: null, phone: 'usbc', hope: '', recordingAccepted: true } as const;
beforeEach(() => { h.rpc.mockReset(); h.emails.mockReset(); });

describe('registerForEvent emails', () => {
  it.each([
    ['only an id and a slug (the page)', { id: 'e1', slug: 'mm' }],
    ['the whole event (the sign-up return)', { id: 'e1', slug: 'mm', title: 'Mastermind', datetime: '2026-11-14T11:30:00+00:00' }],
  ])('sends the confirmation for a new registration given %s', async (_n, event) => {
    h.rpc.mockResolvedValue({ data: 'ok', error: null, status: 200 });
    expect(await registerForEvent(event, 'u1', ANSWERS)).toBe('ok');
    expect(h.emails).toHaveBeenCalledWith('rsvp', 'e1', 'u1');
  });

  it('sends nothing for an update of answers, a full event or a failure', async () => {
    for (const data of ['already', 'full', 'cancelled']) {
      h.rpc.mockResolvedValueOnce({ data, error: null, status: 200 });
      await registerForEvent({ id: 'e1', slug: 'mm' }, 'u1', ANSWERS);
    }
    h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' }, status: 500 });
    await registerForEvent({ id: 'e1', slug: 'mm' }, 'u1', ANSWERS);
    expect(h.emails).not.toHaveBeenCalled();
  });
});
