/**
 * Shared, versioned oath body for the verified-understanding model.
 *
 * Single source of truth for the oath text that is applied:
 * - unilaterally as the Clarity Pledge (PLEDGE_VERSIONS — see pledge-text.tsx)
 * - bilaterally as the Clarity Partner Agreement (AGREEMENT_VERSIONS — P857)
 *
 * Each consumer keeps its own framing (title / intro / signatures) around this
 * identical first-person body. The body stays first-person so the directional
 * min ("the lower of our two numbers") is unambiguous in both applications.
 *
 * Edit a version here once → the pledge and the agreement converge automatically.
 * Deploys stay independent: each registry references this constant separately.
 *
 * Version 4: number-first commitment (verified understanding). The intentional
 * version gap (no shared v1–v3) keeps the pledge and the agreement on the same
 * version key from v4 onward.
 */

export const VERIFIED_UNDERSTANDING_OATH = {
  4: {
    yourRight: {
      heading: "YOUR RIGHT",
      text: "When we speak, please feel free to ask how well I assume I cognitively understand the intention behind what you say.",
    },
    myPromise: {
      heading: "MY PROMISE",
      text: "I'll give you an honest number, from 0 (not at all) to 10 (I assume I fully understand you). At any time you can give me your own number, for how much you assume I cognitively understand you.\n\nIf I explain back what I understood, without judging or criticizing, you can tell me what I missed, and ask me to explain it back again.\n\nI'll accept the lower of our two numbers as my verified understanding of your intention.",
    },
    exception: {
      heading: "THE EXCEPTION",
      text: "If I can't give you an honest number in the moment, I'll explain why.",
    },
  },
} as const;

export type VerifiedUnderstandingOathVersion =
  keyof typeof VERIFIED_UNDERSTANDING_OATH;
