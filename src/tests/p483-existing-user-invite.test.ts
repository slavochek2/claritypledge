/**
 * @file p483-existing-user-invite.test.ts
 * @description Unit tests for P483: Existing user invite path streamlining.
 *
 * Tests the name override logic introduced by P483:
 *   1. shouldOverridePartnerName — determines if lookup result should override typed name
 *   2. isExistingUserWithName — checks if lookup result represents a named existing user
 *
 * These functions will be extracted during /dev. If implemented inline,
 * the E2E tests cover the behavior end-to-end.
 */

import { describe, it, expect } from 'vitest';

// ─── Name override logic (to be extracted during /dev) ──────────────────────

interface LookupResult {
  name: string;
  id: string;
  avatarUrl?: string | null;
  avatarColor?: string;
}

/**
 * P483: Should the lookup result override the partner name field?
 * Unlike P466 which only auto-filled when user hadn't typed yet,
 * P483 ALWAYS overrides when a valid profile name exists.
 */
function shouldOverridePartnerName(
  lookupResult: LookupResult | null | 'not-found',
): boolean {
  if (!lookupResult || lookupResult === 'not-found') return false;
  return isExistingUserWithName(lookupResult);
}

/**
 * P483: Does this lookup result represent an existing user with a valid name?
 * 'Unknown' and '' are treated as "no profile name" — fallback to editable field.
 */
function isExistingUserWithName(party: LookupResult): boolean {
  const name = party.name?.trim();
  return !!name && name !== 'Unknown';
}

// ─── shouldOverridePartnerName tests ────────────────────────────────────────

describe('shouldOverridePartnerName (P483)', () => {
  describe('Returns true — override name field', () => {
    it('overrides when lookup finds user with valid name', () => {
      expect(shouldOverridePartnerName({
        id: 'user-1', name: 'Jane Doe',
      })).toBe(true);
    });

    it('overrides even for single-character names', () => {
      expect(shouldOverridePartnerName({
        id: 'user-1', name: 'J',
      })).toBe(true);
    });

    it('overrides for unicode names', () => {
      expect(shouldOverridePartnerName({
        id: 'user-1', name: '张伟',
      })).toBe(true);
    });
  });

  describe('Returns false — keep field editable', () => {
    it('does not override when lookup returns not-found', () => {
      expect(shouldOverridePartnerName('not-found')).toBe(false);
    });

    it('does not override when lookup returns null', () => {
      expect(shouldOverridePartnerName(null)).toBe(false);
    });
  });
});

// ─── isExistingUserWithName tests ───────────────────────────────────────────

describe('isExistingUserWithName (P483)', () => {
  describe('Valid profile name — returns true', () => {
    it('returns true for normal name', () => {
      expect(isExistingUserWithName({ id: '1', name: 'Jane Doe' })).toBe(true);
    });

    it('returns true for name with surrounding whitespace (trims first)', () => {
      expect(isExistingUserWithName({ id: '1', name: '  Jane  ' })).toBe(true);
    });
  });

  describe('Empty or sentinel name — returns false (fallback to editable)', () => {
    it('returns false for "Unknown" (Supabase null-name sentinel)', () => {
      expect(isExistingUserWithName({ id: '1', name: 'Unknown' })).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isExistingUserWithName({ id: '1', name: '' })).toBe(false);
    });

    it('returns false for whitespace-only', () => {
      expect(isExistingUserWithName({ id: '1', name: '   ' })).toBe(false);
    });
  });
});
