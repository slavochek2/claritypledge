/**
 * P1487: the ONE terms version the server accepts with a request. Mirrors CURRENT_TERMS_VERSION
 * in src/lib/constants.ts (the only version the client sends); a superseded version is refused,
 * so an acceptance can never be recorded against old terms. Bump both together — the parity test
 * src/tests/p1487-terms-version-single-source.test.ts fails when they, or the
 * consume_pending_terms_acceptance migration, disagree.
 */
export const SERVER_CURRENT_TERMS_VERSION = 'v1.5';

export function isCurrentTermsVersion(v: unknown): v is typeof SERVER_CURRENT_TERMS_VERSION {
  return v === SERVER_CURRENT_TERMS_VERSION;
}
