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
 * P1193 adds key 6, titled "Clarity Group Terms" — the rename. The oath BODY is
 * unchanged; v6 carries v5's references. Versions 4 and 5 keep their original title
 * forever: membership rows record the version their holder accepted, so retitling a
 * live version in place would rewrite the name of a document people are on record as
 * having agreed to. That invariant is asserted below, not just described here.
 *
 * ASSUMPTION flagged for /dev: exact export names (`COA_VERSIONS`, `intro` as a
 * plain string field, `CURRENT_COA_VERSION`) are this test's inference from
 * Decision 4's prose, mirroring agreement-versions.ts's shape minus the
 * function-typed intro. If /dev's actual field name differs (e.g. `introText`),
 * confirm it's a naming choice, not a missing behavior, before renaming here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COA_VERSIONS, CURRENT_COA_VERSION } from '@/app/content/coa-versions';
import { VERIFIED_UNDERSTANDING_OATH } from '@/app/content/verified-understanding-oath';

describe('COA_VERSIONS registry', () => {
  it('exposes exactly versions 4, 5 and the P1193 rename version 6', () => {
    expect(Object.keys(COA_VERSIONS).map(Number).sort()).toEqual([4, 5, 6]);
  });

  it('never "Community Oath" — and P1193 retitles ONLY the new version', () => {
    // The retroactivity guard. If either of these two ever reads "Clarity Group
    // Terms", someone edited a live version in place and changed what existing
    // members are recorded as having accepted.
    expect(COA_VERSIONS[4].title).toBe('Clarity Organization Terms');
    expect(COA_VERSIONS[5].title).toBe('Clarity Organization Terms');
    expect(COA_VERSIONS[6].title).toBe('Clarity Group Terms');
  });

  it('v6 differs from v5 in TITLE ALONE — the terms text itself did not change', () => {
    // Identity, not string equality: v6 must carry v5's own objects. A retyped copy
    // that happened to match today would silently diverge the next time the shared
    // VERIFIED_UNDERSTANDING_OATH is edited.
    expect(COA_VERSIONS[6].yourRight).toBe(COA_VERSIONS[5].yourRight);
    expect(COA_VERSIONS[6].myPromise).toBe(COA_VERSIONS[5].myPromise);
    expect(COA_VERSIONS[6].exception).toBe(COA_VERSIONS[5].exception);
    expect(COA_VERSIONS[6].intro).toBe(COA_VERSIONS[5].intro);
    expect(COA_VERSIONS[6].title).not.toBe(COA_VERSIONS[5].title);
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

  it('CURRENT_COA_VERSION points at the live version — 6 since P1193', () => {
    expect(CURRENT_COA_VERSION).toBe(6);
    expect(COA_VERSIONS[CURRENT_COA_VERSION as 4 | 5 | 6]).toBeDefined();
  });

  it('every version the registry exposes is admitted by the membership CHECK constraint', () => {
    // The bind between this file and the database. CURRENT_COA_VERSION is written
    // into membership.terms_version by the column DEFAULT, so a version added here
    // without the matching migration makes every new join fail the constraint at
    // runtime with nothing in the test suite noticing.
    const migration = readFileSync(
      resolve(__dirname, '../../supabase/migrations/20260831180000_p1193_coa_v6_terms_version.sql'),
      'utf-8',
    );
    for (const v of Object.keys(COA_VERSIONS)) {
      expect(migration).toContain(`'${v}'`);
    }
    expect(migration).toContain(`ALTER COLUMN terms_version SET DEFAULT '${CURRENT_COA_VERSION}'`);
  });
});
