/**
 * @file p466-partner-display-name.test.ts
 * @description Unit tests for P466: partner_display_name validation logic and fallback chain.
 *
 * Tests the two pure-logic concerns introduced by P466:
 *
 *   1. VALIDATION — validatePartnerDisplayName(name: string): string | null
 *      Returns null if valid, error message string if invalid.
 *      Rules per spec section 3.3:
 *        - Required: empty string (after trim) → "Partner name is required"
 *        - Max length: > 100 chars → "Name must be 100 characters or fewer"
 *        - Whitespace-only → treated as empty → "Partner name is required"
 *
 *   2. FALLBACK CHAIN — resolvePartnerDisplayName(partner, partnerDisplayName): string
 *      Per spec section 4.2 (Decision F) and agreement-page.tsx requirement:
 *        - partner.name (profile name, post-acceptance) → highest priority
 *        - partnerDisplayName (creator-set name, pre-acceptance) → second
 *        - 'Invited party' → final fallback (when pending and neither exists)
 *        - 'Partner' → alternative final fallback (for non-pending states)
 *
 * These functions will be extracted/exported from the implementation files during /dev.
 * This test file documents the expected behavior for the implementer.
 *
 * NOTE: If the validation is implemented inline in the component without a dedicated
 * exported function, the E2E tests (TC-02, TC-03, TC-04) cover the behavior end-to-end.
 * The unit tests here are an additional layer for pure-logic coverage.
 */

import { describe, it, expect } from 'vitest';

// ─── Validation logic (to be imported from implementation after /dev) ──────────
//
// This mirrors the expected validation function. Replace with a direct import
// once the function is exported from create-agreement-page.tsx or a shared util.

function validatePartnerDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'Partner name is required';
  }
  if (trimmed.length > 100) {
    return 'Name must be 100 characters or fewer';
  }
  return null; // valid
}

// ─── Fallback chain (to be imported from agreement-page.tsx after /dev) ────────
//
// This mirrors the resolvePartnerDisplayName logic from Decision F.
// Replace with direct import once exported.

interface PartnerProfile {
  name?: string | null;
}

function resolvePartnerName(
  partner: PartnerProfile | null | undefined,
  partnerDisplayName: string | null | undefined,
  isPending: boolean,
): string {
  // Profile name takes priority (post-acceptance, profile joined)
  if (partner?.name) {
    return partner.name;
  }
  // Creator-set display name (pre-acceptance placeholder)
  if (partnerDisplayName) {
    return partnerDisplayName;
  }
  // Final fallback — context-aware
  return isPending ? 'Invited party' : 'Partner';
}

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('validatePartnerDisplayName', () => {
  // ── Required field ────────────────────────────────────────────────────────

  describe('Required validation', () => {
    it('returns error for empty string', () => {
      expect(validatePartnerDisplayName('')).toBe('Partner name is required');
    });

    it('returns error for whitespace-only (single space)', () => {
      expect(validatePartnerDisplayName(' ')).toBe('Partner name is required');
    });

    it('returns error for whitespace-only (multiple spaces)', () => {
      expect(validatePartnerDisplayName('   ')).toBe('Partner name is required');
    });

    it('returns error for whitespace-only (tabs)', () => {
      expect(validatePartnerDisplayName('\t\t')).toBe('Partner name is required');
    });

    it('returns error for whitespace-only (newlines)', () => {
      expect(validatePartnerDisplayName('\n')).toBe('Partner name is required');
    });

    it('returns null for a simple non-empty name', () => {
      expect(validatePartnerDisplayName('Alex Chen')).toBeNull();
    });

    it('returns null for a single-character name', () => {
      expect(validatePartnerDisplayName('A')).toBeNull();
    });

    it('returns null for a name with surrounding whitespace (trimmed to non-empty)', () => {
      // Leading/trailing whitespace is trimmed before length check
      expect(validatePartnerDisplayName('  Alex  ')).toBeNull();
    });
  });

  // ── Max length ─────────────────────────────────────────────────────────────

  describe('Maximum length validation (100 chars)', () => {
    it('returns null for exactly 100 characters', () => {
      const name = 'A'.repeat(100);
      expect(validatePartnerDisplayName(name)).toBeNull();
    });

    it('returns error for 101 characters', () => {
      const name = 'A'.repeat(101);
      expect(validatePartnerDisplayName(name)).toBe('Name must be 100 characters or fewer');
    });

    it('returns error for 200 characters', () => {
      const name = 'A'.repeat(200);
      expect(validatePartnerDisplayName(name)).toBe('Name must be 100 characters or fewer');
    });

    it('returns null for a name with whitespace that trims to exactly 100 chars', () => {
      // "  " + 100 A's + "  " → trimmed = 100 A's → valid
      const name = '  ' + 'A'.repeat(100) + '  ';
      expect(validatePartnerDisplayName(name)).toBeNull();
    });

    it('trims before length check — whitespace padded 101-char core is still invalid', () => {
      // 101 A's padded with spaces → trimmed = 101 → invalid
      const name = ' ' + 'A'.repeat(101) + ' ';
      expect(validatePartnerDisplayName(name)).toBe('Name must be 100 characters or fewer');
    });
  });

  // ── Special characters ─────────────────────────────────────────────────────

  describe('Special characters and unicode', () => {
    it('accepts names with hyphens (compound surnames)', () => {
      expect(validatePartnerDisplayName('Jean-Paul Dupont')).toBeNull();
    });

    it('accepts names with apostrophes', () => {
      expect(validatePartnerDisplayName("O'Brien")).toBeNull();
    });

    it('accepts unicode names (CJK)', () => {
      expect(validatePartnerDisplayName('张伟')).toBeNull();
    });

    it('accepts names with diacritics', () => {
      expect(validatePartnerDisplayName('María García')).toBeNull();
    });
  });
});

