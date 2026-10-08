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
 * Scope is derived (every supabase/functions/<name>/index.ts that writes a `hashedToken` key),
 * with the two known invitation functions asserted present so an empty scan cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

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

const inScope = readdirSync(FUNCTIONS)
  .map((name) => ({ name, file: join(FUNCTIONS, name, 'index.ts') }))
  .filter(({ file }) => existsSync(file))
  .map(({ name, file }) => ({ name, src: readFileSync(file, 'utf8') }))
  .filter(({ src }) => credentialReturnOffsets(src).length > 0);

describe('P1446: invitation functions return a credential only for a just-created account', () => {
  it('derives the known invitation functions into scope', () => {
    const names = inScope.map((f) => f.name);
    for (const k of KNOWN) expect(names, `${k} missing from the derived scope`).toContain(k);
  });

  it.each(inScope.map((f) => [f.name, f.src] as const))('%s', (_name, src) => {
    expect(violations(src)).toEqual([]);
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
