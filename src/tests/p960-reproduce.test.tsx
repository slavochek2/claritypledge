/**
 * @file p960-reproduce.test.tsx
 * @description Canary for P960 — the point-engage controls get stuck disabled
 * when the point-response RPC hangs.
 *
 * Same class as P959, one function over: `submitPointPosition`
 * (useLetterReadingState.ts) awaits submitPointResponseByToken /
 * submitPointResponse with no timeout. A promise that never settles never
 * reaches `finally { setIsSubmitting(false) }`, so isSubmitting stays true
 * forever and the point-engage card is permanently disabled with no recovery.
 *
 * Two behaviours are asserted, both of the FIXED state:
 *  - HANG    → isSubmitting resets once the submit timeout fires, an error
 *              toast is shown, and the phase stays on point-engage.
 *  - REJECT  → a non-token RPC rejection surfaces a toast instead of an
 *              unhandled rejection. handleSubmitPosition
 *              (letter-flow-content.tsx:503) awaits with no catch, so the
 *              pre-fix `throw err` escaped to nobody.
 *
 * The existing token-expiry branch must be untouched: an "Invalid or expired
 * token" error still sets tokenExpired (pinned by p714-letter-link-lifecycle).
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
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
import { submitPointResponseByToken, submitPointResponse } from '@/app/data/letters-service';

const mockToastError = vi.mocked(toast.error);
const mockSubmitByToken = vi.mocked(submitPointResponseByToken);
const mockSubmitAuthed = vi.mocked(submitPointResponse);

// Two visible points with the default lead count (absent -> 1) put the reader on
// 'point-engage' for point-0 as the FIRST phase. A single visible point takes the
// D36 legacy walk (story first), which never reaches submitPointPosition from the
// initial state — see the phase table at the top of useLetterReadingState.ts.
// The real snapshot mapper is used here: the phase machine reads point_config
// directly, so a mocked mapper cannot move the phase.
function makeSnapshot(): LetterStorySnapshot {
  const points = [0, 1].map((i) => ({
    id: `point-${i}`,
    text: `Point ${i}`,
    authorPosition: 'agree',
    visibility: 'public',
  }));
  return {
    letter_id: 'letter-1',
    story_id: 'story-1',
    version_id: 'version-1',
    position: 0,
    point_config: { storyText: 'Story text', points, order: points.map((p) => p.id) },
    visibility: 'public',
  };
}

/** Real receiver via token — the branch that awaits submitPointResponseByToken. */
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

/** Real receiver via deliveryId — the sibling branch, same shape. */
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
  sessionStorage.clear();
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('P960: a hung point-response RPC must not strand the receiver', () => {
  it('starts on the point-engage phase, not submitting', () => {
    const { result } = renderReceiverHook();
    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('HANG (token branch): isSubmitting resets once the submit timeout fires', async () => {
    vi.useFakeTimers();
    mockSubmitByToken.mockImplementationOnce(() => new Promise(() => {})); // never settles
    const { result } = renderReceiverHook();

    await act(async () => {
      void result.current.submitPointPosition('point-0', 'agree');
      // Pre-fix: no timeout exists, so isSubmitting stays true forever.
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
    // The position must NOT be recorded — the RPC never landed.
    expect(result.current.currentPhase).toBe('point-engage');
  }, 30000);

  it('HANG (deliveryId branch): same recovery when the authed RPC never settles', async () => {
    vi.useFakeTimers();
    mockSubmitAuthed.mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderDeliveryHook();

    await act(async () => {
      void result.current.submitPointPosition('point-0', 'agree');
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.currentPhase).toBe('point-engage');
  }, 30000);

  it('REJECT: surfaces a toast instead of rejecting to a caller that has no catch', async () => {
    mockSubmitByToken.mockRejectedValueOnce(new Error('network down'));
    const { result } = renderReceiverHook();

    await act(async () => {
      await expect(result.current.submitPointPosition('point-0', 'agree')).resolves.toBeUndefined();
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.currentPhase).toBe('point-engage');
  });

  it('token expiry still routes to tokenExpired and shows no error toast', async () => {
    mockSubmitByToken.mockRejectedValueOnce(new Error('Invalid or expired token'));
    const { result } = renderReceiverHook();

    await act(async () => {
      await result.current.submitPointPosition('point-0', 'agree');
    });

    expect(result.current.tokenExpired).toBe(true);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('LATE COMMIT: a retry after the timeout still advances, even though the first insert landed', async () => {
    // Codex review of this fix: withTimeout rejects locally but does not cancel
    // the request, so the server can commit the first answer after the client
    // gave up. On the authenticated path that insert is guarded by
    // letter_point_responses_unique, so the retry used to dead-end on 23505 and
    // the reader could not proceed without a reload. submitPointResponse now
    // treats 23505 as success (letters-service.ts), matching the token RPC's
    // ON CONFLICT DO NOTHING. Here the retry resolves, standing for that.
    vi.useFakeTimers();
    mockSubmitAuthed.mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderDeliveryHook();

    await act(async () => {
      void result.current.submitPointPosition('point-0', 'agree');
      await vi.advanceTimersByTimeAsync(20000);
    });
    expect(result.current.currentPhase).toBe('point-engage');
    expect(result.current.isSubmitting).toBe(false);

    mockSubmitAuthed.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.submitPointPosition('point-0', 'agree');
    });

    expect(result.current.currentPhase).toBe('point-revealed');
  }, 30000);

  it('a successful submit still advances to point-revealed', async () => {
    mockSubmitByToken.mockResolvedValueOnce(undefined as never);
    const { result } = renderReceiverHook();

    await act(async () => {
      await result.current.submitPointPosition('point-0', 'agree');
    });

    expect(result.current.isSubmitting).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(result.current.currentPhase).toBe('point-revealed');
  });
});
