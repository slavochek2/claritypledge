// P1565: no image generation spends Gemini on a non-prod Supabase project. Keyed on the project
// URL (not on a test-account flag: 191 of 196 TEST requests came from unflagged accounts), and it
// fails closed: an empty or unrecognized URL counts as non-prod. No new secret is needed.
// Dependency-free so Vite tests and Deno both import it.

const PROD_HOST = 'besjtuodziykmjidubzw.supabase.co';

export function isProdProject(supabaseUrl: string | null | undefined): boolean {
  try {
    return new URL(supabaseUrl ?? '').hostname === PROD_HOST;
  } catch {
    return false;
  }
}

/** Prod always; any other project only with ALLOW_NONPROD_IMAGE_GEN=1 (the live P1453 run). */
export function imageGenAllowed(
  supabaseUrl: string | null | undefined,
  env: { ALLOW_NONPROD_IMAGE_GEN?: string | undefined },
): boolean {
  return isProdProject(supabaseUrl) || env.ALLOW_NONPROD_IMAGE_GEN === '1';
}

/** True when this runtime is a non-prod project without the opt-in: callers must skip Gemini. */
export function nonProdImageBlocked(): boolean {
  const env = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env;
  return !imageGenAllowed(env?.get('SUPABASE_URL'), { ALLOW_NONPROD_IMAGE_GEN: env?.get('ALLOW_NONPROD_IMAGE_GEN') });
}

/** Logs a skipped generation with the project host only (never keys, never the full URL). */
export function warnNonProdImageSkipped(): void {
  const raw = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get('SUPABASE_URL');
  let host = 'unset';
  try { host = new URL(raw ?? '').hostname; } catch { /* unset or malformed */ }
  console.warn('P1565: Gemini image generation skipped on non-prod project', { host });
}

/** Deterministic stand-in (64x27 flat grey PNG) that flows through the normal storage path. */
export const PLACEHOLDER_IMAGE: { mimeType: string; data: string } = {
  mimeType: 'image/png',
  data: 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAbCAIAAABDQh69AAAAMklEQVR42u3PQQkAAAgEsOuf7D52MoYIgxVY2nktAgICAgICAgICAgICAgICAgICAgcWyRf0oo3A144AAAAASUVORK5CYII=',
};
