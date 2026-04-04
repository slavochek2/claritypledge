/**
 * @file agreement-emails.test.ts
 * Unit tests for src/lib/agreement-emails.ts
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

import { invokeAgreementEmails } from '../lib/agreement-emails';

describe('invokeAgreementEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls edge function with correct action and agreementId', async () => {
    mockInvoke.mockResolvedValue({ error: null });

    await invokeAgreementEmails('invitation', 'agreement-123');

    expect(mockInvoke).toHaveBeenCalledWith('send-agreement-emails', {
      body: { action: 'invitation', agreementId: 'agreement-123' },
    });
  });

  it('handles all action types', async () => {
    mockInvoke.mockResolvedValue({ error: null });

    for (const action of ['invitation', 'accepted', 'declined', 'terminated', 'resend'] as const) {
      await invokeAgreementEmails(action, 'id-1');
      expect(mockInvoke).toHaveBeenCalledWith('send-agreement-emails', {
        body: { action, agreementId: 'id-1' },
      });
    }
  });

  it('logs error but does not throw on edge function error', async () => {
    mockInvoke.mockResolvedValue({ error: { message: 'timeout' } });

    await expect(invokeAgreementEmails('invitation', 'id-1')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      '[agreement-emails] Edge function error:',
      expect.objectContaining({ message: 'timeout' })
    );
  });

  it('logs error but does not throw on network failure', async () => {
    mockInvoke.mockRejectedValue(new Error('network error'));

    await expect(invokeAgreementEmails('accepted', 'id-2')).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      '[agreement-emails] Invoke failed:',
      expect.any(Error)
    );
  });
});
