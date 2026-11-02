/**
 * P1536 real-model eval: the one place that decides whether a run may start. The eval writes to no database (the engine's database calls are
 * faked), so "TEST only" means: the environment names no prod Supabase project, and the Gemini key is not one a prod environment file holds.
 * It FAILS CLOSED: when it cannot show the key is not a prod key (no prod environment file could be read, or it holds no values), it refuses.
 * A key held only in a store this script cannot read (the keychain, a hosted secret) is not covered: use a key issued for the eval (/ai-keys).
 * Returns the reason to refuse, or null. A reason never contains the key.
 */

const PROD_REF = 'besjtuodziykmjidubzw';
const URL_VARS = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_TEST_URL', 'SUPABASE_PROD_URL'];

export interface GuardInput {
  key: string;
  env: Record<string, string | undefined>;
  /** Every value found in the prod environment files (never logged); null when no such file could be read. */
  prodValues: readonly string[] | null;
}

export function refuseNonTest({ key, env, prodValues }: GuardInput): string | null {
  if (!key) return 'no key: EVAL_GEMINI_KEY is empty or not set';
  for (const name of URL_VARS) {
    try {
      if (new URL(env[name] ?? '').hostname === `${PROD_REF}.supabase.co`) return `refusing: ${name} names the prod project`;
    } catch { /* not set, or not a URL: the substring check below still reads it */ }
  }
  // the prod project named anywhere (any variable, with or without a scheme)
  for (const [name, value] of Object.entries(env)) {
    if ((value ?? '').toLowerCase().includes(PROD_REF)) return `refusing: ${name} names the prod project`;
  }
  if (!prodValues || prodValues.length === 0) return 'refusing: no prod environment file could be read, so this cannot show the key is not a prod key';
  if (prodValues.some((v) => v.includes(key))) return 'refusing: this key is one the production environment file holds';
  return null;
}

/**
 * The values of KEY=VALUE lines of an env file: an `export ` prefix, an inline comment (` # ...`) and the quotes around a value are removed. Names are not
 * returned: only values are compared. A value is kept whole, so a key inside a longer value (a URL parameter) is still found by a substring match.
 */
export function envFileValues(text: string): string[] {
  return text.split('\n').map((l) => l.trim().replace(/^export\s+/, '')).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => l.slice(l.indexOf('=') + 1).trim())
    .map((v) => (/^["']/.test(v) ? v.replace(/^(["'])(.*?)\1.*$/, '$2') : v.replace(/\s+#.*$/, '')))
    .map((v) => v.trim()).filter(Boolean);
}
