/**
 * @file mirror-limits.ts
 * @description The mirror agent's token budgets and the cost reserved from them, split out of mirror-agent.ts (its size limit).
 * Code and SQL never drift: `_mirror_limits().reply_max_usd` / `reply_session_max_usd` equal reserveReplyUsd(false) / (true)
 * (src/tests/p1547-mirror-budget.test.ts and p1604-mirror-session-budget.test.ts).
 */
/**
 * P1547: ONE budget for the whole request (fixed rules, metadata, escaping and data), in tokens. The
 * reservation is computed from it and the request is refused, never sent, past it.
 */
export const BUDGET_TOKENS = 50_000;
/** Kept as the reservation's input bound (P1520 name). */
export const MAX_IN_TOKENS = BUDGET_TOKENS;
export const MAX_OUT_TOKENS = 1_200; // thinking included (billed as output)
/** A forwarded or Clarified thread is one item capped at 20% of the budget. */
export const COPY_ITEM_TOKENS = Math.floor(BUDGET_TOKENS * 0.2);

/**
 * P1604 (founder-approved interim): a Clarified SESSION thread (a whole transcript) fits a 3-hour session. When such a copy is in the
 * request, and only then: the copy is capped at 60,000 tokens, the whole request at 100,000 and the output at 4,000. Every other
 * request keeps the numbers above. The reservation (reserveReplyUsd(true), and reply_session_max_usd in SQL) uses these same numbers.
 */
export const SESSION_BUDGET_TOKENS = 100_000;
export const SESSION_COPY_ITEM_TOKENS = 60_000;
export const SESSION_MAX_OUT_TOKENS = 4_000;

export interface Limits { budget: number; copyItem: number; maxOut: number }
const STANDARD: Limits = { budget: BUDGET_TOKENS, copyItem: COPY_ITEM_TOKENS, maxOut: MAX_OUT_TOKENS };
const SESSION: Limits = { budget: SESSION_BUDGET_TOKENS, copyItem: SESSION_COPY_ITEM_TOKENS, maxOut: SESSION_MAX_OUT_TOKENS };

/** The request's limits. The server decides (it reserved the cost by the same flag); a missing flag is the standard profile. */
export function limitsFor(run: { session?: boolean | null }): Limits {
  return run.session === true ? SESSION : STANDARD;
}
/** USD per 1M tokens: Gemini's paid-tier rates from 1 Jan 2027, the higher of its two schedules. */
export const PRICE_IN_PER_M = 1.5;
export const PRICE_OUT_PER_M = 7.5;
/** The Mira assistant's margin on a reservation. */
export const RESERVE_MARGIN = 1.25;

export function reserveReplyUsd(session = false): number {
  const l = session ? SESSION : STANDARD;
  const raw = ((l.budget * PRICE_IN_PER_M + l.maxOut * PRICE_OUT_PER_M) / 1e6) * RESERVE_MARGIN;
  return Math.round(raw * 1e6) / 1e6;
}

