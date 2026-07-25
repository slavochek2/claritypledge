/**
 * Versioned registry for the Clarity Organization Agreement (COA) — P1010.
 *
 * The COA is the SINGLE-PARTY application of the shared verified-understanding
 * oath: a person joining a Clarity Organization commits, individually, to every
 * other member. This mirrors AGREEMENT_VERSIONS (the bilateral Clarity Partner
 * Agreement) but strips the counterparty — the intro is a plain first-person
 * string, NOT the bilateral `commitmentIntro(creatorName, partnerName)` function.
 *
 * - Keys 4/5 mirror VERIFIED_UNDERSTANDING_OATH exactly. The oath body
 *   (yourRight / myPromise / exception) points at the SAME shared constant used by
 *   the pledge and the agreement, so editing VERIFIED_UNDERSTANDING_OATH once
 *   converges all three surfaces.
 * - `intro` is the founder-approved generic line — no org-name / member-name
 *   interpolation (contrast AGREEMENT_VERSIONS.commitmentIntro, which IS a fn).
 * - CURRENT_COA_VERSION mirrors CURRENT_AGREEMENT_VERSION (=5 today). It is the
 *   sole lever; existing membership rows stay pinned to their stored terms_version.
 *   Bumping it also requires the membership.terms_version CHECK/DEFAULT to allow
 *   the new value (see the P1010 migration).
 */

import { VERIFIED_UNDERSTANDING_OATH } from "./verified-understanding-oath";

const COA_INTRO = "By joining this clarity organization, I commit to every other member:";

export const COA_VERSIONS = {
  4: {
    title: "Clarity Organization Agreement",
    intro: COA_INTRO,
    // Shared, versioned oath body — same object references as the pledge + agreement.
    yourRight: VERIFIED_UNDERSTANDING_OATH[4].yourRight,
    myPromise: VERIFIED_UNDERSTANDING_OATH[4].myPromise,
    exception: VERIFIED_UNDERSTANDING_OATH[4].exception,
  },
  5: {
    title: "Clarity Organization Agreement",
    intro: COA_INTRO,
    // P928 wording ("intended meaning"). Shared constant — all surfaces converge.
    yourRight: VERIFIED_UNDERSTANDING_OATH[5].yourRight,
    myPromise: VERIFIED_UNDERSTANDING_OATH[5].myPromise,
    exception: VERIFIED_UNDERSTANDING_OATH[5].exception,
  },
} as const;

export type CoaVersion = keyof typeof COA_VERSIONS;

// Sole rollback lever — flip back to 4 to revert wording. Mirrors
// CURRENT_AGREEMENT_VERSION. Kept here (not src/lib/constants.ts) to match where
// CURRENT_AGREEMENT_VERSION lives.
export const CURRENT_COA_VERSION: CoaVersion = 5;