// ─── Fallback chain tests ─────────────────────────────────────────────────────

describe('resolvePartnerName — fallback chain (Decision F)', () => {
  // ── Tier 1: profile name ───────────────────────────────────────────────────

  describe('Tier 1: partner.name (profile name) takes highest priority', () => {
    it('returns profile name when partner.name is set', () => {
      const result = resolvePartnerName({ name: 'Alex Chen' }, 'Display Name', true);
      expect(result).toBe('Alex Chen');
    });

    it('returns profile name even when partnerDisplayName differs', () => {
      const result = resolvePartnerName({ name: 'Real Name' }, 'Creator Entered Name', false);
      expect(result).toBe('Real Name');
    });

    it('returns profile name when agreement is in active state', () => {
      const result = resolvePartnerName({ name: 'Profile Name' }, null, false);
      expect(result).toBe('Profile Name');
    });
  });

  // ── Tier 2: partnerDisplayName (creator-set) ───────────────────────────────

  describe('Tier 2: partnerDisplayName when no profile name', () => {
    it('returns partnerDisplayName when partner has no profile name', () => {
      const result = resolvePartnerName({ name: null }, 'Jordan Smith', true);
      expect(result).toBe('Jordan Smith');
    });

    it('returns partnerDisplayName when partner is null (no profile joined)', () => {
      const result = resolvePartnerName(null, 'Jordan Smith', true);
      expect(result).toBe('Jordan Smith');
    });

    it('returns partnerDisplayName when partner is undefined', () => {
      const result = resolvePartnerName(undefined, 'Jordan Smith', true);
      expect(result).toBe('Jordan Smith');
    });

    it('returns partnerDisplayName for non-pending state when no profile', () => {
      const result = resolvePartnerName(null, 'Jordan Smith', false);
      expect(result).toBe('Jordan Smith');
    });
  });

  // ── Tier 3: final fallback ─────────────────────────────────────────────────

  describe('Tier 3: final fallback when no profile name and no display name', () => {
    it('returns "Invited party" when pending and no names available', () => {
      const result = resolvePartnerName(null, null, true);
      expect(result).toBe('Invited party');
    });

    it('returns "Invited party" for pending with empty display name', () => {
      const result = resolvePartnerName({ name: null }, null, true);
      expect(result).toBe('Invited party');
    });

    it('returns "Partner" (not "Invited party") for non-pending states with no names', () => {
      // Active, terminated, declined, expired — different fallback copy
      const result = resolvePartnerName(null, null, false);
      expect(result).toBe('Partner');
    });
  });

  // ── Legacy agreements (null partnerDisplayName) ────────────────────────────

  describe('Legacy agreements — partnerDisplayName is null', () => {
    it('falls back to "Invited party" for pending legacy agreements', () => {
      // Legacy agreement (pre-P466): no partner_display_name stored, no partner profile yet
      const result = resolvePartnerName(null, null, true);
      expect(result).toBe('Invited party');
    });

    it('falls back to profile name if partner accepted (even on legacy agreement)', () => {
      // Post-acceptance, profile name is available regardless of whether display name was set
      const result = resolvePartnerName({ name: 'Alex Chen' }, null, false);
      expect(result).toBe('Alex Chen');
    });
  });

  // ── Priority ordering ──────────────────────────────────────────────────────

  describe('Priority ordering — all three tiers present', () => {
    it('profile name > displayName > fallback: profile name wins', () => {
      const result = resolvePartnerName({ name: 'Profile' }, 'Display', false);
      expect(result).toBe('Profile');
    });

    it('displayName > fallback: displayName wins when no profile', () => {
      const result = resolvePartnerName({ name: null }, 'Display', false);
      expect(result).toBe('Display');
    });

    it('fallback only when both profile and display name are null', () => {
      const result = resolvePartnerName({ name: null }, null, false);
      expect(result).toBe('Partner');
    });
  });
});
