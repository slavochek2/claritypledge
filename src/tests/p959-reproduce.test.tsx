/**
 * @file p959-reproduce.test.tsx
 * @description Canary for P959 — receiver comprehension-rating card gets stuck
 * disabled when the rating-submit RPC hangs or rejects.
 *
 * The card's disabled gate is `isSubmitting || currentStory.rating !== null`
 * (letter-flow-content.tsx:797). submitStoryRating (useLetterReadingState.ts,
 * token branch) sets isSubmitting=true, awaits submitRatingByToken THEN
 * revealPredictionByToken, and only advances phase on full success;
 * setIsSubmitting(false) lives in `finally`.
 *
 * Two failure modes, both leave the receiver stranded with no feedback:
 *  - REJECT: no catch anywhere (handleSubmitRating has none either) → the
 *    rejection bubbles unhandled and no error toast is shown.
 *  - HANG: a promise that never settles never reaches `finally` →
 *    isSubmitting stays true forever → card permanently disabled.
 *
 * These assert the FIXED behavior, so they FAIL before the fix:
 *  - reject → error toast shown AND submitStoryRating does not reject
 *  - hang   → isSubmitting resets within a bounded time (timeout/abort)
 *
 * Preview mode cannot reproduce (synchronous previewMode branch, no await).
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/app/utils/letter-snapshot-mapper', () => ({
  // 0 visible points → initial phase is 'story-rate' (the rating step)
  snapshotToStoryWithPoints: vi.fn(() => ({
    id: 'story-1',
    title: 'Test Story',
    content: 'Story text',
    authorName: 'Sender',
    points: [],
  })),
}));

vi.mock('@/app/data/letters-service', () => ({
  submitRating: vi.fn(),
  revealPrediction: vi.fn(),
  submitPointResponse: vi.fn(),
  updateDeliveryStatus: vi.fn().mockResolvedValue(undefined),
  updateDeliveryStatusByToken: vi.fn().mockResolvedValue(undefined),
  submitPointResponseByToken: vi.fn(),
  submitRatingByToken: vi.fn(),
  revealPredictionByToken: vi.fn(),
}));

import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import type { LetterStorySnapshot } from '@/app/types';
import { toast } from 'sonner';
import {
  submitRatingByToken,
  revealPredictionByToken,
  submitRating,
} from '@/app/data/letters-service';

const mockToastError = vi.mocked(toast.error);
const mockSubmitRatingByToken = vi.mocked(submitRatingByToken);
const mockRevealPredictionByToken = vi.mocked(revealPredictionByToken);
const mockSubmitRating = vi.mocked(submitRating);

function makeSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: {},
    visibility: 'published',
  };
}

// Real receiver via token (the branch that awaits the RPCs).
function renderReceiverHook() {
  return renderHook(() =>
    useLetterReadingState({
      mode: 'remote',
      deliveryId: 'delivery-1',
      senderId: 'sender-1',
      snapshots: [makeSnapshot()],
      token: 'token-abc',
    })
  );
}

// Real receiver via deliveryId (no token) — the sibling branch with the same shape.
function renderDeliveryHook() {
  return renderHook(() =>
    useLetterReadingState({
      mode: 'remote',
      deliveryId: 'delivery-1',
      senderId: 'sender-1',
      snapshots: [makeSnapshot()],
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('P959: rating submit failure must not strand the receiver', () => {
  it('starts on the story-rate phase, not submitting', () => {
    const { result } = renderReceiverHook();
    expect(result.current.currentPhase).toBe('story-rate');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('REJECT: shows an error toast and does not reject when the rating RPC fails', async () => {
    mockSubmitRatingByToken.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderReceiverHook();

    await act(async () => {
      // Must not throw/reject to the caller — handleSubmitRating has no catch today.
      await expect(result.current.submitStoryRating(6)).resolves.toBeUndefined();
    });

    // isSubmitting must reset so the card re-enables for a retry.
    expect(result.current.isSubmitting).toBe(false);
    // User must get feedback rather than a silent failure.
    expect(mockToastError).toHaveBeenCalled();
    // Phase must NOT advance on failure — the receiver stays on the rating step.
    expect(result.current.currentPhase).toBe('story-rate');
  });

  it('REJECT (deliveryId branch): same recovery when the rating RPC fails', async () => {
    mockSubmitRating.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderDeliveryHook();

    await act(async () => {
      await expect(result.current.submitStoryRating(6)).resolves.toBeUndefined();
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.currentPhase).toBe('story-rate');
  });

  it('HANG: isSubmitting resets once the submit timeout fires when the RPC never settles', async () => {
    vi.useFakeTimers();
    // Submit resolves, but the reveal-prediction call hangs forever.
    mockSubmitRatingByToken.mockResolvedValueOnce(undefined as never);
    mockRevealPredictionByToken.mockImplementationOnce(
      () => new Promise(() => {}) // never settles
    );
    const { result } = renderReceiverHook();

    await act(async () => {
      void result.current.submitStoryRating(6);
      // Advance past the submit timeout so the hung RPC is abandoned.
      // Pre-fix: no timeout exists → isSubmitting stays true forever.
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.currentPhase).toBe('story-rate');
  }, 30000);
});
