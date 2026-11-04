/**
 * P1487: the ONE terms version the server accepts with a request. Mirrors CURRENT_TERMS_VERSION
 * in src/lib/constants.ts (the only version the client sends); a superseded version is refused,
 * so an acceptance can never be recorded against old terms. Bump both together — the parity test
 * src/tests/p1487-terms-version-single-source.test.ts fails when they, or the
 * consume_pending_terms_acceptance migration, disagree.
 */
export const SERVER_CURRENT_TERMS_VERSION = 'v1.7';

export function isCurrentTermsVersion(v: unknown): v is typeof SERVER_CURRENT_TERMS_VERSION {
  return v === SERVER_CURRENT_TERMS_VERSION;
}

/**
 * P1592: the versions whose acceptance INCLUDES the mirror consent, which is what the mirror
 * functions (mirror-reply, mirror-portrait) gate on. v1.6 and v1.7 are notice versions: v1.6 changed where
 * transcription text goes and v1.7 added canvas drafting, and neither asked for anything new about the mirror consent, so a person who accepted
 * v1.5 already gave the mirror consent v1.5 asked for. A later BLOCKING version must reset this
 * list to its own version alone. Deliberately separate from SERVER_CURRENT_TERMS_VERSION: the
 * invitation functions keep the single-version rule (P1487), and the parity tests keep meaning
 * "the one version the client sends".
 */
export const MIRROR_CONSENT_VERSIONS: readonly string[] = ['v1.5', 'v1.6', SERVER_CURRENT_TERMS_VERSION];

export function hasMirrorConsentVersion(v: unknown): boolean {
  return typeof v === 'string' && MIRROR_CONSENT_VERSIONS.includes(v);
}
