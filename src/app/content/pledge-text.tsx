import { ReactNode } from "react";

/**
 * Centralized pledge text content.
 * Single source of truth for all pledge wording across the application.
 *
 * Used by:
 * - ProfileCertificate (profile page display)
 * - PledgeCard (landing page card)
 * - SignPledgeForm (sign up flow)
 * - ExportCertificate (image export)
 */

// ============================================================================
// PLAIN TEXT VERSIONS (for accessibility, SEO, or non-React contexts)
// ============================================================================

export const PLEDGE_TEXT = {
  title: "The Clarity Pledge",
  subtitle: "A Public Promise",

  /** Commitment intro - requires name interpolation */
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
} as const;

// ============================================================================
// JSX VERSIONS (with bold formatting for React components)
// ============================================================================

/**
 * "Your Right" section with bold formatting.
 * Used in certificates and pledge displays.
 */
export function YourRightText(): ReactNode {
  return (
    <>
      When we talk, if you need to check whether I understood your idea in the
      way you meant it, please ask me to{" "}
      <span style={{ fontWeight: "bold" }}>explain back</span> to you how I
      understood it.
    </>
  );
}

/**
 * "Your Right" section with Tailwind bold classes.
 * Used in components with Tailwind styling.
 */
export function YourRightTextTailwind(): ReactNode {
  return (
    <>
      When we talk, if you need to check whether I understood your idea in the
      way you meant it, please ask me to{" "}
      <span className="font-bold">explain back</span> to you how I understood
      it.
    </>
  );
}

/**
 * "My Promise" section with bold formatting (inline styles).
 * Used in ExportCertificate where inline styles are required.
 */
export function MyPromiseText(): ReactNode {
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

/**
 * "My Promise" section with Tailwind bold classes.
 * Used in components with Tailwind styling.
 */
export function MyPromiseTextTailwind(): ReactNode {
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
