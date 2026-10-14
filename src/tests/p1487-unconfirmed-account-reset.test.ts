/**
 * P1487 — every edge function that mints a sign-in link resets an unconfirmed account first.
 *
 * A sign-in link confirms the account it is for. An account that never confirmed its email may
 * still carry whatever its creator set on it, which the link would make live. The shared
 * `resetUnconfirmedAccount` (supabase/functions/_shared/unconfirmed-account.ts) clears that; this
 * file keeps every link-minting function calling it before its first link is minted.
 *
 * STRUCTURAL ONLY: source order, nothing is called. The behaviour is proven live in
 * supabase/functions/_shared/p1487-unconfirmed-account.test.ts and in the create-and-open-letter
 * live suite.
 *
 * Scope is derived (every function whose modules call `auth.admin.generateLink(`), with the five
 * known minting functions asserted present so a narrowed scan cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'path';
import { allFunctionSources } from './helpers/edge-function-source';

const FUNCTIONS = join(resolve(__dirname, '../..'), 'supabase/functions');
const KNOWN = ['create-and-open-letter', 'create-and-sign', 'request-letter-response-signin', 'send-letter-emails', 'send-agreement-emails', 'event-email-link'];

const MINT = 'auth.admin.generateLink(';
const RESET = 'resetUnconfirmedAccount(';

/** Reasons a function's source does not reset before its first mint; empty when it does. */
export function resetGaps(src: string): string[] {
  const mint = src.indexOf(MINT);
  if (mint === -1) return [];
  const reset = src.indexOf(RESET);
  if (reset === -1) return ['mints a sign-in link but never resets an unconfirmed account'];
  if (reset > mint) return ['first sign-in link is minted before the reset'];
  return [];
}

const inScope = allFunctionSources(FUNCTIONS).filter((f) => f.src.includes(MINT));

describe('P1487: link-minting functions reset unconfirmed accounts first', () => {
  it('derives the known link-minting functions into scope', () => {
    const names = inScope.map((f) => f.name);
    for (const k of KNOWN) expect(names, `${k} missing from the derived scope`).toContain(k);
  });

  it('every function in scope resets before it mints', () => {
    for (const { name, src } of inScope) expect(resetGaps(src), name).toEqual([]);
  });

  it('control: both failure shapes are caught', () => {
    expect(resetGaps(`await supabase.${MINT}{})`)).toHaveLength(1);
    expect(resetGaps(`await supabase.${MINT}{}); await ${RESET}a, b, {});`)).toHaveLength(1);
    expect(resetGaps(`await ${RESET}a, b, {}); await supabase.${MINT}{});`)).toEqual([]);
  });
});
