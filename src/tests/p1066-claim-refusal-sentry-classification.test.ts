/**
 * @file p1066-claim-refusal-sentry-classification.test.ts
 * @description Canary for P1066: claimLetterDelivery must classify a refusal
 * before reporting it.
 *
 * A refused claim leaves receiver_profile_id unset, so the reader's later writes
 * fail via RLS with nothing linking back to the claim — that is worth a Sentry
 * event. But two refusals are routine, and reporting those buries the signal:
 *
 *   cannot_claim_own_letter — the sender opening their own letter.
 *   no_delivery_for_token   — the token is already spent. create-and-open-letter
 *     expires the invitation in the same UPDATE that sets receiver_profile_id
 *     (P683 replay defence) and the RPC filters on invitation_expires_at > now(),
 *     so on the ordinary first-time 1-to-1 open every later claim lands here.
 *     This is the PRIMARY path, not an edge case — an earlier revision of the
 *     P1066 fix reported it and would have emitted a warning on essentially
 *     every letter open.
 *
 * Anything else — including a reason string the code does not recognise — must
 * still be reported. The filter is scoped, not blanket (same shape as P913).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/react', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

const mockRpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

// logDbError owns the `error` branch and has its own canary (P913). Stub it so
// this file asserts only the refusal-classification branch.
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
}));

import * as Sentry from '@sentry/react';
import { claimLetterDelivery } from '@/app/data/letters-service';

describe('P1066: claimLetterDelivery refusal classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['cannot_claim_own_letter', { error: 'cannot_claim_own_letter' }],
    // The RPC returns SQL NULL when the token matches no live delivery — the
    // spent-token case, which is the common one.
    ['no_delivery_for_token (RPC returned null)', null],
  ])('stays silent for the expected refusal: %s', async (_label, data) => {
    mockRpc.mockResolvedValue({ data, error: null });

    const claimed = await claimLetterDelivery('some-token');

    expect(claimed).toBe(false);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('reports a genuine conflict (delivery_claimed_by_other)', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'delivery_claimed_by_other' }, error: null });

    const claimed = await claimLetterDelivery('some-token');

    expect(claimed).toBe(false);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'claimLetterDelivery refused',
      expect.objectContaining({
        level: 'warning',
        extra: expect.objectContaining({ reason: 'delivery_claimed_by_other' }),
      }),
    );
  });

  it('reports an unrecognised reason rather than defaulting to silence', async () => {
    mockRpc.mockResolvedValue({ data: { error: 'some_future_reason' }, error: null });

    await claimLetterDelivery('some-token');

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'claimLetterDelivery refused',
      expect.objectContaining({
        extra: expect.objectContaining({ reason: 'some_future_reason' }),
      }),
    );
  });

  it('reports nothing and returns true on a successful claim', async () => {
    mockRpc.mockResolvedValue({
      data: { delivery_id: 'd1', letter_id: 'l1', claimed: true },
      error: null,
    });

    const claimed = await claimLetterDelivery('some-token');

    expect(claimed).toBe(true);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});
