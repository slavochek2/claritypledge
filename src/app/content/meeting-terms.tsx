import type { ReactNode } from "react";
import {
  PLEDGE_VERSIONS,
  CURRENT_PLEDGE_VERSION,
  YourRightTextTailwind,
  MyPromiseTextTailwind,
  ExceptionTextTailwind,
  type PledgeVersion,
} from "./pledge-text";
import { OathText } from "./oath-emphasis";

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

export type MeetingTermsLevel = 0 | 1 | 2 | 3;

export const MEETING_TERMS_LEVELS: readonly MeetingTermsLevel[] = [0, 1, 2, 3];

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
    0: {
      sections: [
        {
          heading: "YOUR RIGHT",
          text: "None here. Neither of us will ask the other for a number, and neither of us will ask the other to explain back what they heard.",
          boldPhrases: ["None here."],
        },
        {
          heading: "MY PROMISE",
          text: "I'll talk with you, and I'll assume we understood each other.",
          boldPhrases: ["assume"],
        },
      ],
    },
    1: {
      sections: [
        {
          heading: "YOUR RIGHT",
          text: "At any point you may ask how well I think I understood the intended meaning behind what you said. You may also give me your own number for how well you think I understood you.",
          boldPhrases: ["you may ask", "your own number"],
        },
        {
          heading: "MY PROMISE",
          text: "None. I may answer, or I may not. I'm not committing to explain back what I heard. Asking is always allowed.",
          boldPhrases: ["None.", "Asking is always allowed."],
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
    level: 0,
    label: "Just talk",
    tradeoff: "Most comfortable. We may both leave assuming we understood each other.",
  },
  {
    level: 1,
    label: "You may ask",
    tradeoff: "Asking is allowed. Answering is not promised.",
  },
  {
    level: 2,
    label: "Explain back",
    tradeoff: "You hear what I understood, so you can correct it. Slower.",
  },
  {
    level: 3,
    label: "Reveal the gap",
    tradeoff: "We put a number on it and take the lower one. Least comfortable, most honest.",
  },
];

export interface MeetingTermsSection {
  heading: string;
  /** Rendered body with emphasis — the display form. */
  body: ReactNode;
  /**
   * The same body as plain text, read from the SAME source constant the body
   * renders from. Exists so a test can assert the page shows the real pledge
   * text rather than a paraphrase of it, without scraping the DOM.
   */
  plainText: string;
}

/** Sections for a pledge-sourced level (2 and 3), read straight from PLEDGE_VERSIONS. */
function pledgeSourcedSections(version: PledgeVersion): MeetingTermsSection[] {
  const v = PLEDGE_VERSIONS[version];
  const sections: MeetingTermsSection[] = [
    {
      heading: v.yourRight.heading,
      body: <YourRightTextTailwind version={version} />,
      plainText: v.yourRight.text,
    },
    {
      heading: v.myPromise.heading,
      body: <MyPromiseTextTailwind version={version} />,
      plainText: v.myPromise.text,
    },
  ];
  // Version 1 has no exception clause; every version this page uses does, but the
  // registry's type union includes v1, so the guard is real rather than defensive.
  if ("exception" in v) {
    sections.push({
      heading: v.exception.heading,
      body: <ExceptionTextTailwind version={version} />,
      plainText: v.exception.text,
    });
  }
  return sections;
}

export function sectionsForLevel(level: MeetingTermsLevel): MeetingTermsSection[] {
  if (level === 2 || level === 3) {
    return pledgeSourcedSections(PLEDGE_SOURCE[level]);
  }
  return MEETING_TERMS_OWN_COPY[CURRENT_MEETING_TERMS_VERSION][level].sections.map(
    (s) => ({
      heading: s.heading,
      body: <OathText text={s.text} boldPhrases={s.boldPhrases} variant="tailwind" />,
      plainText: s.text,
    }),
  );
}

/** Exported for tests: the pledge version each pledge-sourced level must render. */
export const MEETING_TERMS_PLEDGE_SOURCE = PLEDGE_SOURCE;
