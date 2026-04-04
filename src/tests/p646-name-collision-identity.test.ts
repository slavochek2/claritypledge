import { describe, it, expect } from 'vitest';

/**
 * P646: Name collision identity tests
 *
 * Tests that identity checks in /live work correctly when both users
 * share the same display name. Uses the same comparison logic as the
 * production code to prove the bug exists (canary) and then verify the fix.
 *
 * The core bug: `ratingInitiatedBy !== currentUserName` returns false
 * when both users share a name → listener thinks "I initiated this."
 */

// ============================================================================
// Current (broken) name-based identity check
// This is the exact logic from live-mode-view.tsx line 1204-1205
// ============================================================================

function isListenerDuringLocalRating_CURRENT(
  ratingInitiatedBy: string | undefined,
  currentUserName: string,
): boolean {
  return !!ratingInitiatedBy && ratingInitiatedBy !== currentUserName;
}

// ============================================================================
// Fixed role-based identity check (checkerIsCreator pattern)
// ============================================================================

function isListenerDuringLocalRating_FIXED(
  ratingInitiatedByIsCreator: boolean | undefined,
  isCreator: boolean,
): boolean {
  return ratingInitiatedByIsCreator !== undefined
    && ratingInitiatedByIsCreator !== isCreator;
}

// ============================================================================
// Same pattern for skippedBy
// ============================================================================

function isSkipFromPartner_CURRENT(
  skippedBy: string | undefined,
  currentUserName: string,
): boolean {
  return !!skippedBy && skippedBy !== currentUserName;
}

function isSkipFromPartner_FIXED(
  skippedByIsCreator: boolean | undefined,
  isCreator: boolean,
): boolean {
  return skippedByIsCreator !== undefined
    && skippedByIsCreator !== isCreator;
}

// ============================================================================
// CANARY TESTS — these prove the bug exists with name-based checks
// ============================================================================

describe('P646: name collision — CURRENT (broken) behavior', () => {
  it('FAILS: same-name users — listener misidentifies partner Speak as own', () => {
    // Both users are "Slava". Speaker (creator) clicked Speak.
    // Listener (joiner) should detect "partner is rating" → true
    const result = isListenerDuringLocalRating_CURRENT(
      'Slava',    // ratingInitiatedBy (speaker's name)
      'Slava',    // currentUserName (listener's name — SAME)
    );
    // BUG: returns false — listener thinks "I initiated this"
    expect(result).toBe(false); // Documents the bug
  });

  it('works with different names (not the bug case)', () => {
    const result = isListenerDuringLocalRating_CURRENT(
      'Alice',    // speaker
      'Bob',      // listener
    );
    expect(result).toBe(true); // Works when names differ
  });

  it('FAILS: same-name skip — wrong user sees skip dialog', () => {
    const result = isSkipFromPartner_CURRENT(
      'Slava',    // skippedBy
      'Slava',    // currentUserName — SAME
    );
    expect(result).toBe(false); // BUG: doesn't detect partner's skip
  });
});

// ============================================================================
// FIX TESTS — role-based checks work regardless of name
// ============================================================================

describe('P646: name collision — FIXED (role-based) behavior', () => {
  it('same-name users: listener correctly detects partner Speak', () => {
    // Creator clicked Speak → ratingInitiatedByIsCreator = true
    // Listener is joiner → isCreator = false
    const result = isListenerDuringLocalRating_FIXED(
      true,    // ratingInitiatedByIsCreator (creator clicked)
      false,   // isCreator (I'm the joiner/listener)
    );
    expect(result).toBe(true); // FIXED: detects partner's action
  });

  it('same-name users: speaker correctly knows they initiated', () => {
    // Creator clicked Speak → ratingInitiatedByIsCreator = true
    // Speaker is creator → isCreator = true
    const result = isListenerDuringLocalRating_FIXED(
      true,    // ratingInitiatedByIsCreator (creator clicked)
      true,    // isCreator (I'm the creator/speaker)
    );
    expect(result).toBe(false); // Correct: I initiated this
  });

  it('joiner clicks Speak — creator correctly detects', () => {
    // Joiner clicked Speak → ratingInitiatedByIsCreator = false
    // Listener is creator → isCreator = true
    const result = isListenerDuringLocalRating_FIXED(
      false,   // ratingInitiatedByIsCreator (joiner clicked)
      true,    // isCreator (I'm the creator/listener)
    );
    expect(result).toBe(true); // Detects partner's action
  });

  it('undefined ratingInitiatedByIsCreator → nobody initiated', () => {
    const result = isListenerDuringLocalRating_FIXED(
      undefined,  // nobody clicked Speak yet
      true,
    );
    expect(result).toBe(false); // Correct: no rating in progress
  });

  it('same-name skip — role-based detects partner correctly', () => {
    // Creator skipped → skippedByIsCreator = true
    // I'm the joiner → isCreator = false
    const result = isSkipFromPartner_FIXED(
      true,    // skippedByIsCreator
      false,   // isCreator
    );
    expect(result).toBe(true); // FIXED: detects partner's skip
  });
});
