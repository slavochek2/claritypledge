/**
 * P1487 — invitation pages never call the auth server's own email sign-in from the browser.
 *
 * Opening an emailed sign-in link confirms the account it is for. An account that already exists
 * at an invited address but never confirmed it must be reset before any link can activate it,
 * and only the server can do that (create-and-sign / create-and-open-letter, via
 * _shared/unconfirmed-account.ts). So a page in an invitation flow must ask the server for the
 * link, never call `signInWithOtp` itself.
 *
 * Out of scope on purpose: the general /login and /signup flows (src/app/data/api.ts and the
 * pages that use it). Their equivalent fix is an auth-configuration change recorded as a known
 * limitation in the P1487 spec.
 *
 * STRUCTURAL ONLY. Scope is derived — every non-test source file under src/ that takes part in an
 * invitation flow (it reads an invitation, builds an accept link, or keeps the accept intent) —
 * with the known invitation pages asserted present so a narrowed scan cannot pass.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

const REPO = resolve(__dirname, '../..');
const SRC = join(REPO, 'src');
const KNOWN = [
  'src/app/pages/accept-agreement-page.tsx',
  'src/app/pages/agreement-email-confirmation-page.tsx',
  'src/app/pages/letter-reading-page.tsx',
];
const INVITATION_FLOW = /\/accept\?token=|clarity-pending-accept-|getLetterForReadingByToken|create-and-open-letter|requestAgreementSignIn/;
const CLIENT_OTP = /\bsignInWithOtp\s*\(/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'tests' ? [] : walk(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

const inScope = walk(SRC)
  .map((p) => ({ file: relative(REPO, p), src: readFileSync(p, 'utf8') }))
  .filter(({ src }) => INVITATION_FLOW.test(src));

describe('P1487: invitation flows ask the server for sign-in links', () => {
  it('derives the known invitation pages into scope', () => {
    const files = inScope.map((f) => f.file);
    for (const k of KNOWN) expect(files, `${k} missing from the derived scope`).toContain(k);
  });

  it('no invitation-flow file calls signInWithOtp', () => {
    const offenders = inScope.filter(({ src }) => CLIENT_OTP.test(src)).map((f) => f.file);
    expect(offenders).toEqual([]);
  });

  it('control: the pattern catches a call and ignores the bare word in prose', () => {
    expect(CLIENT_OTP.test('await supabase.auth.signInWithOtp({ email })')).toBe(true);
    expect(CLIENT_OTP.test('never call signInWithOtp itself')).toBe(false);
  });
});
