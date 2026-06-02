/**
 * Versioned registry for the Clarity Partner Agreement oath body (P857).
 *
 * Mirrors PLEDGE_VERSIONS (pledge-text.tsx) for the agreement surface. The
 * agreement is bilateral: the mutuality lives in the certificate's two-name
 * intro ("We, {A} and {B}, agree to:") and two signature slots, while the oath
 * body stays the identical first-person VERIFIED_UNDERSTANDING_OATH so the
 * directional min ("the lower of our two numbers") is unambiguous per signer
 * and the constant stays literally shared with the pledge.
 *
 * - "legacy": the bilateral oath that existed before versioning was introduced.
 *   String key (not 1/2/3) — the agreement never had a prior versioning regime,
 *   so a numeric key would falsely imply a sequence. Permanent grandfathering
 *   label with no implied successor. Apostrophes are typographic U+2019 (’) and
 *   the dash is em-dash U+2014 (—) — the certificate previously stored these as
 *   HTML entities; here they are literal glyphs (unit/component tests assert them
 *   verbatim).
 * - 4: number-first commitment. Oath body points at VERIFIED_UNDERSTANDING_OATH[4]
 *   so editing the shared constant once updates both the pledge and the agreement.
 *
 * title / subtitle / commitmentIntro are stored for completeness but are NOT
 * wired to certificate rendering by P857 — the certificate's bilateral intro line
 * stays hardcoded in JSX (Resolved Decision 1). Only the three oath blocks
 * (yourRight / myPromise / exception) are read from this registry.
 */

import { VERIFIED_UNDERSTANDING_OATH } from "./verified-understanding-oath";

export const AGREEMENT_VERSIONS = {
  legacy: {
    title: "Clarity Partner Agreement",
    subtitle: "A mutual commitment to clarity",
    commitmentIntro: (creatorName: string, partnerName: string) =>
      `We, ${creatorName} and ${partnerName}, agree to:`,
    yourRight: {
      heading: "YOUR RIGHT",
      text: "When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back.",
    },
    myPromise: {
      heading: "OUR PROMISE",
      text: "We will explain back what we think the other meant—withholding judgment or criticism—so they can confirm or correct us. We won’t pretend to understand if we don’t.",
    },
    exception: {
      heading: "THE EXCEPTION",
      text: "If either of us can’t keep this promise in the moment, we’ll explain why.",
    },
  },
  4: {
    title: "Clarity Partner Agreement",
    subtitle: "A mutual commitment to clarity",
    commitmentIntro: (creatorName: string, partnerName: string) =>
      `We, ${creatorName} and ${partnerName}, agree to:`,
    // Oath body is the shared, versioned constant (also used by the pledge).
    // Editing VERIFIED_UNDERSTANDING_OATH[4] updates both surfaces at once.
    yourRight: VERIFIED_UNDERSTANDING_OATH[4].yourRight,
    myPromise: VERIFIED_UNDERSTANDING_OATH[4].myPromise,
    exception: VERIFIED_UNDERSTANDING_OATH[4].exception,
  },
} as const;

export type AgreementVersion = keyof typeof AGREEMENT_VERSIONS;

// The single intended lever. Stage A stays on 'legacy'; Stage B flips to 4
// (gated on founder wording sign-off). Rollback = flip this one constant back.
export const CURRENT_AGREEMENT_VERSION: AgreementVersion = "legacy";

// Plain-text alias tracking the current version (mirrors PLEDGE_TEXT).
export const AGREEMENT_TEXT = {
  title: AGREEMENT_VERSIONS[CURRENT_AGREEMENT_VERSION].title,
  subtitle: AGREEMENT_VERSIONS[CURRENT_AGREEMENT_VERSION].subtitle,
  commitmentIntro: AGREEMENT_VERSIONS[CURRENT_AGREEMENT_VERSION].commitmentIntro,
  yourRight: AGREEMENT_VERSIONS[CURRENT_AGREEMENT_VERSION].yourRight,
  myPromise: AGREEMENT_VERSIONS[CURRENT_AGREEMENT_VERSION].myPromise,
  exception: AGREEMENT_VERSIONS[CURRENT_AGREEMENT_VERSION].exception,
} as const;
