/**
 * What changed in each terms version, shown in the re-acceptance popup.
 *
 * A returning user asked to accept updated terms must be told what changed, not
 * only handed two long documents. `highlights` are always visible; `details`
 * sit behind "See all changes". Bumping CURRENT_TERMS_VERSION without adding an
 * entry here fails src/tests/terms-change-summary.test.ts.
 */
export interface TermsChangeSummary {
  highlights: string[];
  details: string[];
}

export const TERMS_CHANGES: Record<string, TermsChangeSummary> = {
  'v1.4': {
    highlights: [
      'We now name every service that processes your data, including where it is stored (the US).',
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
