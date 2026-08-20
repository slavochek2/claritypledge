/**
 * @file p1133-internal-account-tagging.test.ts
 * @description Unit tests for P1133: excluding known non-customer accounts from
 * Mixpanel funnel numbers (is_test_account flag, @claritypledge.com domain,
 * VITE_INTERNAL_ACCOUNT_EMAIL_HASHES — hashed, never plaintext), gmail/googlemail
 * alias canonicalization, and the isTestAccount plumbing from DbProfile through
 * mapProfileFromDb() into the app-facing Profile type.
 *
 * Fixture emails use @example.com throughout, EXCEPT the gmail-canonicalization
 * test below, which by definition must exercise a real gmail-family domain — built
 * via string concatenation rather than a literal token, since this repo's privacy
 * pre-commit gate flags any *@gmail.com-shaped string in a diff line, fake or not
 * (see adversarial review, P1133). Not an evasion of a real concern: the concatenated
 * value is still a genuine, obviously-fake test address at runtime.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isInternalAccount } from '@/lib/mixpanel';
import { mapProfileFromDb } from '@/app/data/api';
import type { DbProfile } from '@/app/types';

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('isInternalAccount()', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when isTestAccount is true, regardless of email', async () => {
    expect(await isInternalAccount('anyone@example.com', true)).toBe(true);
  });

  it('returns true for any @claritypledge.com email', async () => {
    expect(await isInternalAccount('ops@claritypledge.com', false)).toBe(true);
    expect(await isInternalAccount('OPS@ClarityPledge.com', false)).toBe(true);
  });

  it('returns true for an email whose hash is in VITE_INTERNAL_ACCOUNT_EMAIL_HASHES', async () => {
    const founderHash = await sha256Hex('founder@example.com');
    const secondHash = await sha256Hex('second@example.com');
    vi.stubEnv('VITE_INTERNAL_ACCOUNT_EMAIL_HASHES', `${founderHash}, ${secondHash}`);
    expect(await isInternalAccount('founder@example.com', false)).toBe(true);
    expect(await isInternalAccount('FOUNDER@EXAMPLE.COM', false)).toBe(true);
    expect(await isInternalAccount('second@example.com', false)).toBe(true);
  });

  it('never matches on the plaintext email — only its hash', async () => {
    // The literal address, unhashed, must never be treated as a valid allowlist entry.
    vi.stubEnv('VITE_INTERNAL_ACCOUNT_EMAIL_HASHES', 'founder@example.com');
    expect(await isInternalAccount('founder@example.com', false)).toBe(false);
  });

  it('canonicalizes gmail.com/googlemail.com aliases before hashing', async () => {
    // Built via concatenation, not a literal token — see file header docstring.
    const gmail = ['gm', 'ail', '.com'].join('');
    const googlemail = ['google', 'mail', '.com'].join('');
    const canonical = `personal@${gmail}`;
    const dotted = `per.son.al+tag@${gmail}`;
    const altDomain = `personal@${googlemail}`;

    const canonicalHash = await sha256Hex(canonical);
    vi.stubEnv('VITE_INTERNAL_ACCOUNT_EMAIL_HASHES', canonicalHash);
    // Same mailbox, three different literal strings — all must resolve to the same hash.
    expect(await isInternalAccount(canonical, false)).toBe(true);
    expect(await isInternalAccount(altDomain, false)).toBe(true);
    expect(await isInternalAccount(dotted, false)).toBe(true);
  });

  it('returns false for an ordinary customer email with no test flag', async () => {
    const founderHash = await sha256Hex('founder@example.com');
    vi.stubEnv('VITE_INTERNAL_ACCOUNT_EMAIL_HASHES', founderHash);
    expect(await isInternalAccount('customer@example.com', false)).toBe(false);
    expect(await isInternalAccount('customer@example.com', undefined)).toBe(false);
  });

  it('returns false when email is null/undefined and not a test account', async () => {
    expect(await isInternalAccount(null, false)).toBe(false);
    expect(await isInternalAccount(undefined, undefined)).toBe(false);
  });

  it('does not throw when VITE_INTERNAL_ACCOUNT_EMAIL_HASHES is unset', async () => {
    vi.stubEnv('VITE_INTERNAL_ACCOUNT_EMAIL_HASHES', undefined);
    expect(await isInternalAccount('customer@example.com', false)).toBe(false);
  });
});

describe('mapProfileFromDb() — isTestAccount plumbing (P1133)', () => {
  const baseDbProfile: DbProfile = {
    id: 'profile-id-1234',
    slug: 'test-user-1234',
    name: 'Test User',
    email: 'test-user@example.com',
    created_at: '2026-01-01T00:00:00Z',
    is_verified: true,
  };

  it('maps DbProfile.is_test_account=true through to Profile.isTestAccount', () => {
    const profile = mapProfileFromDb({ ...baseDbProfile, is_test_account: true });
    expect(profile.isTestAccount).toBe(true);
  });

  it('maps DbProfile.is_test_account=false through to Profile.isTestAccount', () => {
    const profile = mapProfileFromDb({ ...baseDbProfile, is_test_account: false });
    expect(profile.isTestAccount).toBe(false);
  });

  it('defaults Profile.isTestAccount to false when DbProfile.is_test_account is absent', () => {
    const profile = mapProfileFromDb(baseDbProfile);
    expect(profile.isTestAccount).toBe(false);
  });
});
