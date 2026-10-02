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
  'v1.4': {
    // Notice only: the consents this version describes (transcription, recording)
    // are asked at the moment they apply, not through this update.
    requiresConsent: false,
    headline: 'We now say clearly who handles your data, including voice and analytics.',
    highlights: [
      'Our analytics can replay how you move around the site.',
      "We list every service that handles your data, and where it's stored (US or EU).",
      'We explain how we use your voice audio and transcripts.',
    ],
  },
};
