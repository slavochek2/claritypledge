/**
 * What changed in each terms version, shown in the re-acceptance popup.
 *
 * A returning user asked to accept updated terms must be told what changed, not
 * only handed two long documents. `highlights` are always visible; `details`
 * sit behind "See all changes". Bumping CURRENT_TERMS_VERSION without adding an
 * entry here fails src/tests/terms-change-summary.test.ts.
 *
 * `requiresConsent` picks how returning users are told. false: a dismissible
 * banner (notice; continued use is acceptance). true: the blocking popup, for a
 * change that needs fresh, explicit consent. Bumps are batched into the
 * quarterly terms review, not made per edit (decisions.md 2026-09-14, P1307 D15).
 */
export interface TermsChangeSummary {
  requiresConsent: boolean;
  highlights: string[];
  details: string[];
}

export const TERMS_CHANGES: Record<string, TermsChangeSummary> = {
  'v1.4': {
    // Notice only: the consents this version describes (transcription, recording)
    // are asked at the moment they apply, not through this update.
    requiresConsent: false,
    highlights: [
      'We now name every service that processes your data and where it runs: our main database is in the US, analytics and email in the EU.',
      'We explain how voice audio, transcripts and voice profiles are collected and used.',
      'We disclose that our analytics (Mixpanel) can replay how you use the site.',
    ],
    details: [
      'Letters, explain-backs, events and groups are now covered explicitly.',
      'Machine (agent) accounts are described.',
      'Payment, email and scheduling providers are listed: Stripe, Brevo, Tally, Ghost, YouTube and Google Calendar.',
    ],
  },
};
