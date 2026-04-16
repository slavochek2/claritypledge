/**
 * @file p729-reveal-prediction-scalar.test.ts
 * @description Canary tests for P729: revealPrediction returns {prediction:N} for scalar RPC returns.
 *
 * reveal_prediction RPC returns RETURNS SMALLINT (plain scalar).
 * Before the fix: `data as { prediction: number }` → data.prediction = undefined.
 * After the fix: `typeof data === 'number' ? { prediction: data } : null` → correct shape.
 *
 * Edge case: prediction=0 (valid low-confidence value) must not be treated as null/falsy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
}));

import { revealPrediction } from '@/app/data/letters-service';
import { supabase } from '@/lib/supabase';

const mockRpc = vi.mocked(supabase.rpc);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P729: revealPrediction — scalar RPC return', () => {
  it('returns { prediction: 4 } when RPC returns scalar 4', async () => {
    mockRpc.mockResolvedValueOnce({ data: 4, error: null } as never);

    const result = await revealPrediction('delivery-id', 'story-id');

    expect(result).toEqual({ prediction: 4 });
  });

  it('returns { prediction: 7 } when RPC returns scalar 7', async () => {
    mockRpc.mockResolvedValueOnce({ data: 7, error: null } as never);

    const result = await revealPrediction('delivery-id', 'story-id');

    expect(result).toEqual({ prediction: 7 });
  });

  it('returns { prediction: 0 } when RPC returns 0 (valid low-confidence prediction)', async () => {
    mockRpc.mockResolvedValueOnce({ data: 0, error: null } as never);

    const result = await revealPrediction('delivery-id', 'story-id');

    expect(result).toEqual({ prediction: 0 });
  });

  it('returns null when RPC returns null', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null } as never);

    const result = await revealPrediction('delivery-id', 'story-id');

    expect(result).toBeNull();
  });

  it('returns null on RPC error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc error' } } as never);

    const result = await revealPrediction('delivery-id', 'story-id');

    expect(result).toBeNull();
  });
});
