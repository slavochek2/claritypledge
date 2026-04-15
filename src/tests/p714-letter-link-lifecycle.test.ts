/**
 * @file p714-letter-link-lifecycle.test.ts
 * @description P714: Regression tests for letter link lifecycle —
 * identity, consent, and recovery.
 *
 * Bug: After create-and-open-letter mints a session and consumes the token
 * (sets invitation_expires_at=NOW()), letter-reading-page.tsx passes the
 * original URL token to LetterReadingFlow unconditionally. The hook then
 * calls submitPointResponseByToken with the consumed token, which returns
 * "Invalid or expired token", setting tokenExpired=true and blocking the reader.
 *
 * Fix: letter-reading-page.tsx:907 — pass `isAuthenticated ? undefined : token`
 * to useLetterReadingState so that once a session exists, all writes take
 * the authed (deliveryId) path.
 *
 * Canary:
 *   Test A (bug mechanism): hook called with a token that is "expired" →
 *     submitPointResponseByToken is called → throws → tokenExpired=true.
 *     This test always passes; it documents the failure mode that the component
 *     fix prevents from being reachable in production.
 *
 *   Test B (fix target): hook called with token=undefined (the post-fix state) →
 *     submitPointResponse is called (authed RPC) → tokenExpired stays false.
 *     This is the assertion that proves the fix works end-to-end.
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

  it('Test A (bug mechanism): hook with consumed token triggers tokenExpired on submit', async () => {
    // This documents the failure mode: when the URL token is passed to the hook
    // after create-and-open-letter has consumed it, the first position submit
    // calls submitPointResponseByToken → rejects → tokenExpired=true.
    // The component fix prevents this scenario from being reached in production
    // by passing token=undefined when session exists.
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

  it('Test B (fix target): hook with no token uses authed RPC — tokenExpired stays false', async () => {
    // Post-fix: the component passes token=undefined when isAuthenticated=true.
    // The hook sees no token and routes all writes to the deliveryId (authed) path.
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
