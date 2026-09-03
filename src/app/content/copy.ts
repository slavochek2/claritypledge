/**
 * @file copy.ts
 * @description Centralized copy/content constants for the application
 */

export const COPY = {
  // Shown as the effective date on /terms-of-service and /privacy-policy. Set it to the day
  // the refreshed documents actually go live (P1219) — publication is gated on P1216 and P520
  // landing first, see features/p1219_terms_and_privacy_policy_refresh.md.
  LEGAL_LAST_UPDATED: "September 3, 2026",
} as const;
