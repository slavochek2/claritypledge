/**
 * P1446 — an invitation function returns a session credential only for an account it has just
 * created.
 *
 * The invitation token travels by email, but the person who sent the invitation can also read
 * it, so presenting it proves nothing about who is presenting. A function that answers a token
 * with a credential for an account that ALREADY exists hands that account to whoever holds the
 * token. The rule this file keeps: in every edge function that puts `hashedToken` in a
 * response, each such response comes after the function's `auth.admin.createUser(` call.
 *
 * STRUCTURAL ONLY. This reads source text in order; it never calls a function and never mints
 * a credential. It catches the regression this spec fixed (an early-return branch that answers
 * with a credential before any account is created) and nothing subtler. Behavioural evidence
 * for the fix is the founder's manual check plus review — see the P1446 spec.
 *
 * Scope is derived (every supabase/functions/<name>/ whose non-test .ts files write a
 * `hashedToken` key — a function may keep its logic in a handler.ts beside index.ts).
 *
 * P1487 tightened the rule for the two known invitation functions: they return no credential
 * at all, so they are asserted ABSENT from the scope — a stricter check than this file's
 * ordering rule, which still applies to any other function that returns a credential.
 */
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'path';
import { allFunctionSources } from './helpers/edge-function-source';

const REPO = resolve(__dirname, '../..');
const FUNCTIONS = join(REPO, 'supabase/functions');
const KNOWN = ['create-and-open-letter', 'create-and-sign'];

/** Byte offsets of every `hashedToken` object key placed in a response. */
export function credentialReturnOffsets(src: string): number[] {
  return [...src.matchAll(/\bhashedToken\s*[:,}]/g)]
    .filter((m) => !/^\s*\*|\/\//.test(src.slice(src.lastIndexOf('\n', m.index!) + 1, m.index)))
    .map((m) => m.index!);
}

export function violations(src: string): string[] {
  const returns = credentialReturnOffsets(src);
  if (returns.length === 0) return [];
  const create = src.indexOf('auth.admin.createUser(');
  if (create === -1) return ['returns hashedToken but never creates an account'];
  return returns
    .filter((at) => at < create)
    .map((at) => `hashedToken returned at line ${src.slice(0, at).split('\n').length}, before createUser`);
}

const allFunctions = allFunctionSources(FUNCTIONS);

const inScope = allFunctions.filter(({ src }) => credentialReturnOffsets(src).length > 0);

describe('P1446: invitation functions return a credential only for a just-created account', () => {
  it('P1487: the known invitation functions return no credential at all', () => {
    const scanned = allFunctions.map((f) => f.name);
    const names = inScope.map((f) => f.name);
    for (const k of KNOWN) {
      expect(scanned, `${k} was not scanned`).toContain(k);
      expect(names, `${k} returns a credential`).not.toContain(k);
    }
  });

  it('every function that returns a credential creates the account first', () => {
    for (const { name, src } of inScope) expect(violations(src), name).toEqual([]);
  });

  it('control: the pre-fix shape (credential in an early branch) is caught', () => {
    const preFix = [
      'if (existingReceiverId) {',
      '  return jsonResponse({ ok: true, hashedToken: x, redirectTo: r });',
      '}',
      'const { data } = await supabase.auth.admin.createUser({ email });',
      'return jsonResponse({ ok: true, hashedToken: y });',
    ].join('\n');
    expect(violations(preFix)).toHaveLength(1);
  });
});
