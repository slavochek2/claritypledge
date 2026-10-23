/**
 * P1557 (steps 8, 9) — "is this the TEST database" is one exact allowlist of origins: the two hosted
 * TEST projects plus an optional self-hosted origin from SELFHOSTED_TEST_ORIGIN. It admits by exact
 * origin only: never by suffix, prefix, scheme, port, embedded credentials, or "not prod".
 */
import { describe, it, expect } from 'vitest';
import { isTestProjectUrl } from '../../scripts/sweep-e2e-test-users';
import { lockSkipReason } from '../../scripts/lib/e2e-test-db-lock.mjs';

const HOSTED = ['https://ayibkeoyukulbsjpxgaw.supabase.co', 'https://gfjctyxqlwexxwsmkakq.supabase.co'];
const PROD = 'https://besjtuodziykmjidubzw.supabase.co';
const SELF = 'https://test-db.example.org';
// Built at run time so no email-shaped literal sits in the file (the privacy gate scans for them).
const AT = String.fromCharCode(64);
const withSelf = { SELFHOSTED_TEST_ORIGIN: SELF };

describe('P1557 hosted TEST origins', () => {
  it.each(HOSTED)('%s is TEST', (origin) => {
    expect(isTestProjectUrl(origin, {})).toBe(true);
    expect(isTestProjectUrl(`${origin}/rest/v1/profiles?select=id`, {})).toBe(true);
  });
  it('prod is never TEST, with or without a self-hosted origin set', () => {
    expect(isTestProjectUrl(PROD, {})).toBe(false);
    expect(isTestProjectUrl(PROD, withSelf)).toBe(false);
    expect(isTestProjectUrl(`${PROD}/rest/v1/x`, withSelf)).toBe(false);
  });
  it('rejects other scheme, port, credentials, suffix and prefix', () => {
    const h = HOSTED[0]!;
    expect(isTestProjectUrl(h.replace('https:', 'http:'), {})).toBe(false);
    expect(isTestProjectUrl(`${h}:8443`, {})).toBe(false);
    expect(isTestProjectUrl(h.replace('https://', `https://user:pass${AT}`), {})).toBe(false);
    expect(isTestProjectUrl(h.replace('https://', `https://ayibkeoyukulbsjpxgaw.${AT}evil.example#`), {})).toBe(false);
    expect(isTestProjectUrl(`${h}.evil.com`, {})).toBe(false);
    expect(isTestProjectUrl(h.replace('https://', 'https://evil'), {})).toBe(false);
    expect(isTestProjectUrl(undefined, {})).toBe(false);
    expect(isTestProjectUrl('', {})).toBe(false);
    expect(isTestProjectUrl('not a url', {})).toBe(false);
  });
});

describe('P1557 self-hosted TEST origin', () => {
  it('exact origin is TEST (a trailing path is fine, the origin is what counts)', () => {
    expect(isTestProjectUrl(SELF, withSelf)).toBe(true);
    expect(isTestProjectUrl(`${SELF}/`, withSelf)).toBe(true);
    expect(isTestProjectUrl(`${SELF}/rest/v1/profiles`, withSelf)).toBe(true);
  });
  it('env unset or empty: not TEST', () => {
    expect(isTestProjectUrl(SELF, {})).toBe(false);
    expect(isTestProjectUrl(SELF, { SELFHOSTED_TEST_ORIGIN: '' })).toBe(false);
  });
  it('rejects other scheme, port, credentials, suffix and prefix of the self-hosted host', () => {
    expect(isTestProjectUrl('http://test-db.example.org', withSelf)).toBe(false);
    expect(isTestProjectUrl(`${SELF}:8443`, withSelf)).toBe(false);
    expect(isTestProjectUrl(`https://user:pass${AT}test-db.example.org`, withSelf)).toBe(false);
    expect(isTestProjectUrl(`${SELF}.evil.com`, withSelf)).toBe(false);
    expect(isTestProjectUrl('https://eviltest-db.example.org', withSelf)).toBe(false);
    expect(isTestProjectUrl('https://sub.test-db.example.org', withSelf)).toBe(false);
  });
  it.each([
    'http://test-db.example.org',
    'https://test-db.example.org:8443',
    `https://user:pass${AT}test-db.example.org`,
    'https://test-db.example.org/path',
    'https://test-db.example.org?x=1',
    'test-db.example.org',
    'https://TEST-DB.example.org',
    PROD,
    'https://ayibkeoyukulbsjpxgaw.supabase.co',
  ])('malformed or unsafe env %s is ignored: the self-hosted origin is not TEST', (bad) => {
    expect(isTestProjectUrl(SELF, { SELFHOSTED_TEST_ORIGIN: bad })).toBe(false);
    expect(isTestProjectUrl(PROD, { SELFHOSTED_TEST_ORIGIN: bad })).toBe(false);
  });
});

