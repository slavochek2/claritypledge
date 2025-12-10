import { ReactNode } from "react";

/**
 * Centralized pledge text content with versioning support.
 * Single source of truth for all pledge wording across the application.
 *
 * Version 1: "The Understanding Pledge" - Original pledge text (renamed from Clarity Pledge)
 * Version 2: "The Understanding Pledge" - Updated pledge text (Dec 2024)
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
    title: "The Understanding Pledge",
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
} as const;

export type PledgeVersion = keyof typeof PLEDGE_VERSIONS;

// Default to current version (v2)
export const CURRENT_PLEDGE_VERSION: PledgeVersion = 2;

// ============================================================================
// PLAIN TEXT VERSIONS (backwards compatible - defaults to v2)
// ============================================================================

export const PLEDGE_TEXT = {
  title: PLEDGE_VERSIONS[2].title,
  subtitle: PLEDGE_VERSIONS[2].subtitle,
  header: PLEDGE_VERSIONS[2].header,
  commitmentIntro: PLEDGE_VERSIONS[2].commitmentIntro,
  yourRight: PLEDGE_VERSIONS[2].yourRight,
  myPromise: PLEDGE_VERSIONS[2].myPromise,
  exception: PLEDGE_VERSIONS[2].exception,
} as const;

// ============================================================================
// JSX VERSIONS (with bold formatting for React components)
// Supports versioning via optional `version` parameter
// ============================================================================

/**
 * "Your Right" section with bold formatting.
 * Used in certificates and pledge displays.
 */
export function YourRightText({ version = 2 }: { version?: PledgeVersion }): ReactNode {
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
  // Version 2
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
export function YourRightTextTailwind({ version = 2 }: { version?: PledgeVersion }): ReactNode {
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
  // Version 2
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
export function MyPromiseText({ version = 2 }: { version?: PledgeVersion }): ReactNode {
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
  // Version 2
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

/**
 * "My Promise" section with Tailwind bold classes.
 * Used in components with Tailwind styling.
 */
export function MyPromiseTextTailwind({ version = 2 }: { version?: PledgeVersion }): ReactNode {
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
  // Version 2
  return (
    <>
      I will <span className="font-bold">explain back</span> what I think you
      meant—<span className="font-bold">without judgment or criticism</span>—so
      you can confirm or correct me. I{" "}
      <span className="font-bold">won't pretend to understand</span> if I don't.
    </>
  );
}

/**
 * "The Exception" section - only exists in version 2.
 */
export function ExceptionText(): ReactNode {
  return (
    <>
      If I can't keep this promise in the moment, I'll explain why.
    </>
  );
}

/**
 * "The Exception" section with Tailwind - only exists in version 2.
 */
export function ExceptionTextTailwind(): ReactNode {
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
