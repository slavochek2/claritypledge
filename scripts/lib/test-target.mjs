/**
 * test-target.mjs — P1557: the one place that decides "this URL is the TEST database".
 *
 * An exact allowlist of ORIGINS, never a rule: the hosted TEST projects' `https://<ref>.supabase.co`
 * plus, when SELFHOSTED_TEST_ORIGIN is set, that one self-hosted origin. A URL passes only when its
 * origin is in the list, so another scheme, a port, embedded credentials, a host suffix or prefix
 * all fail. Production is never listed, and a self-hosted value that names a supabase.co host is
 * refused, so the env var cannot be used to admit a hosted project.
 *
 * Plain .mjs so scripts can import it as well as the TypeScript helpers (e2e/helpers/e2e-namespace.ts
 * re-exports it). Change the hosted refs here and in the SQL guard (supabase/migrations/*_p1532_*,
 * *_p1557_*), which carries its own copy.
 */

// P1530 moved TEST to a new project; the old ref stays allowed until that project is paused.
export const TEST_PROJECT_REF = 'ayibkeoyukulbsjpxgaw';
export const TEST_PROJECT_REFS = [TEST_PROJECT_REF, 'gfjctyxqlwexxwsmkakq'];
/** The synthetic `ref` claim the self-hosted server signs into its keys (the SQL purge guard checks it). */
export const SELFHOSTED_TEST_REF = 'cpselfhostedtest01';
export const SELFHOSTED_ENV = 'SELFHOSTED_TEST_ORIGIN';

const HOSTED_ORIGINS = TEST_PROJECT_REFS.map((ref) => `https://${ref}.supabase.co`);

/**
 * The self-hosted origin from the env: `{ state: 'unset' }`, `{ state: 'ok', origin }` or
 * `{ state: 'malformed', reason }`. Valid means exactly `https://host`: lowercase host as the URL
 * parser would write it, no port, path, query, fragment or credentials, and not a supabase.co host.
 */
export function selfHostedOrigin(env = process.env) {
  const raw = env[SELFHOSTED_ENV];
  if (raw === undefined || raw === '') return { state: 'unset' };
  let u;
  try { u = new URL(raw); } catch { return { state: 'malformed', reason: 'not a URL' }; }
  if (u.protocol !== 'https:') return { state: 'malformed', reason: 'must be https' };
  if (u.username || u.password) return { state: 'malformed', reason: 'must not carry credentials' };
  if (u.port) return { state: 'malformed', reason: 'must not carry a port' };
  if (u.hostname === 'supabase.co' || u.hostname.endsWith('.supabase.co')) {
    return { state: 'malformed', reason: 'must not be a hosted supabase.co project' };
  }
  if (raw !== u.origin) return { state: 'malformed', reason: `must be exactly ${u.origin} (no path, query or other spelling)` };
  return { state: 'ok', origin: u.origin };
}

/** Why the self-hosted setting cannot be trusted, or null. Callers that need TEST call this and fail loudly. */
export function testTargetConfigError(env = process.env) {
  const s = selfHostedOrigin(env);
  return s.state === 'malformed' ? `${SELFHOSTED_ENV} is set but invalid: ${s.reason}` : null;
}

/** Every origin that counts as TEST right now. A malformed self-hosted value adds nothing. */
export function testOrigins(env = process.env) {
  const s = selfHostedOrigin(env);
  return s.state === 'ok' ? [...HOSTED_ORIGINS, s.origin] : [...HOSTED_ORIGINS];
}

/** The TEST ref for a URL (the hosted ref, or the synthetic self-hosted ref), or null when it is not TEST. */
export function testRefForUrl(url, env = process.env) {
  let u;
  try { u = new URL(url ?? ''); } catch { return null; }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
  if (!testOrigins(env).includes(u.origin)) return null;
  const hosted = TEST_PROJECT_REFS.find((ref) => u.origin === `https://${ref}.supabase.co`);
  return hosted ?? SELFHOSTED_TEST_REF;
}

/** True only for a URL whose origin is exactly a TEST origin. A path after the origin is allowed. */
export function isTestProjectUrl(url, env = process.env) {
  return testRefForUrl(url, env) !== null;
}

/** True when the URL is TEST and is one of the hosted projects (the only ones with a Management API). */
export function isHostedTestUrl(url, env = process.env) {
  const ref = testRefForUrl(url, env);
  return ref !== null && TEST_PROJECT_REFS.includes(ref);
}
