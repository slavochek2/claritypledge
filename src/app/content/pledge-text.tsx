import { ReactNode } from "react";
import { VERIFIED_UNDERSTANDING_OATH } from "./verified-understanding-oath";
import { OathText } from "./oath-emphasis";

/**
 * Centralized pledge text content with versioning support.
 * Single source of truth for all pledge wording across the application.
 *
 * Version 1: "The Clarity Pledge" - Original pledge text
 * Version 2: "The Clarity Pledge" - Updated pledge text
 * Version 3: "The Clarity Pledge" - "without" → "withholding" judgment
 *            More honest language acknowledging humans HAVE judgments but commit
 *            to withholding them during the reflect-back moment.
 * Version 4: number-first commitment (verified understanding). The oath body is
 *            the shared VERIFIED_UNDERSTANDING_OATH constant (also used by the
 *            Clarity Partner Agreement); the pledge keeps its unilateral framing.
 *
 * Used by:
 * - ProfileCertificate (profile page display)
 * - PledgeCard (landing page card)
 * - SignPledgeForm (sign up flow)
 * - ExportCertificate (image export)
 */

// ============================================================================
// VERSIONED PLEDGE CONTENT
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components
export const PLEDGE_VERSIONS = {
  1: {
    title: "The Clarity Pledge",
    subtitle: "A Public Promise",
    commitmentIntro: (name: string) =>
      `I, ${name}, hereby commit to everyone—including strangers, people I disagree with, and even those I dislike:`,
    yourRight: {
      heading: "YOUR RIGHT",
      text: "When we talk, if you need to check whether I understood your idea in the way you meant it, please ask me to explain back to you how I understood it.",
    },
    myPromise: {
      heading: "MY PROMISE",
      text: "I promise to try to explain back what I think you meant without judgment or criticism so you can confirm or correct my understanding. Crucially, I promise not to pretend I understand your idea if I don't. If I cannot follow this promise, I will explain why.",
    },
  },
  2: {
    title: "The Clarity Pledge",
    subtitle: "A Public Promise",
    header: "We all crave being understood. Let's commit to listen.",
    commitmentIntro: (name: string) =>
      `I, ${name}, hereby commit to everyone—including strangers, people I disagree with, and even those I dislike:`,
    yourRight: {
      heading: "YOUR RIGHT",
      text: "When we speak, if you need to know I truly understand you, please ask me to mirror back what I heard.",
    },
    myPromise: {
      heading: "MY PROMISE",
      text: "I will explain back what I think you meant—without judgment or criticism—so you can confirm or correct me. I won't pretend to understand if I don't.",
    },
    exception: {
      heading: "THE EXCEPTION",
      text: "If I can't keep this promise in the moment, I'll explain why.",
    },
  },
  3: {
    title: "The Clarity Pledge",
    subtitle: "A Public Promise",
    header: "We all crave being understood. Let's commit to listen.",
    commitmentIntro: (name: string) =>
      `I, ${name}, hereby commit to everyone—including strangers, people I disagree with, and even those I dislike:`,
    yourRight: {
      heading: "YOUR RIGHT",
      text: "When we speak, if you need to know I truly understand you, please ask me to mirror back what I heard.",
    },
    myPromise: {
      heading: "MY PROMISE",
      text: "I will explain back what I think you meant—withholding judgment or criticism—so you can confirm or correct me. I won't pretend to understand if I don't.",
    },
    exception: {
      heading: "THE EXCEPTION",
      text: "If I can't keep this promise in the moment, I'll explain why.",
    },
  },
  4: {
    title: "The Clarity Pledge",
    subtitle: "A Public Promise",
    header: "We all crave being understood. Let's commit to listen.",
    commitmentIntro: (name: string) =>
      `I, ${name}, hereby commit to everyone—including strangers, people I disagree with, and even those I dislike:`,
    // Oath body is the shared, versioned constant (also used by the agreement).
    yourRight: VERIFIED_UNDERSTANDING_OATH[4].yourRight,
    myPromise: VERIFIED_UNDERSTANDING_OATH[4].myPromise,
    exception: VERIFIED_UNDERSTANDING_OATH[4].exception,
  },
  5: {
    title: "The Clarity Pledge",
    subtitle: "A Public Promise",
    header: "We all crave being understood. Let's commit to listen.",
    commitmentIntro: (name: string) =>
      `I, ${name}, hereby commit to everyone—including strangers, people I disagree with, and even those I dislike:`,
    // P928: "intention" → "intended meaning". Oath body is the shared, versioned
    // constant (also used by the agreement) — edit it once, both surfaces converge.
    yourRight: VERIFIED_UNDERSTANDING_OATH[5].yourRight,
    myPromise: VERIFIED_UNDERSTANDING_OATH[5].myPromise,
    exception: VERIFIED_UNDERSTANDING_OATH[5].exception,
  },
} as const;

