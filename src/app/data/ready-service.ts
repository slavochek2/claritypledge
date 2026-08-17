/**
 * @file ready-service.ts
 * @description P1083 — read/write for `/ready`'s always-visible distribution.
 * Ephemeral, no auth, no identity: see docs/technical/database.md#ready_submissions.
 */
import { supabase } from '@/lib/supabase';

/** Bounds worst-case dot-rendering cost independent of the accepted no-rate-limiting
 * write-side risk (spec's Risks: spam has no payoff given the coarse visualization) —
 * that call was about INSERT abuse, not about how many absolutely-positioned dots a
 * single page load renders. 200 is comfortably above the "~N=20-50" range the spec's
 * own visualization research cites as the pattern's graceful-degradation ceiling. */
const MAX_DISTRIBUTION_ROWS = 200;

/** Values of other respondents in the current retention window. Empty on any failure — a
 * distribution-fetch failure fails silently to the empty state, per the spec. */
export async function getReadyDistribution(): Promise<number[]> {
  try {
    // order() matters as much as limit() here: without it, Postgres is free to
    // return an arbitrary 200 rows once the window holds more than that — in
    // practice the OLDEST 200 via the created_at index, which is the opposite of
    // "right now" and can make a visitor's own just-written value never appear
    // (adversarial review finding, 2026-08-17).
    const { data, error } = await supabase
      .from('ready_submissions')
      .select('value')
      .order('created_at', { ascending: false })
      .limit(MAX_DISTRIBUTION_ROWS);
    if (error || !data) return [];
    return data.map((row) => row.value as number);
  } catch {
    return [];
  }
}

/** Fire-and-forget: never blocks or gates Continue, same as P1077's own write-nothing stance.
 * Catches both a Supabase `{error}` response and a rejected promise (network failure) — an
 * unhandled rejection here would surface as a console error unrelated to anything the
 * visitor did, since this call is never awaited by its caller. */
export function submitReadyValue(value: number): void {
  supabase
    .from('ready_submissions')
    .insert({ value })
    .then(({ error }) => {
      if (error) console.error('[ready] submission failed:', error);
    })
    .catch((error) => {
      console.error('[ready] submission failed:', error);
    });
}
