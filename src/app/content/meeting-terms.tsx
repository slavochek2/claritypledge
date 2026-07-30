import {
  PLEDGE_VERSIONS,
  CURRENT_PLEDGE_VERSION,
  type PledgeVersion,
} from "./pledge-text";
import type { OathSection } from "@/app/components/agreements/certificate-frame";

/**
 * Content for the Clarity Meeting Terms ladder (P1016, route /terms).
 *
 * Four levels of conversational terms, escalating from "no verification at all"
 * to the current pledge. Two of the four ALREADY EXIST in code and are referenced
 * here, never copied — copies diverge silently, and these two are live commitments
 * rendered on other surfaces:
 *
 *   level 2 → PLEDGE_VERSIONS[3]                  (the pledge before the number upgrade)
 *   level 3 → PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION]
 *             whose oath body IS VERIFIED_UNDERSTANDING_OATH[5] (see pledge-text.tsx)
 *
 * Levels 0 and 1 have no prior existence, so their copy lives here in the same
 * versioned shape as the constants above — edit a version, don't mutate one.
 *
 * Emphasis is NOT re-authored: levels 2 and 3 render through the existing exported
 * pledge renderers (YourRightTextTailwind etc.), which resolve bold phrases from
 * VERIFIED_UNDERSTANDING_OATH[*].boldPhrases for v4+ and from their own frozen JSX
 * for v3. Levels 0 and 1 carry their own boldPhrases and render via <OathText>.
 */

export type MeetingTermsLevel = 1 | 2 | 3;

/**
 * Display order of the ladder, weakest first.
 *
 * The numbers are CONTENT IDENTITIES, not positions — 2 is always the pre-upgrade
 * pledge and 3 is always the current one, whatever rung they sit on. Keeping the ids
 * stable means a stored choice survives a reordering of the track.
 *
 * Founder decision: "Explain back" is the top rung and "Reveal the gap" sits below it,
 * so the order is 1 → 3 → 2. NOTE — this makes the top rung's terms a DIFFERENT
 * commitment from the one below, not a superset: rung 3 (pledge v3) asks for the
 * mirror-back but drops the honest number that rung 2 (current pledge) carries.
 * Every other rung on this ladder adds to the one before it.
 */
export const MEETING_TERMS_LEVELS: readonly MeetingTermsLevel[] = [1, 3, 2];

/**
 * Which pledge version supplies each pledge-sourced level.
 *
 * Level 3 tracks CURRENT_PLEDGE_VERSION deliberately: "the terms I actually keep"
 * should follow the live pledge without a second edit here. If a future pledge
 * version stops being an escalation of level 2, this mapping needs revisiting —
 * the ladder's meaning, not just its text, would have changed.
 */
const PLEDGE_SOURCE: Record<2 | 3, PledgeVersion> = {
  2: 3,
  3: CURRENT_PLEDGE_VERSION,
};

/**
 * Copy authored for this page only (levels 0 and 1).
 *
 * [FOUNDER DECISION — UNCONFIRMED] This wording is the implementer's draft from the
 * P1016 spec, not founder-approved copy. It deliberately reuses the YOUR RIGHT /
 * MY PROMISE slots so the ladder reads as the same two things getting stronger,
 * and it states "none" honestly rather than dressing up the absence of a commitment.
 */
export const MEETING_TERMS_OWN_COPY = {
  1: {
    1: {
      // No MY PROMISE block by design. Level 1 grants a right and commits to
      // nothing; a section that says "None" gives the absence the same visual
      // weight as a promise. The missing section IS the statement.
      sections: [
        {
          heading: "YOUR RIGHT",
          text: "At any point you may ask how well I think I understood the intended meaning behind what you said. You may also give me your own number for how well you think I understood you.",
          boldPhrases: ["you may ask", "your own number"],
        },
      ],
    },
  },
} as const;

export const CURRENT_MEETING_TERMS_VERSION: keyof typeof MEETING_TERMS_OWN_COPY = 1;

/**
 * The ladder itself — label and trade-off line per rung.
 *
 * Every level carries a trade-off line, including the demanding ones. A cost stated
 * only on the low rungs would be an argument dressed as a description.
 */
export const MEETING_TERMS_LADDER: readonly {
  level: MeetingTermsLevel;
  label: string;
  tradeoff: string;
}[] = [
  {
    level: 1,
    label: "You may ask",
    tradeoff: "Asking is allowed. Answering is not promised.",
  },
  {
    level: 3,
    label: "Reveal the gap",
    tradeoff: "We put a number on it and take the lower one.",
  },
  {
    level: 2,
    label: "Explain back",
    tradeoff: "You hear what I understood, so you can correct it.",
  },
];

/**
 * Emphasis for level 2 only.
 *
 * PLEDGE_VERSIONS[3] predates the `boldPhrases` convention — its bold phrases live
 * as hand-written JSX inside the v3 renderers in pledge-text.tsx, which the shared
 * <CertificateOathBody> cannot consume. So the phrase SELECTION is named here to
 * match that frozen JSX, while the TEXT itself is still read from the constant and
 * never copied. v3 is closed history, so this cannot drift.
 */
const LEVEL_2_BOLD: Record<string, readonly string[]> = {
  "YOUR RIGHT": ["mirror back"],
  "MY PROMISE": ["explain back", "withholding judgment or criticism", "won't pretend to understand"],
  "THE EXCEPTION": [],
};

/** Sections for a pledge-sourced level (2 and 3), read straight from PLEDGE_VERSIONS. */
function pledgeSourcedSections(version: PledgeVersion): OathSection[] {
  const v = PLEDGE_VERSIONS[version];
  const blocks = [v.yourRight, v.myPromise, ...("exception" in v ? [v.exception] : [])];
  return blocks.map((b) => ({
    heading: b.heading,
    text: b.text,
    boldPhrases:
      "boldPhrases" in b ? b.boldPhrases : (LEVEL_2_BOLD[b.heading] ?? []),
  }));
}

export function sectionsForLevel(level: MeetingTermsLevel): OathSection[] {
  if (level === 2 || level === 3) {
    return pledgeSourcedSections(PLEDGE_SOURCE[level]);
  }
  return MEETING_TERMS_OWN_COPY[CURRENT_MEETING_TERMS_VERSION][level].sections.map(
    (s) => ({ heading: s.heading, text: s.text, boldPhrases: s.boldPhrases }),
  );
}

/** Exported for tests: the pledge version each pledge-sourced level must render. */
export const MEETING_TERMS_PLEDGE_SOURCE = PLEDGE_SOURCE;
