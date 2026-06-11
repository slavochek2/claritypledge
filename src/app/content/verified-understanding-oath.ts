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
 * `boldPhrases` is the single source of EMPHASIS: the exact substrings rendered
 * bold. Both the pledge (PLEDGE_VERSIONS renderers) and the agreement certificate
 * render emphasis from here via the shared <OathText> helper (oath-emphasis.tsx),
 * so the bolded phrases are defined once and can never diverge between surfaces.
 *
 * Version 4: number-first commitment (verified understanding). The intentional
 * version gap (no shared v1–v3) keeps the pledge and the agreement on the same
 * version key from v4 onward.
 * Version 5 (P928): identical to v4 except "intention" → "intended meaning" in
 * YOUR RIGHT and MY PROMISE — aligns the oath with the calibration prompts, which
 * rate the speaker's intended meaning (the message), not their motive. v4 stays
 * intact: existing signers' certificates render their stored version unchanged.
 */

export const VERIFIED_UNDERSTANDING_OATH = {
  4: {
    yourRight: {
      heading: "YOUR RIGHT",
      text: "When we speak, please feel free to ask how well I assume I cognitively understand the intention behind what you say.",
      boldPhrases: ["how well I assume I cognitively understand"],
    },
    myPromise: {
      heading: "MY PROMISE",
      text: "I'll give you an honest number, from 0 (not at all) to 10 (I assume I fully understand you). At any time you can give me your own number, for how much you assume I cognitively understand you.\n\nIf I explain back what I understood, without judging or criticizing, you can tell me what I missed, and ask me to explain it back again.\n\nI'll accept the lower of our two numbers as my verified understanding of your intention.",
      boldPhrases: ["honest number", "without judging or criticizing", "the lower of our two numbers"],
    },
    exception: {
      heading: "THE EXCEPTION",
      text: "If I can't give you an honest number in the moment, I'll explain why.",
      boldPhrases: [],
    },
  },
  5: {
    yourRight: {
      heading: "YOUR RIGHT",
      text: "When we speak, please feel free to ask how well I assume I cognitively understand the intended meaning behind what you say.",
      boldPhrases: ["how well I assume I cognitively understand"],
    },
    myPromise: {
      heading: "MY PROMISE",
      text: "I'll give you an honest number, from 0 (not at all) to 10 (I assume I fully understand you). At any time you can give me your own number, for how much you assume I cognitively understand you.\n\nIf I explain back what I understood, without judging or criticizing, you can tell me what I missed, and ask me to explain it back again.\n\nI'll accept the lower of our two numbers as my verified understanding of your intended meaning.",
      boldPhrases: ["honest number", "without judging or criticizing", "the lower of our two numbers"],
    },
    exception: {
      heading: "THE EXCEPTION",
      text: "If I can't give you an honest number in the moment, I'll explain why.",
      boldPhrases: [],
    },
  },
} as const;

export type VerifiedUnderstandingOathVersion =
  keyof typeof VERIFIED_UNDERSTANDING_OATH;
