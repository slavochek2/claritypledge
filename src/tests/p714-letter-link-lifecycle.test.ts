/**
 * @file p714-letter-link-lifecycle.test.ts
 * @description P714/P716: Regression tests for letter reading hook routing.
 *
 * History: P714 stripped the invitation token from authenticated users
 * (effectiveToken = isAuthenticated ? undefined : token) to prevent calling
 * submitPointResponseByToken with what it assumed was a "consumed" token.
 * That assumption was wrong: invitation_token (a stable UUID in letter_deliveries)
 * is not the one-time OTP hash consumed by create-and-open-letter.
 *
 * P683 already removed the expiry check from all engagement RPCs, so
 * submitPointResponseByToken is safe to call for authenticated users.
 * P716 reverts the token-strip and adds point_positions dual-write to the RPC
 * so live display works identically to the authed path.
 *
 * These tests verify the hook's internal routing logic:
 *
 *   Test A (failure mode): when the hook receives an invalid token (e.g., letter
 *     unsealed or delivery deleted), submitPointResponseByToken throws
 *     "Invalid or expired token" and tokenExpired=true is set. This is the fallback
 *     surface that lets the UI show a recovery message.
 *
 *   Test B (no-token path): when the hook receives no token (anonymous link access,
 *     no delivery token), it routes to submitPointResponse (authed RLS path).
 *     tokenExpired stays false throughout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { LetterStorySnapshot } from '@/app/types';

const DELIVERY_ID = 'delivery-uuid-714';
const SENDER_ID = 'sender-uuid-714';
const STORY_ID = 'story-uuid-714';
const POINT_ID = 'point-uuid-714';
const CONSUMED_TOKEN = 'consumed-token-xyz';

// ── Service mocks ──────────────────────────────────────────────────────────────

vi.mock('@/app/data/letters-service', () => ({
  submitRating: vi.fn().mockResolvedValue({ prediction: null }),
  revealPrediction: vi.fn().mockResolvedValue(null),
  submitPointResponse: vi.fn().mockResolvedValue(undefined),
  updateDeliveryStatus: vi.fn().mockResolvedValue(undefined),
  updateDeliveryStatusByToken: vi.fn().mockResolvedValue(undefined),
  submitPointResponseByToken: vi
    .fn()
    .mockRejectedValue(new Error('Invalid or expired token')),
  submitRatingByToken: vi.fn().mockResolvedValue(undefined),
  revealPredictionByToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { useLetterReadingState } from '@/app/hooks/useLetterReadingState';
import {
  submitPointResponse,
  submitPointResponseByToken,
} from '@/app/data/letters-service';

const mockSubmitAuthed = vi.mocked(submitPointResponse);
const mockSubmitByToken = vi.mocked(submitPointResponseByToken);

// ── Snapshot ──────────────────────────────────────────────────────────────────

function makeSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-714',
    story_id: STORY_ID,
    version_id: 'version-714',
    position: 0,
    point_config: {
      storyText: 'Test story text',
      storyTitle: 'Test story',
      points: [
        {
          id: POINT_ID,
          text: 'Test point',
          author_position: 'agree',
        },
      ],
    },
    visibility: 'published',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P714: letter link lifecycle — token vs authed RPC path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset sessionStorage between tests to avoid state bleed
    sessionStorage.clear();
  });

  it('Test A (failure mode): hook with invalid token triggers tokenExpired on submit', async () => {
    // Documents the failure surface: if submitPointResponseByToken throws
    // "Invalid or expired token" (e.g., letter unsealed between page load and submit),
    // the hook sets tokenExpired=true so the UI can show a recovery message.
    // In normal operation (P683 removed expiry check, token UUID is stable), this
    // code path is not reached.
    const snapshots = [makeSnapshot()];
    const { result } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, SENDER_ID, snapshots, CONSUMED_TOKEN)
    );

    await act(async () => {
      await result.current.submitPointPosition(POINT_ID, 'agree').catch(() => {});
    });

    expect(mockSubmitByToken).toHaveBeenCalledWith(CONSUMED_TOKEN, POINT_ID, 'agree');
    expect(result.current.tokenExpired).toBe(true);
  });

  it('Test B (no-token path): hook with no token uses authed RLS path — tokenExpired stays false', async () => {
    // Anonymous link access (no delivery token) — hook routes to submitPointResponse.
    // tokenExpired must stay false so the reader can complete the letter.
    const snapshots = [makeSnapshot()];
    const { result } = renderHook(() =>
      useLetterReadingState(DELIVERY_ID, SENDER_ID, snapshots, undefined)
    );

    await act(async () => {
      await result.current.submitPointPosition(POINT_ID, 'agree');
    });

    expect(mockSubmitByToken).not.toHaveBeenCalled();
    expect(mockSubmitAuthed).toHaveBeenCalledWith(DELIVERY_ID, POINT_ID, 'agree');
    expect(result.current.tokenExpired).toBe(false);
  });
});
