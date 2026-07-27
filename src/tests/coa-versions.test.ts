/**
 * @file coa-versions.test.ts
 * @description Unit coverage for src/app/content/coa-versions.ts (Architecture
 * Decision 4, P1010). This registry does not exist yet — /dev implements it
 * against this test, per the repo's agent-self-verification pattern
 * (docs/technical/e2e-testing-guide.md).
 *
 * Grounded in Decision 4's exact language:
 *   - Title: "Clarity Organization Terms" (not "Community Oath").
 *   - Intro: "Members accept these not legally binding terms as a shared
 *     intention." — generic, no org-name/member-name interpolation (unlike the
 *     bilateral AGREEMENT_VERSIONS.commitmentIntro, which IS a function).
 *   - Body (yourRight/myPromise/exception) points at the SAME shared
 *     VERIFIED_UNDERSTANDING_OATH constant used by pledge + agreement —
 *     editing the oath once must converge all three surfaces.
 *   - Keys 4/5, CURRENT_COA_VERSION mirrors CURRENT_AGREEMENT_VERSION (=5 today).
 *
 * ASSUMPTION flagged for /dev: exact export names (`COA_VERSIONS`, `intro` as a
 * plain string field, `CURRENT_COA_VERSION`) are this test's inference from
 * Decision 4's prose, mirroring agreement-versions.ts's shape minus the
 * function-typed intro. If /dev's actual field name differs (e.g. `introText`),
 * confirm it's a naming choice, not a missing behavior, before renaming here.
 */

import { describe, it, expect } from 'vitest';
import { COA_VERSIONS, CURRENT_COA_VERSION } from '@/app/content/coa-versions';
import { VERIFIED_UNDERSTANDING_OATH } from '@/app/content/verified-understanding-oath';

describe('COA_VERSIONS registry', () => {
  it('exposes exactly the versions VERIFIED_UNDERSTANDING_OATH defines (4, 5)', () => {
    expect(Object.keys(COA_VERSIONS).map(Number).sort()).toEqual([4, 5]);
  });

  it('title is always "Clarity Organization Terms" — never "Community Oath"', () => {
    expect(COA_VERSIONS[4].title).toBe('Clarity Organization Terms');
    expect(COA_VERSIONS[5].title).toBe('Clarity Organization Terms');
  });

  it('intro is the founder-approved single-party string, generic with no interpolation', () => {
    const expectedIntro = 'Members accept these not legally binding terms as a shared intention.';
    expect(COA_VERSIONS[4].intro).toBe(expectedIntro);
    expect(COA_VERSIONS[5].intro).toBe(expectedIntro);
    // Must be a plain string, NOT a function — unlike AGREEMENT_VERSIONS.commitmentIntro,
    // which takes (creatorName, partnerName). A function here would signal an
    // accidental copy-paste of the bilateral interpolation pattern.
    expect(typeof COA_VERSIONS[4].intro).toBe('string');
  });

  it('oath body is the SAME object reference as VERIFIED_UNDERSTANDING_OATH — editing once converges all surfaces', () => {
    expect(COA_VERSIONS[4].yourRight).toBe(VERIFIED_UNDERSTANDING_OATH[4].yourRight);
    expect(COA_VERSIONS[4].myPromise).toBe(VERIFIED_UNDERSTANDING_OATH[4].myPromise);
    expect(COA_VERSIONS[4].exception).toBe(VERIFIED_UNDERSTANDING_OATH[4].exception);
    expect(COA_VERSIONS[5].yourRight).toBe(VERIFIED_UNDERSTANDING_OATH[5].yourRight);
  });

  it('CURRENT_COA_VERSION points at the latest live oath version (mirrors CURRENT_AGREEMENT_VERSION)', () => {
    expect(CURRENT_COA_VERSION).toBe(5);
    expect(COA_VERSIONS[CURRENT_COA_VERSION as 4 | 5]).toBeDefined();
  });
});
