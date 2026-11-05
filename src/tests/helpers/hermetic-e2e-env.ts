/**
 * Database settings for the child processes that load the REAL playwright.config.ts (P1642).
 *
 * Those children run `playwright test --list`, which imports every spec. A spec that imports
 * e2e/helpers/supabase-admin.ts throws at load without VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
 * and the P1607 switch refuses any URL that is not the self-hosted TEST origin. A developer machine
 * supplies all of it from the gitignored .env.test.local; CI has no such file, so the tests were red
 * there. These placeholders make the children independent of both. They are not credentials and
 * nothing connects: `--list` loads specs and runs none. dotenv never overrides a variable that is
 * already set, so these also win over a real .env.test.local.
 */
export const HERMETIC_SELFHOSTED_ORIGIN = 'https://test-db.example.org';

export const HERMETIC_E2E_ENV = {
  VITE_SUPABASE_URL: HERMETIC_SELFHOSTED_ORIGIN,
  VITE_SUPABASE_ANON_KEY: 'hermetic-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'hermetic-service-key',
  SELFHOSTED_TEST_ORIGIN: HERMETIC_SELFHOSTED_ORIGIN,
} as const;

/** `base` with the hermetic database settings laid over it. */
export function withHermeticE2eEnv(base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  return { ...base, ...HERMETIC_E2E_ENV };
}
