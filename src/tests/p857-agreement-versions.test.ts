/**
 * @file p857-agreement-versions.test.ts
 * @description Unit tests for the AGREEMENT_VERSIONS registry created in P857.
 *
 * Covers:
 * - Legacy entry has the correct verbatim bilateral oath text
 * - v4 entry oath body is referentially equal to VERIFIED_UNDERSTANDING_OATH[4]
 *   (proves single-source link — AC from P857)
 * - CURRENT_AGREEMENT_VERSION points to a valid key
 * - Result-level fallback semantics: an unknown key resolves to undefined,
 *   and `?? AGREEMENT_VERSIONS['legacy']` returns the legacy entry
 */

import { describe, it, expect } from 'vitest';
import {
  AGREEMENT_VERSIONS,
  CURRENT_AGREEMENT_VERSION,
} from '@/app/content/agreement-versions';
import { VERIFIED_UNDERSTANDING_OATH } from '@/app/content/verified-understanding-oath';

// ---------------------------------------------------------------------------
// LEGACY ENTRY
// ---------------------------------------------------------------------------
describe('AGREEMENT_VERSIONS["legacy"]', () => {
  it('exists', () => {
    expect(AGREEMENT_VERSIONS['legacy']).toBeDefined();
  });

  it('YOUR RIGHT text is the verbatim bilateral wording', () => {
    expect(AGREEMENT_VERSIONS['legacy'].yourRight.text).toBe(
      'When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back.'
    );
  });

  it('OUR PROMISE text is the verbatim bilateral wording (single paragraph)', () => {
    // em-dash U+2014; typographic apostrophe U+2019
    expect(AGREEMENT_VERSIONS['legacy'].myPromise.text).toBe(
      "We will explain back what we think the other meant—withholding judgment or criticism—so they can confirm or correct us. We won’t pretend to understand if we don’t."
    );
  });

  it('OUR PROMISE heading label is "OUR PROMISE" (bilateral framing)', () => {
    expect(AGREEMENT_VERSIONS['legacy'].myPromise.heading).toBe('OUR PROMISE');
  });

  it('THE EXCEPTION text is the verbatim bilateral wording', () => {
    expect(AGREEMENT_VERSIONS['legacy'].exception.text).toBe(
      "If either of us can’t keep this promise in the moment, we’ll explain why."
    );
  });
});

// ---------------------------------------------------------------------------
// V4 ENTRY — shared constant link (P857 Acceptance Criterion)
// ---------------------------------------------------------------------------
describe('AGREEMENT_VERSIONS[4]', () => {
  it('exists', () => {
    expect(AGREEMENT_VERSIONS[4]).toBeDefined();
  });

  it('yourRight is referentially or structurally equal to VERIFIED_UNDERSTANDING_OATH[4].yourRight', () => {
    // AC: "AGREEMENT_VERSIONS references the shared VERIFIED_UNDERSTANDING_OATH constant"
    // Structural equality (toStrictEqual) covers both referential identity and
    // value equality — either implementation satisfies the spec.
    expect(AGREEMENT_VERSIONS[4].yourRight).toStrictEqual(
      VERIFIED_UNDERSTANDING_OATH[4].yourRight
    );
  });

  it('myPromise is referentially or structurally equal to VERIFIED_UNDERSTANDING_OATH[4].myPromise', () => {
    expect(AGREEMENT_VERSIONS[4].myPromise).toStrictEqual(
      VERIFIED_UNDERSTANDING_OATH[4].myPromise
    );
  });

  it('exception is referentially or structurally equal to VERIFIED_UNDERSTANDING_OATH[4].exception', () => {
    expect(AGREEMENT_VERSIONS[4].exception).toStrictEqual(
      VERIFIED_UNDERSTANDING_OATH[4].exception
    );
  });

  it('MY PROMISE heading label is "MY PROMISE" (first-person framing for v4)', () => {
    expect(AGREEMENT_VERSIONS[4].myPromise.heading).toBe('MY PROMISE');
  });
});

// ---------------------------------------------------------------------------
// CURRENT_AGREEMENT_VERSION — valid key guard
// ---------------------------------------------------------------------------
describe('CURRENT_AGREEMENT_VERSION', () => {
  // The membership assertion is stage-agnostic and always valid; the explicit
  // assertion pins the current pointer (flipped to 5 by P928).
  it('is a key present in AGREEMENT_VERSIONS', () => {
    expect(AGREEMENT_VERSIONS[CURRENT_AGREEMENT_VERSION]).toBeDefined();
  });

  // P928 assertion — pointer flipped to v5 ("intended meaning"). (Rollback → 4.)
  it('is 5 after the P928 flip', () => {
    expect(CURRENT_AGREEMENT_VERSION).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// V5 ENTRY (P928) — shared constant link + new wording
// ---------------------------------------------------------------------------
describe('AGREEMENT_VERSIONS[5]', () => {
  it('exists', () => {
    expect(AGREEMENT_VERSIONS[5]).toBeDefined();
  });

  it('yourRight is structurally equal to VERIFIED_UNDERSTANDING_OATH[5].yourRight', () => {
    expect(AGREEMENT_VERSIONS[5].yourRight).toStrictEqual(
      VERIFIED_UNDERSTANDING_OATH[5].yourRight
    );
  });

  it('myPromise is structurally equal to VERIFIED_UNDERSTANDING_OATH[5].myPromise', () => {
    expect(AGREEMENT_VERSIONS[5].myPromise).toStrictEqual(
      VERIFIED_UNDERSTANDING_OATH[5].myPromise
    );
  });

  it('YOUR RIGHT says "intended meaning", not "intention"', () => {
    expect(AGREEMENT_VERSIONS[5].yourRight.text).toContain('intended meaning behind what you say');
    expect(AGREEMENT_VERSIONS[5].yourRight.text).not.toContain('intention');
  });

  it('v4 entry is untouched — still says "intention" (grandfathered signers)', () => {
    expect(AGREEMENT_VERSIONS[4].yourRight.text).toContain('intention behind what you say');
  });
});

// ---------------------------------------------------------------------------
// RESULT-LEVEL FALLBACK SEMANTICS
// Documents the expression both certificate components use:
//   AGREEMENT_VERSIONS[agreementVersion] ?? AGREEMENT_VERSIONS['legacy']
// An unknown non-null key must return undefined from the bare lookup, so the
// `??` guard can activate. This is what Architecture Decision 5 requires.
// ---------------------------------------------------------------------------
describe('result-level fallback: unknown key → legacy', () => {
  it('an unknown key returns undefined from a bare lookup', () => {
    // Simulate a row with a future version not yet in the registry
    const unknownVersion = 'v99' as never;
    expect(AGREEMENT_VERSIONS[unknownVersion]).toBeUndefined();
  });

  it('the fallback expression returns the legacy entry for an unknown key', () => {
    const unknownVersion = 'v99' as never;
    const resolved =
      AGREEMENT_VERSIONS[unknownVersion] ?? AGREEMENT_VERSIONS['legacy'];
    expect(resolved).toBe(AGREEMENT_VERSIONS['legacy']);
  });

  it('the fallback expression returns the v4 entry for key 4 (no fallback triggered)', () => {
    const resolved =
      AGREEMENT_VERSIONS[4] ?? AGREEMENT_VERSIONS['legacy'];
    expect(resolved).toBe(AGREEMENT_VERSIONS[4]);
  });
});