export type PledgeVersion = keyof typeof PLEDGE_VERSIONS;

// Default to current version. This is the single intended lever — every
// default-rendering surface and write path resolves through this constant.
export const CURRENT_PLEDGE_VERSION: PledgeVersion = 5;

// ============================================================================
// PLAIN TEXT VERSIONS (backwards compatible - tracks the current version)
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components
export const PLEDGE_TEXT = {
  title: PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION].title,
  subtitle: PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION].subtitle,
  header: PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION].header,
  commitmentIntro: PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION].commitmentIntro,
  yourRight: PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION].yourRight,
  myPromise: PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION].myPromise,
  exception: PLEDGE_VERSIONS[CURRENT_PLEDGE_VERSION].exception,
} as const;

// ============================================================================
// JSX VERSIONS (with bold formatting for React components)
// Supports versioning via optional `version` parameter (defaults to current)
// ============================================================================

/**
 * "Your Right" section with bold formatting.
 * Used in certificates and pledge displays.
 */
export function YourRightText({ version = CURRENT_PLEDGE_VERSION }: { version?: PledgeVersion }): ReactNode {
  if (version === 1) {
    return (
      <>
        When we talk, if you need to check whether I understood your idea in the
        way you meant it, please ask me to{" "}
        <span style={{ fontWeight: "bold" }}>explain back</span> to you how I
        understood it.
      </>
    );
  }
  if (version === 4 || version === 5) {
    // P857: emphasis single-sourced via the shared constant + <OathText>.
    return (
      <OathText
        text={VERIFIED_UNDERSTANDING_OATH[version].yourRight.text}
        boldPhrases={VERIFIED_UNDERSTANDING_OATH[version].yourRight.boldPhrases}
        variant="inline"
      />
    );
  }
  // Version 2 and 3 (same YOUR RIGHT text)
  return (
    <>
      When we speak, if you need to know I truly understand you, please ask me
      to <span style={{ fontWeight: "bold" }}>mirror back</span> what I heard.
    </>
  );
}

/**
 * "Your Right" section with Tailwind bold classes.
 * Used in components with Tailwind styling.
 */
export function YourRightTextTailwind({ version = CURRENT_PLEDGE_VERSION }: { version?: PledgeVersion }): ReactNode {
  if (version === 1) {
    return (
      <>
        When we talk, if you need to check whether I understood your idea in the
        way you meant it, please ask me to{" "}
        <span className="font-bold">explain back</span> to you how I understood
        it.
      </>
    );
  }
  if (version === 4 || version === 5) {
    // P857: emphasis single-sourced via the shared constant + <OathText>.
    return (
      <OathText
        text={VERIFIED_UNDERSTANDING_OATH[version].yourRight.text}
        boldPhrases={VERIFIED_UNDERSTANDING_OATH[version].yourRight.boldPhrases}
        variant="tailwind"
      />
    );
  }
  // Version 2 and 3 (same YOUR RIGHT text)
  return (
    <>
      When we speak, if you need to know I truly understand you, please ask me
      to <span className="font-bold">mirror back</span> what I heard.
    </>
  );
}

/**
 * "My Promise" section with bold formatting (inline styles).
 * Used in ExportCertificate where inline styles are required.
 */
export function MyPromiseText({ version = CURRENT_PLEDGE_VERSION }: { version?: PledgeVersion }): ReactNode {
  if (version === 1) {
    return (
      <>
        I promise to <span style={{ fontWeight: "bold" }}>try</span> to{" "}
        <span style={{ fontWeight: "bold" }}>explain back</span> what I think you
        meant
        <span style={{ fontWeight: "bold" }}> without judgment or criticism</span>{" "}
        so you can confirm or correct my understanding. Crucially, I{" "}
        <span style={{ fontWeight: "bold" }}>promise not to pretend I understand</span>{" "}
        your idea if I don't. If I cannot follow this promise, I will explain why.
      </>
    );
  }
  if (version === 2) {
    return (
      <>
        I will <span style={{ fontWeight: "bold" }}>explain back</span> what I
        think you meant—
        <span style={{ fontWeight: "bold" }}>without judgment or criticism</span>
        —so you can confirm or correct me. I{" "}
        <span style={{ fontWeight: "bold" }}>won't pretend to understand</span> if
        I don't.
      </>
    );
  }
  if (version === 4 || version === 5) {
    // P857: emphasis single-sourced via the shared constant + <OathText>.
    return (
      <OathText
        text={VERIFIED_UNDERSTANDING_OATH[version].myPromise.text}
        boldPhrases={VERIFIED_UNDERSTANDING_OATH[version].myPromise.boldPhrases}
        variant="inline"
      />
    );
  }
  // Version 3
  return (
    <>
      I will <span style={{ fontWeight: "bold" }}>explain back</span> what I
      think you meant—
      <span style={{ fontWeight: "bold" }}>withholding judgment or criticism</span>
      —so you can confirm or correct me. I{" "}
      <span style={{ fontWeight: "bold" }}>won't pretend to understand</span> if
      I don't.
    </>
  );
}

