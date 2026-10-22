/**
 * What changed in each terms version, shown in the re-acceptance popup.
 *
 * A returning user asked to accept updated terms must be told what changed, not
 * only handed two long documents. `headline` is the one visible sentence;
 * `highlights` open on demand behind "Show more". Bumping CURRENT_TERMS_VERSION without adding an
 * entry here fails src/tests/terms-change-summary.test.ts.
 *
 * `requiresConsent` picks how returning users are told. false: a dismissible
 * banner (notice; continued use is acceptance). true: the blocking popup, for a
 * change that needs fresh, explicit consent. Bumps are batched into the
 * quarterly terms review, not made per edit (decisions.md 2026-09-14, P1307 D15).
 */
export interface TermsChangeSummary {
  requiresConsent: boolean;
  headline: string;
  /** At most three plain-language lines; the full documents carry the rest. */
  highlights: string[];
}

export const TERMS_CHANGES: Record<string, TermsChangeSummary> = {
  'v1.5': {
    // Blocking (founder, P1544): reverses the earlier promise that no AI reads a chat. The mirror agent
    // sends recent chat text, other members' messages included, to the Gemini API (privacy.md).
    requiresConsent: true,
    headline: "Your mirror agent can now answer you, using Google's Gemini.",
    highlights: [
      'It reads recent messages from your chats, up to a limit, and only you see its answer.',
      "Other members' mirror agents may read what you post in a chat you share with them.",
      'To object, delete your messages or your account. Leaving a chat does not remove what you posted.',
    ],
  },
  'v1.4': {
    // Blocking (founder): this version newly describes voice profiles, biometric data on
    // a consent basis with no separate prompt of their own (privacy.md), so it asks for
    // explicit acceptance. Later versions default to the banner unless they need consent.
    requiresConsent: true,
    headline: 'We now say clearly who handles your data, including voice and analytics.',
    highlights: [
      'Our analytics can replay how you move around the site.',
      "We list every service that handles your data, and where it's stored (US or EU).",
      'We explain how we use your voice audio and transcripts.',
    ],
  },
};
