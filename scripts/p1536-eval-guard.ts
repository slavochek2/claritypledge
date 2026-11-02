/**
 * P1536 real-model eval: the one place that decides whether a run may start. The eval writes to no database (the engine's database calls are
 * faked), so "TEST only" means: the environment names no prod Supabase project, and the Gemini key is not one a prod environment file holds.
 * Returns the reason to refuse, or null. A reason never contains the key.
 */

const PROD_HOST = 'besjtuodziykmjidubzw.supabase.co';
const URL_VARS = ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_TEST_URL', 'SUPABASE_PROD_URL'];

export interface GuardInput {
  key: string;
  env: Record<string, string | undefined>;
  /** Every value found in the prod environment files (never logged). */
  prodValues: readonly string[];
}

export function refuseNonTest({ key, env, prodValues }: GuardInput): string | null {
  if (!key) return 'no key: EVAL_GEMINI_KEY is empty or not set';
  for (const name of URL_VARS) {
    try {
      if (new URL(env[name] ?? '').hostname === PROD_HOST) return `refusing: ${name} names the prod project`;
    } catch { /* not set, or not a URL: nothing to refuse on */ }
  }
  if (prodValues.includes(key)) return 'refusing: this key is one the production environment file holds';
  return null;
}

/** The values of KEY=VALUE lines of an env file (quotes stripped). Names are not returned: only values are compared. */
export function envFileValues(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}
