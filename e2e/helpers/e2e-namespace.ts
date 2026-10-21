/**
 * @file e2e-namespace.ts
 * @description Which project and which users the e2e cleanup may touch. One home for both, read by
 * the helpers (e2e/helpers/test-user.ts), the sweeper (scripts/sweep-e2e-test-users.ts) and, as SQL,
 * by e2e_purge_test_users (supabase/migrations/20261021120000_p1532_e2e_purge_test_users.sql), which
 * carries its own copy of both values because a migration cannot import this file. Change all three
 * together.
 */

export const TEST_PROJECT_REF = 'gfjctyxqlwexxwsmkakq';

/** Mirrors generateTestEmail() in e2e/helpers/test-user.ts. */
export const E2E_EMAIL = /^e2e-test-\d+-\d+@gmail\.com$/;

/** Exact host match, not a substring: a URL that merely contains the ref must not pass. */
export function isTestProjectUrl(url: string | undefined): boolean {
  try {
    return new URL(url ?? '').hostname === `${TEST_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}