/**
 * "My Promise" section with Tailwind bold classes.
 * Used in components with Tailwind styling.
 */
export function MyPromiseTextTailwind({ version = CURRENT_PLEDGE_VERSION }: { version?: PledgeVersion }): ReactNode {
  if (version === 1) {
    return (
      <>
        I promise to <span className="font-bold">try</span> to{" "}
        <span className="font-bold">explain back</span> what I think you meant
        <span className="font-bold"> without judgment or criticism</span> so you
        can confirm or correct my understanding. Crucially, I{" "}
        <span className="font-bold">promise not to pretend I understand</span>{" "}
        your idea if I don't. If I cannot follow this promise, I will explain why.
      </>
    );
  }
  if (version === 2) {
    return (
      <>
        I will <span className="font-bold">explain back</span> what I think you
        meant—<span className="font-bold">without judgment or criticism</span>—so
        you can confirm or correct me. I{" "}
        <span className="font-bold">won't pretend to understand</span> if I don't.
      </>
    );
  }
  if (version === 4 || version === 5) {
    // P857: emphasis single-sourced via the shared constant + <OathText>.
    return (
      <OathText
        text={VERIFIED_UNDERSTANDING_OATH[version].myPromise.text}
        boldPhrases={VERIFIED_UNDERSTANDING_OATH[version].myPromise.boldPhrases}
        variant="tailwind"
      />
    );
  }
  // Version 3
  return (
    <>
      I will <span className="font-bold">explain back</span> what I think you
      meant—<span className="font-bold">withholding judgment or criticism</span>—so
      you can confirm or correct me. I{" "}
      <span className="font-bold">won't pretend to understand</span> if I don't.
    </>
  );
}

/**
 * "The Exception" section - exists in version 2, 3, and 4 (version-aware).
 */
export function ExceptionText({ version = CURRENT_PLEDGE_VERSION }: { version?: PledgeVersion }): ReactNode {
  if (version === 4 || version === 5) {
    // P857: text single-sourced via the shared constant + <OathText>.
    return (
      <OathText
        text={VERIFIED_UNDERSTANDING_OATH[version].exception.text}
        boldPhrases={VERIFIED_UNDERSTANDING_OATH[version].exception.boldPhrases}
        variant="inline"
      />
    );
  }
  return (
    <>
      If I can't keep this promise in the moment, I'll explain why.
    </>
  );
}

/**
 * "The Exception" section with Tailwind - exists in version 2, 3, and 4.
 */
export function ExceptionTextTailwind({ version = CURRENT_PLEDGE_VERSION }: { version?: PledgeVersion }): ReactNode {
  if (version === 4 || version === 5) {
    // P857: text single-sourced via the shared constant + <OathText>.
    return (
      <OathText
        text={VERIFIED_UNDERSTANDING_OATH[version].exception.text}
        boldPhrases={VERIFIED_UNDERSTANDING_OATH[version].exception.boldPhrases}
        variant="tailwind"
      />
    );
  }
  return (
    <>
      If I can't keep this promise in the moment, I'll explain why.
    </>
  );
}

/**
 * Commitment statement intro with bold formatting (inline styles).
 */
export function CommitmentIntroText({ name }: { name: string }): ReactNode {
  return (
    <>
      I, <span style={{ fontWeight: "bold" }}>{name}</span>, hereby commit to{" "}
      <span style={{ fontWeight: "600" }}>everyone</span>
      —including strangers, people I disagree with, and even those I dislike:
    </>
  );
}

/**
 * Commitment statement intro with Tailwind classes.
 */
export function CommitmentIntroTextTailwind({
  name,
}: {
  name: string;
}): ReactNode {
  return (
    <>
      I, <span className="font-bold">{name}</span>, hereby commit to{" "}
      <span className="font-semibold">everyone</span>
      —including strangers, people I disagree with, and even those I dislike:
    </>
  );
}
