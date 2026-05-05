/**
 * @file constants.ts
 * Application-wide constants
 */

// Current terms version - update when Terms or Privacy Policy changes
// Bump this when you make material changes to legal documents
export const CURRENT_TERMS_VERSION = 'v1.3';

export const ACCEPTED_TERMS_VERSIONS = ['v1.2', 'v1.3'] as const;
export type AcceptedTermsVersion = (typeof ACCEPTED_TERMS_VERSIONS)[number];
