/**
 * P1536: the draft request is counted by the model before they are sent (decisions.md, P1547: a local
 * estimate is not a cost bound). `canvas_max_usd` reserves MAX_REQUEST_TOKENS of input; this module makes that true.
 *
 * `build(cap)` makes the whole request with the MATERIAL cut to `cap` estimated tokens; everything else in it (the
 * rules, the current points, the draft so far) is counted too. The model's countTokens (free) decides; over the
 * bound, the material is cut in proportion and counted again. If counting fails it is not tried again for this run
 * and the strict bound (UTF-8 bytes: no tokenizer emits more tokens than bytes) decides, so the request degrades to
 * less material instead of being refused. Refused only when even the request WITHOUT material cannot fit (nothing
 * sent, nothing charged): when the proportional steps run out first, the zero-material request is built and counted,
 * and if it fits the budget is searched between it and the smallest budget known to be over.
 * Pure: no Deno or esm.sh imports.
 */

import { requestBytes, type GeminiRequest, type TokenCounter } from './mirror-agent.ts';
import { DeadlineExceeded } from './canvas-deadline.ts';
import { raceAbort } from './abort-signals.ts';
import { MAX_MATERIAL_TOKENS } from './canvas-draft.ts';

/** The input tokens the reservation assumes (see _mirror_limits canvas_max_usd). */
export const MAX_REQUEST_TOKENS = 63_000;
export const MAX_COUNTS = 5;
export const MAX_BYTE_SHRINKS = 6;

export class RequestTooLarge extends Error {
  constructor() {
    super('canvas request over its input bound');
  }
}

/** A counter that always fails: the byte bound decides. */
export const noCount: TokenCounter = async () => null;

type Built = { request: GeminiRequest };
type Fit<T> = T & { tokens: number; counted: boolean };

/** Extra budgets tried between "fits" and "over" once the proportional steps ran out. */
export const MAX_SEARCH_COUNTS = 6;
export const MAX_SEARCH_BYTES = 14;

/** Shrinks the material budget so the whole request fits; returns what `build` made for the final budget. */
export async function fitRequest<T extends Built>(
  build: (materialTokens: number) => T,
  count: TokenCounter = noCount,
  signal?: AbortSignal,
): Promise<Fit<T>> {
  let counting = true;
  /** One measurement of the request for a budget: the model's count, or the UTF-8 bytes once counting failed. */
  const measure = async (cap: number): Promise<Fit<T>> => {
    if (signal?.aborted) throw new DeadlineExceeded();
    const built = build(cap);
    if (counting) {
      const n = await raceAbort(count(built.request), signal, null); // a count still out when the deadline fires is not waited for
      if (n !== null) return { ...built, tokens: n, counted: true };
      counting = false; // not asked again for this run
    }
    return { ...built, tokens: requestBytes(built.request), counted: false };
  };
  const fits = (m: Fit<T>) => m.tokens <= MAX_REQUEST_TOKENS;

  let cap = MAX_MATERIAL_TOKENS;
  let over = Infinity; // the smallest budget known to be over the bound
  let counts = 0;
  let shrinks = 0;
  for (;;) {
    const m = await measure(cap);
    if (fits(m)) return m;
    over = Math.min(over, cap);
    if (cap <= 0) throw new RequestTooLarge();
    if (m.counted ? ++counts >= MAX_COUNTS : shrinks++ >= MAX_BYTE_SHRINKS) break;
    const room = m.counted ? 0.95 : 0.97; // headroom
    cap = Math.max(0, Math.min(cap - 1, Math.floor((cap * MAX_REQUEST_TOKENS * room) / m.tokens)));
  }

  // The proportional steps ran out. Everything but the material may still fit: try none, then search upward.
  let best = await measure(0);
  if (!fits(best)) throw new RequestTooLarge();
  let lo = 0;
  for (let i = 0; i < (counting ? MAX_SEARCH_COUNTS : MAX_SEARCH_BYTES) && over - lo > 1; i++) {
    const mid = Math.floor((lo + over) / 2);
    const m = await measure(mid);
    if (fits(m)) { best = m; lo = mid; } else over = mid;
  }
  return best;
}
