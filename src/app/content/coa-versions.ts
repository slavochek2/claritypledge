/**
 * Versioned registry for the Clarity Organization Terms (COA) — P1010.
 *
 * The COA is the SINGLE-PARTY application of the shared verified-understanding
 * oath: a person joining a Clarity Organization commits, individually, to every
 * other member. This mirrors AGREEMENT_VERSIONS (the bilateral Clarity Partner
 * Agreement) but strips the counterparty — the intro is a plain static string,
 * NOT the bilateral `commitmentIntro(creatorName, partnerName)` function.
 *
 * - Keys 4/5 mirror VERIFIED_UNDERSTANDING_OATH exactly. The oath body
 *   (yourRight / myPromise / exception) points at the SAME shared constant used by
 *   the pledge and the agreement, so editing VERIFIED_UNDERSTANDING_OATH once
 *   converges all three surfaces.
 * - `intro` is the founder-approved generic line — no org-name / member-name
 *   interpolation (contrast AGREEMENT_VERSIONS.commitmentIntro, which IS a fn).
 *   It renders ABOVE the certificate as the join page's subtitle, not inside the
 *   document: a clause disclaiming the document's own legal force belongs in the
 *   framing, not in the text being accepted. Kept versioned here so it stays
 *   pinned to the terms_version each membership row stored.
 * - CURRENT_COA_VERSION mirrors CURRENT_AGREEMENT_VERSION (=5 today). It is the
 *   sole lever; existing membership rows stay pinned to their stored terms_version.
 *   Bumping it also requires the membership.terms_version CHECK/DEFAULT to allow
 *   the new value (see the P1010 migration).
 */

import { VERIFIED_UNDERSTANDING_OATH } from "./verified-understanding-oath";

const COA_INTRO = "Members accept these not legally binding terms as a shared intention.";

export const COA_VERSIONS = {
  4: {
    title: "Clarity Organization Terms",
    intro: COA_INTRO,
    // Shared, versioned oath body — same object references as the pledge + agreement.
    yourRight: VERIFIED_UNDERSTANDING_OATH[4].yourRight,
    myPromise: VERIFIED_UNDERSTANDING_OATH[4].myPromise,
    exception: VERIFIED_UNDERSTANDING_OATH[4].exception,
  },
  5: {
    title: "Clarity Organization Terms",
    intro: COA_INTRO,
    // P928 wording ("intended meaning"). Shared constant — all surfaces converge.
    yourRight: VERIFIED_UNDERSTANDING_OATH[5].yourRight,
    myPromise: VERIFIED_UNDERSTANDING_OATH[5].myPromise,
    exception: VERIFIED_UNDERSTANDING_OATH[5].exception,
  },
  // P1193 — the Clarity Organization → Clarity Group rename. THE ONLY DIFFERENCE
  // FROM 5 IS `title`. The oath body is carried across by the SAME references, not
  // retyped: v5 and v6 are the identical commitment under a new product noun.
  //
  // A new version rather than an edit to 5, and this is the whole point of the file:
  // `membership.terms_version` records what each member actually accepted. Retitling
  // 5 in place would rewrite the name of a document people are on record as having
  // agreed to — versions 4 and 5 therefore keep "Clarity Organization Terms" forever,
  // and nothing backfills existing rows onto 6.
  6: {
    title: "Clarity Group Terms",
    intro: COA_INTRO,
    yourRight: VERIFIED_UNDERSTANDING_OATH[5].yourRight,
    myPromise: VERIFIED_UNDERSTANDING_OATH[5].myPromise,
    exception: VERIFIED_UNDERSTANDING_OATH[5].exception,
  },
} as const;

export type CoaVersion = keyof typeof COA_VERSIONS;

// Sole rollback lever — flip back to 5 to revert to the pre-rename title, or to 4
// to revert the P928 wording as well. Mirrors CURRENT_AGREEMENT_VERSION. Kept here
// (not src/lib/constants.ts) to match where CURRENT_AGREEMENT_VERSION lives.
//
// P1193: 5 → 6. Per the header note above, this bump also required widening the
// membership.terms_version CHECK constraint and moving its DEFAULT — see
// supabase/migrations/20260831120000_p1193_coa_v6_terms_version.sql. Rolling this
// constant back does NOT need the migration reverted: the constraint admits 4, 5
// and 6, so an older value still writes cleanly.
export const CURRENT_COA_VERSION: CoaVersion = 6;
