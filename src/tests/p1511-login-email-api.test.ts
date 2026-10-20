/**
 * P1511: the api.ts adapters under the login form, against a mocked supabase client.
 *   checkLoginEmail — maps the edge function's answer; anything but found/absent/limited is
 *                     `unavailable`, never `absent`.
 *   signInWithEmail — forwards shouldCreateUser: false into signInWithOtp, and leaves it unset
 *                     otherwise (the default path is unchanged).
 */
import { vi, describe, test, expect, beforeEach } from 'vitest';

const invoke = vi.fn();
const signInWithOtp = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, auth: { signInWithOtp: (...a: unknown[]) => signInWithOtp(...a) } },
}));

import { checkLoginEmail, signInWithEmail } from '@/app/data/api';

describe('P1511 checkLoginEmail', () => {
  beforeEach(() => invoke.mockReset());

  test('calls check-login-email with the normalized address', async () => {
    invoke.mockResolvedValue({ data: { result: 'found' }, error: null });
    expect(await checkLoginEmail('  Someone@Example.COM ')).toBe('found');
    expect(invoke).toHaveBeenCalledWith('check-login-email', { body: { email: 'someone@example.com' } });
  });

  for (const r of ['found', 'absent', 'limited'] as const) {
    test(`passes through ${r}`, async () => {
      invoke.mockResolvedValue({ data: { result: r }, error: null });
      expect(await checkLoginEmail('someone@example.com')).toBe(r);
    });
  }

  test('a non-2xx (the 503 unavailable reply) is unavailable', async () => {
    invoke.mockResolvedValue({ data: null, error: { name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code' } });
    expect(await checkLoginEmail('someone@example.com')).toBe('unavailable');
  });

  for (const data of [null, {}, { result: 'yes' }, { result: true }, 'found']) {
    test(`an unexpected body ${JSON.stringify(data)} is unavailable, never absent`, async () => {
      invoke.mockResolvedValue({ data, error: null });
      expect(await checkLoginEmail('someone@example.com')).toBe('unavailable');
    });
  }
});

describe('P1511 signInWithEmail shouldCreateUser', () => {
  beforeEach(() => signInWithOtp.mockReset().mockResolvedValue({ error: null }));

  test('false is forwarded to signInWithOtp', async () => {
    await signInWithEmail('someone@example.com', 'login', { shouldCreateUser: false });
    expect(signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);
  });

  test('absent, the option is not sent (default path unchanged)', async () => {
    await signInWithEmail('someone@example.com', 'login', {});
    expect('shouldCreateUser' in signInWithOtp.mock.calls[0][0].options).toBe(false);
  });
});
