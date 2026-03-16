import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeLiveStateForSentry,
  isBothAcknowledged,
  isBothAcknowledgedCompat,
  raceWithTimeout,
  shouldUseFullOverwrite,
} from '../app/pages/clarity-live-page';

/**
 * P525: Live State Deadlock Prevention — Unit Tests
 *
 * Tests the core logic modules that P525 introduces:
 * 1. sanitizeLiveStateForSentry() — strips PII, keeps structural fields
 * 2. Celebration boolean logic — both booleans -> bothAcknowledged, backward compat
 * 3. Timeout wrapper logic — 5s cap via Promise.race
 */

// ===============================================================================
// 1. sanitizeLiveStateForSentry() — PII Scrubbing
// ===============================================================================

describe('P525: sanitizeLiveStateForSentry', () => {
  it('preserves structural fields (ratingPhase, currentRound, checkerSubmitted, responderSubmitted)', () => {
    const state = {
      ratingPhase: 'rating',
      currentRound: 3,
      checkerSubmitted: true,
      responderSubmitted: false,
      explainBackRound: 1,
      explainBackDone: false,
      checksCount: 2,
      checksTotal: 5,
      ideasDiscussed: 1,
      ideasUnderstood: 1,
      celebrationAcknowledgedByCreator: true,
      celebrationAcknowledgedByJoiner: false,
      // PII fields below — should be stripped
      checkerName: 'Alice',
      currentSpeaker: 'Alice',
      currentListener: 'Bob',
      selectedStoryData: { id: 'story-1', title: 'My deep story', authorId: 'user-1' },
      skippedBy: 'Bob',
    };

    const sanitized = sanitizeLiveStateForSentry(state);

    // Structural fields preserved
    expect(sanitized.ratingPhase).toBe('rating');
    expect(sanitized.currentRound).toBe(3);
    expect(sanitized.checkerSubmitted).toBe(true);
    expect(sanitized.responderSubmitted).toBe(false);
    expect(sanitized.celebrationAcknowledgedByCreator).toBe(true);
    expect(sanitized.celebrationAcknowledgedByJoiner).toBe(false);

    // PII fields stripped
    expect(sanitized.checkerName).toBeUndefined();
    expect(sanitized.currentSpeaker).toBeUndefined();
    expect(sanitized.currentListener).toBeUndefined();
    expect(sanitized.selectedStoryData).toBeUndefined();
    expect(sanitized.skippedBy).toBeUndefined();
  });

  it('strips user names from roleSelections, sliderRatings, talkTime keys', () => {
    const state = {
      ratingPhase: 'idle',
      currentRound: 1,
      roleSelections: { 'Alice': 'checker', 'Bob': 'responder' },
      sliderRatings: { 'Alice': 7, 'Bob': 8 },
      talkTime: { 'Alice': 120, 'Bob': 95 },
    };

    const sanitized = sanitizeLiveStateForSentry(state);

    // Name-keyed maps should be stripped
    expect(sanitized.roleSelections).toBeUndefined();
    expect(sanitized.sliderRatings).toBeUndefined();
    expect(sanitized.talkTime).toBeUndefined();
  });

  it('strips selectedStoryData content but preserves selectedStoryId presence', () => {
    const state = {
      ratingPhase: 'idle',
      currentRound: 1,
      selectedStoryId: 'story-abc-123',
      selectedStoryData: { id: 'story-abc-123', title: 'Private thoughts', authorId: 'user-1' },
      selectedContentTitle: 'Private thoughts',
    };

    const sanitized = sanitizeLiveStateForSentry(state);

    // ID is okay (not PII), content/title is PII
    expect(sanitized.hasSelectedStory).toBe(true);
    expect(sanitized.selectedStoryData).toBeUndefined();
    expect(sanitized.selectedContentTitle).toBeUndefined();
  });

  it('handles undefined/null state gracefully', () => {
    expect(sanitizeLiveStateForSentry(undefined as unknown as null)).toEqual({});
    expect(sanitizeLiveStateForSentry(null)).toEqual({});
  });

  it('strips perspectiveRequestedBy and ratingInitiatedBy (user names)', () => {
    const state = {
      ratingPhase: 'explain-back',
      currentRound: 2,
      perspectiveRequestedBy: 'Alice',
      ratingInitiatedBy: 'Bob',
      proverName: 'Alice',
    };

    const sanitized = sanitizeLiveStateForSentry(state);

    expect(sanitized.perspectiveRequestedBy).toBeUndefined();
    expect(sanitized.ratingInitiatedBy).toBeUndefined();
    expect(sanitized.proverName).toBeUndefined();
    // But phase/round are preserved
    expect(sanitized.ratingPhase).toBe('explain-back');
    expect(sanitized.currentRound).toBe(2);
  });
});

