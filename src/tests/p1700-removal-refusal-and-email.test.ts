/** P1700: only the two removal messages become 'closed' (never a bare 42501); removeEventAttendee emails fire-and-forget. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
const invokeEventEmails = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), functions: { invoke: vi.fn() } } }));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: (...a: unknown[]) => invokeEventEmails(...a) }));
vi.mock('@/lib/session-guard', async (orig) => ({ ...(await orig<object>()), guardSeatWrite: vi.fn().mockResolvedValue(true) }));

import { registerForEvent } from '@/app/data/event-registration';
import { joinWaitlist, getMyEventRemoval } from '@/app/data/event-waitlist';
import { canvasService } from '@/app/data/canvas-service';

const answers = { participation: 'participant', observerPrep: null, phone: null, hope: '', recordingAccepted: true } as never;
const ev = { id: 'e1', slug: 's' };

beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('refusal mapping', () => {
  it('registration trigger message -> closed', async () => {
    rpc.mockResolvedValue({ data: null, status: 403, error: { code: '42501', message: 'registration is closed for you on this event' } });
    expect(await registerForEvent(ev, 'u1', answers)).toBe('closed');
  });
  it('waiting-list join message -> closed', async () => {
    rpc.mockResolvedValue({ data: null, status: 403, error: { code: '42501', message: 'not authorized for this event' } });
    expect(await joinWaitlist('s', 'u1', answers)).toBe('closed');
  });
  it('another 42501 stays failed', async () => {
    rpc.mockResolvedValue({ data: null, status: 403, error: { code: '42501', message: 'permission denied for table x' } });
    expect(await registerForEvent(ev, 'u1', answers)).toBe('failed');
    expect(await joinWaitlist('s', 'u1', answers)).toBe('failed');
  });
});

describe('getMyEventRemoval', () => {
  it('returns the rpc boolean', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await getMyEventRemoval('e1')).toBe(true);
    expect(rpc).toHaveBeenCalledWith('my_event_removed', { p_event: 'e1' });
  });
  it('an error reads false and is logged', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await getMyEventRemoval('e1')).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });
});

describe('removeEventAttendee', () => {
  it('invokes the removed email after success and survives a failing email', async () => {
    rpc.mockResolvedValue({ error: null });
    invokeEventEmails.mockRejectedValue(new Error('mail down'));
    await expect(canvasService.removeEventAttendee('e1', 'u1')).resolves.toBeUndefined();
    expect(invokeEventEmails).toHaveBeenCalledWith('removed', 'e1', 'u1');
  });
  it('sends no email when the removal fails', async () => {
    rpc.mockResolvedValue({ error: { message: 'no', code: 'x' } });
    await expect(canvasService.removeEventAttendee('e1', 'u1')).rejects.toBeDefined();
    expect(invokeEventEmails).not.toHaveBeenCalled();
  });
});
