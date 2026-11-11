/**
 * P1666: the complete set of VITE_* values a unit run sees. vite.config.ts passes it as `test.env`
 * and strips every other VITE_* key, and the P1666 canary asserts the run sees exactly these keys.
 * A unit test that needs another value stubs it itself (`vi.stubEnv`); it never comes from an env
 * file or a shell export, which exist on one machine and not in CI.
 *
 * Plain data with no imports: vite.config.ts loads this file before vitest starts.
 */
export const UNIT_TEST_ENV: Readonly<Record<string, string>> = {
  // Prevent supabase.ts from throwing at module load in test environments.
  // Actual Supabase calls are mocked at the service level in each test.
  VITE_SUPABASE_URL: 'http://localhost:54321',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
};