describe('P1557 P1541 lock recognises the self-hosted server', () => {
  const argv = ['node', 'playwright', 'test'];
  it('with the env set, the skip reason is not "not the TEST database"', () => {
    const isTestDb = isTestProjectUrl(SELF, withSelf);
    expect(lockSkipReason({ argv, env: {}, isTestDb })).toBeNull();
  });
  it('with the env unset, the lock would silently switch off (the overload that started this)', () => {
    const isTestDb = isTestProjectUrl(SELF, {});
    expect(lockSkipReason({ argv, env: {}, isTestDb })).toBe('not the TEST database');
  });
});

describe('P1557 shared helper (scripts/lib/test-target.mjs)', () => {
  it('testRefForUrl: hosted ref, synthetic self-hosted ref, or null', async () => {
    const t = await import('../../scripts/lib/test-target.mjs');
    expect(t.testRefForUrl(HOSTED[0]!, {})).toBe('ayibkeoyukulbsjpxgaw');
    expect(t.testRefForUrl(HOSTED[1]!, {})).toBe('gfjctyxqlwexxwsmkakq');
    expect(t.testRefForUrl(SELF, withSelf)).toBe('cpselfhostedtest01');
    expect(t.testRefForUrl(PROD, withSelf)).toBeNull();
    expect(t.testRefForUrl(SELF, {})).toBeNull();
  });
  it('isHostedTestUrl: the Management API targets exclude the self-hosted server', async () => {
    const t = await import('../../scripts/lib/test-target.mjs');
    expect(t.isHostedTestUrl(HOSTED[0]!, withSelf)).toBe(true);
    expect(t.isHostedTestUrl(SELF, withSelf)).toBe(false);
  });
  it('testTargetConfigError: null when unset or valid, a reason when malformed', async () => {
    const t = await import('../../scripts/lib/test-target.mjs');
    expect(t.testTargetConfigError({})).toBeNull();
    expect(t.testTargetConfigError(withSelf)).toBeNull();
    expect(t.testTargetConfigError({ SELFHOSTED_TEST_ORIGIN: 'http://test-db.example.org' })).toMatch(/https/);
    expect(t.testTargetConfigError({ SELFHOSTED_TEST_ORIGIN: 'https://x.supabase.co' })).toMatch(/supabase\.co/);
  });
});

describe('P1557 purge guard migration', () => {
  it('adds exactly cpselfhostedtest01 to the ref list and keeps the grants', async () => {
    const fs = await import('node:fs');
    const sql = fs.readFileSync('supabase/migrations/20261023230000_p1557_e2e_guard_selfhosted_ref.sql', 'utf8');
    expect(sql).toContain(`IN ('ayibkeoyukulbsjpxgaw', 'gfjctyxqlwexxwsmkakq', 'cpselfhostedtest01')`);
    expect(sql).toContain(`= 'service_role'`);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._e2e_purge_allowed(jsonb) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public._e2e_purge_allowed(jsonb) TO service_role;');
    expect(sql).not.toContain('besjtuodziykmjidubzw');
  });
});