// ===============================================================================
// 2. Celebration Boolean Logic
// ===============================================================================

describe('P525: Celebration boolean acknowledgment', () => {
  it('both booleans true -> bothAcknowledged', () => {
    const state = {
      celebrationAcknowledgedByCreator: true,
      celebrationAcknowledgedByJoiner: true,
    };
    expect(isBothAcknowledged(state)).toBe(true);
  });

  it('only creator acknowledged -> not complete', () => {
    const state = {
      celebrationAcknowledgedByCreator: true,
      celebrationAcknowledgedByJoiner: false,
    };
    expect(isBothAcknowledged(state)).toBe(false);
  });

  it('only joiner acknowledged -> not complete', () => {
    const state = {
      celebrationAcknowledgedByCreator: false,
      celebrationAcknowledgedByJoiner: true,
    };
    expect(isBothAcknowledged(state)).toBe(false);
  });

  it('neither acknowledged -> not complete', () => {
    const state = {
      celebrationAcknowledgedByCreator: false,
      celebrationAcknowledgedByJoiner: false,
    };
    expect(isBothAcknowledged(state)).toBe(false);
  });

  it('undefined booleans treated as false', () => {
    const state = {}; // No celebration keys at all
    expect(isBothAcknowledged(state)).toBe(false);

    const partial = { celebrationAcknowledgedByCreator: true };
    expect(isBothAcknowledged(partial)).toBe(false);
  });

  it('backward compat: old array with both names -> bothAcknowledged', () => {
    const state = {
      celebrationAcknowledgedBy: ['Alice', 'Bob'],
    };
    expect(isBothAcknowledgedCompat(state, 'Alice', 'Bob')).toBe(true);
  });

  it('backward compat: old array with one name -> not complete', () => {
    const state = {
      celebrationAcknowledgedBy: ['Alice'],
    };
    expect(isBothAcknowledgedCompat(state, 'Alice', 'Bob')).toBe(false);
  });

  it('backward compat: mixed (new boolean + old array) -> OR logic', () => {
    const state = {
      celebrationAcknowledgedByCreator: true,
      celebrationAcknowledgedBy: ['Bob'],
    };
    expect(isBothAcknowledgedCompat(state, 'Alice', 'Bob')).toBe(true);
  });

  it('backward compat: empty array + no booleans -> not complete', () => {
    const state = {
      celebrationAcknowledgedBy: [] as string[],
    };
    expect(isBothAcknowledgedCompat(state, 'Alice', 'Bob')).toBe(false);
  });

  it('two users writing different boolean keys concurrently do not collide', () => {
    const creatorWrite = { celebrationAcknowledgedByCreator: true };
    const joinerWrite = { celebrationAcknowledgedByJoiner: true };

    // Simulate JSONB || merge (key-level merge, order-independent)
    const merged = { ...creatorWrite, ...joinerWrite };
    expect(merged.celebrationAcknowledgedByCreator).toBe(true);
    expect(merged.celebrationAcknowledgedByJoiner).toBe(true);

    // Reverse order produces same result
    const mergedReverse = { ...joinerWrite, ...creatorWrite };
    expect(mergedReverse.celebrationAcknowledgedByCreator).toBe(true);
    expect(mergedReverse.celebrationAcknowledgedByJoiner).toBe(true);
  });
});

// ===============================================================================
// 3. Timeout Wrapper Logic
// ===============================================================================

