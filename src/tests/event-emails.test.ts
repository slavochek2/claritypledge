/**
 * @file event-emails.test.ts
 * Unit tests for src/lib/event-emails.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

import { invokeEventEmails } from '../lib/event-emails';

describe('invokeEventEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls edge function with action and eventId', async () => {
    mockInvoke.mockResolvedValue({ error: null });

    await invokeEventEmails('rsvp', 'event-456');

    expect(mockInvoke).toHaveBeenCalledWith('send-event-emails', {
      body: { action: 'rsvp', eventId: 'event-456', userId: undefined },
    });
  });

  it('passes optional userId', async () => {
    mockInvoke.mockResolvedValue({ error: null });

    await invokeEventEmails('cancel', 'event-789', 'user-1');

    expect(mockInvoke).toHaveBeenCalledWith('send-event-emails', {
      body: { action: 'cancel', eventId: 'event-789', userId: 'user-1' },
    });
  });

  it('handles all action types', async () => {
    mockInvoke.mockResolvedValue({ error: null });

    for (const action of ['rsvp', 'cancel', 'uncancel', 'update'] as const) {
      await invokeEventEmails(action, 'evt');
    }
    expect(mockInvoke).toHaveBeenCalledTimes(4);
  });

  it('logs error but does not throw on edge function error', async () => {
    mockInvoke.mockResolvedValue({ error: { message: 'fail' } });

    await expect(invokeEventEmails('rsvp', 'e1')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      '[event-emails] Edge function error:',
      expect.objectContaining({ message: 'fail' })
    );
  });

  it('logs error but does not throw on network failure', async () => {
    mockInvoke.mockRejectedValue(new Error('offline'));

    await expect(invokeEventEmails('update', 'e2')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      '[event-emails] Invoke failed:',
      expect.any(Error)
    );
  });
});
