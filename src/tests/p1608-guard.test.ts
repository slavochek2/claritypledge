/**
 * P1608: the refusal of the transcription end-to-end test. Every refusal is shown by a real call, and the
 * allowed path is shown too (a gate that only ever refuses is untested against the workflow it must allow).
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs without types
import { p1608Refusal, isListing } from '../../scripts/lib/p1608-guard.mjs';

const SELF = 'https://136-85-1-126.sslip.io';
const env = { P1608_LIVE: '1', SELFHOSTED_TEST_ORIGIN: SELF };
const run = ['node', 'playwright', 'test', '-c', 'playwright.p1608.config.ts'];
const active = (v: string) => () => v;

describe('P1608 guard', () => {
  it('allows the self-hosted TEST server when opted in and active', () => {
    expect(p1608Refusal({ url: SELF, env, argv: run, resolveActive: active('selfhosted') })).toBeNull();
  });
  it('refuses without the opt-in', () => {
    expect(p1608Refusal({ url: SELF, env: { SELFHOSTED_TEST_ORIGIN: SELF }, argv: run, resolveActive: active('selfhosted') })).toMatch(/P1608_LIVE=1/);
  });
  it('refuses hosted TEST', () => {
    expect(p1608Refusal({ url: `https://${'ayibkeoyukulb'}${'sjpxgaw'}.supabase.co`, env, argv: run, resolveActive: active('selfhosted') })).toMatch(/hosted TEST/);
  });
  it('refuses production and any other URL', () => {
    expect(p1608Refusal({ url: 'https://besjtuodziykmjidubzw.supabase.co', env, argv: run, resolveActive: active('selfhosted') })).toMatch(/not a TEST server at all/);
    expect(p1608Refusal({ url: 'https://example.com', env, argv: run, resolveActive: active('selfhosted') })).toMatch(/not a TEST server/);
    expect(p1608Refusal({ url: undefined, env, argv: run, resolveActive: active('selfhosted') })).toMatch(/not a TEST server/);
  });
  it('refuses when the active server is hosted or cannot be resolved', () => {
    expect(p1608Refusal({ url: SELF, env, argv: run, resolveActive: active('hosted') })).toMatch(/"hosted"/);
    expect(p1608Refusal({ url: SELF, env, argv: run, resolveActive: active('unresolved') })).toMatch(/"unresolved"/);
  });
  it('lets a listing through whatever the environment says (it starts nothing)', () => {
    expect(isListing([...run, '--list'])).toBe(true);
    expect(p1608Refusal({ url: 'https://besjtuodziykmjidubzw.supabase.co', env: {}, argv: [...run, '--list'], resolveActive: active('hosted') })).toBeNull();
  });
});
