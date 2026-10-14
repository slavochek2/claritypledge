/**
 * P1487 — no edge function that acts on an invitation token creates a CONFIRMED account.
 *
 * An invitation token travels by email, but the person who sent the invitation can read it and
 * anyone the link is forwarded to holds it. So holding one proves nothing about owning the
 * invited mailbox. A function that answers it by creating an account with the email already
 * confirmed hands the invited address to whoever presented the token. Accounts made on that
 * path must stay unconfirmed until the recipient opens a link sent to their own address.
 *
 * STRUCTURAL ONLY: reads source text, calls nothing. Behaviour is proven live in
 * supabase/functions/create-and-open-letter/p1487-mailbox-first-signin.test.ts. The
 * credential-in-response rule is src/tests/p1446-invitation-credential-shape.test.ts.
 *
 * Scope is derived: every function whose non-test modules read an invitation token. The two
 * known invitation functions are asserted present so an empty or narrowed scan cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'path';
import { allFunctionSources } from './helpers/edge-function-source';

const REPO = resolve(__dirname, '../..');
const FUNCTIONS = join(REPO, 'supabase/functions');
const KNOWN = ['create-and-open-letter', 'create-and-sign'];

const READS_INVITATION = /\binvitation_token\b|\bget_letter_by_token\b/;

/** Line numbers where an account is created with its email already confirmed. */
export function confirmedAccountCreations(src: string): number[] {
  return [...src.matchAll(/\bemail_confirm\s*:\s*true\b/g)]
    .filter((m) => !/^\s*(\*|\/\/)/.test(src.slice(src.lastIndexOf('\n', m.index!) + 1, m.index)))
    .map((m) => src.slice(0, m.index!).split('\n').length);
}

const inScope = allFunctionSources(FUNCTIONS).filter((f) => READS_INVITATION.test(f.src));

describe('P1487: invitation functions never create a confirmed account', () => {
  it('derives the known invitation functions into scope', () => {
    const names = inScope.map((f) => f.name);
    for (const k of KNOWN) expect(names, `${k} missing from the derived scope`).toContain(k);
  });

  it('no function in scope creates an account with its email already confirmed', () => {
    for (const { name, src } of inScope) {
      expect(confirmedAccountCreations(src), `${name}: email_confirm: true`).toEqual([]);
    }
  });

  it('control: the pre-fix shape is caught, a comment is not', () => {
    const preFix = "const { data } = await supabase.auth.admin.createUser({\n  email,\n  email_confirm: true,\n});";
    expect(confirmedAccountCreations(preFix)).toEqual([3]);
    expect(confirmedAccountCreations('// email_confirm: true was the old shape')).toEqual([]);
    expect(confirmedAccountCreations("createUser({ email, email_confirm: false })")).toEqual([]);
  });
});