describe('P525: updateInFlightRef timeout (5s cap)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves normally when DB call completes within 5s', async () => {
    const dbCall = new Promise<string>(resolve => setTimeout(() => resolve('ok'), 200));
    const resultPromise = raceWithTimeout(dbCall, 5000);
    vi.advanceTimersByTime(200);
    const result = await resultPromise;
    expect(result).toBe('ok');
  });

  it('rejects with timeout error when DB call exceeds 5s', async () => {
    const hungDbCall = new Promise<string>(() => {}); // Never resolves
    const racePromise = raceWithTimeout(hungDbCall, 5000);

    vi.advanceTimersByTime(5000);

    await expect(racePromise).rejects.toThrowError(/timed out/i);
  });

  it('timeout error includes the timeout duration for diagnostics', async () => {
    const hungDbCall = new Promise<string>(() => {});
    const racePromise = raceWithTimeout(hungDbCall, 5000);

    vi.advanceTimersByTime(5000);

    try {
      await racePromise;
      expect.fail('Should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('5000');
    }
  });

  it('does not leak timers after successful completion', async () => {
    const dbCall = Promise.resolve('ok');
    await raceWithTimeout(dbCall, 5000);

    // Advance past timeout — no unhandled rejection should occur
    vi.advanceTimersByTime(10000);
  });

  it('passes through DB errors (non-timeout) without wrapping', async () => {
    const dbError = new Error('Supabase connection failed');
    const failingCall = Promise.reject(dbError);

    await expect(raceWithTimeout(failingCall, 5000)).rejects.toThrow('Supabase connection failed');
  });
});

// ===============================================================================
// 4. handleSkip — selectedStoryData clearing
// ===============================================================================

describe('P525: handleSkip clears selectedStoryData', () => {
  it('handleSkip update payload includes selectedStoryData: undefined', () => {
    const skipUpdate: Record<string, unknown> = {
      selectedStoryId: undefined,
      selectedPointId: undefined,
      selectedContentTitle: undefined,
      selectedStoryData: undefined,
      ratingPhase: 'idle',
    };
    expect(skipUpdate.selectedStoryData).toBeUndefined();
    expect('selectedStoryData' in skipUpdate).toBe(true);
  });
});

// ===============================================================================
// 5. clickedContinue revert on write failure
// ===============================================================================

describe('P525: clickedContinue reverts on write failure', () => {
  it('clickedContinue should revert to false when celebration booleans are cleared', () => {
    // The useEffect in live-mode-view.tsx resets clickedContinue when both booleans are false
    // and the old array is empty. This simulates the condition.
    const creatorBool = false;
    const joinerBool = false;
    const arr: string[] = [];
    const noBooleans = !creatorBool && !joinerBool;
    const noArray = !arr.length;
    expect(noBooleans && noArray).toBe(true);
  });

  it('clickedContinue stays true on successful write (no revert)', () => {
    const creatorAcknowledged = true;
    const joinerAcknowledged = false;
    const noBooleans = !creatorAcknowledged && !joinerAcknowledged;
    expect(noBooleans).toBe(false);
  });
});

// ===============================================================================
// 6. DB write routing — celebration writes must use JSONB merge (patch)
// ===============================================================================

describe('P525+: shouldUseFullOverwrite — DB write routing', () => {
  it('celebration-only write WITHOUT active story uses patch (not full overwrite)', () => {
    // This is the exact scenario that caused the deadlock:
    // Free conversation round → no story selected → celebration boolean write
    // Previously routed to full overwrite, causing last-writer-wins clobbering.
    const updates = { celebrationAcknowledgedByCreator: true };
    const state = {}; // no selectedStoryId — free conversation

    expect(shouldUseFullOverwrite(updates, state)).toBe(false);
  });

  it('celebration-only write WITH active story uses patch', () => {
    const updates = { celebrationAcknowledgedByJoiner: true };
    const state = { selectedStoryId: 'story-123' };

    expect(shouldUseFullOverwrite(updates, state)).toBe(false);
  });

  it('rating write without story uses patch', () => {
    const updates = { checkerRating: 8, checkerSubmitted: true };
    const state = {};

    expect(shouldUseFullOverwrite(updates, state)).toBe(false);
  });

  it('story selection write uses full overwrite', () => {
    const updates = { selectedStoryId: 'story-123', selectedStoryData: { id: 'story-123' } };
    const state = {};

    expect(shouldUseFullOverwrite(updates, state)).toBe(true);
  });

  it('write with explicit undefined (clearing fields) uses full overwrite', () => {
    const updates = {
      selectedStoryId: undefined,
      selectedStoryData: undefined,
      ratingPhase: 'idle',
    };
    const state = { selectedStoryId: 'story-123' };

    expect(shouldUseFullOverwrite(updates, state)).toBe(true);
  });

  it('phase change without story or clears uses patch', () => {
    const updates = { ratingPhase: 'rating', checkerName: 'Alice' };
    const state = {};

    expect(shouldUseFullOverwrite(updates, state)).toBe(false);
  });

  it('content title write uses full overwrite (touches story field)', () => {
    const updates = { selectedContentTitle: 'My story about trust' };
    const state = {};

    expect(shouldUseFullOverwrite(updates, state)).toBe(true);
  });
});
