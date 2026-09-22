/**
 * P1345 — deleteTestUser must fail loudly when a delete fails.
 *
 * It used to console.warn on a failed profile delete and carry on, and ignored the two
 * pre-clean results entirely, so stranded test users accumulated unseen. The admin client
 * is mocked: each table's delete resolves to the error configured for it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Err = { message: string } | null;
let errors: Record<string, Err> = {};
let authError: { status?: number; message: string } | null = null;

// Playwright's test.info() throws outside a Playwright test; soft is what an in-test failure uses.
const soft = vi.fn(() => ({ toBeTruthy: () => {} }));
let inPlaywright = false;
vi.mock('@playwright/test', () => ({
  test: { info: () => { if (!inPlaywright) throw new Error('not in a test'); return {}; } },
  expect: { soft: (...a: unknown[]) => soft(...a) },
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
vi.mock('../../e2e/helpers/supabase-admin', () => {
  const result = (table: string) => Promise.resolve({ error: errors[table] ?? null });
  return {
    supabaseAdmin: {
      from: (table: string) => ({
        delete: () => ({
          or: () => result(table),
          eq: () => result(table),
        }),
      }),
      auth: { admin: { deleteUser: () => Promise.resolve({ error: authError }) } },
    },
  };
});

const { deleteTestUser } = await import('../../e2e/helpers/test-user');

describe('P1345 deleteTestUser', () => {
  beforeEach(() => {
    errors = {};
    inPlaywright = false;
    soft.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authError = null;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('resolves when every delete succeeds', async () => {
    await expect(deleteTestUser('u-1')).resolves.toBeUndefined();
  });

  it('resolves when the auth user is already gone (404 stays idempotent)', async () => {
    authError = { status: 404, message: 'User not found' };
    await expect(deleteTestUser('u-1')).resolves.toBeUndefined();
  });

  it('rejects, naming the step, when the profile delete fails', async () => {
    errors.profiles = { message: 'violates foreign key constraint' };
    await expect(deleteTestUser('u-1')).rejects.toThrow(/deleteTestUser\(u-1\) failed at profile delete: violates foreign key/);
  });

  it('rejects when the story_verifications pre-clean fails', async () => {
    errors.story_verifications = { message: 'permission denied' };
    await expect(deleteTestUser('u-1')).rejects.toThrow(/story_verifications pre-clean/);
  });

  it('rejects when the stories pre-clean fails', async () => {
    errors.stories = { message: 'trigger raised' };
    await expect(deleteTestUser('u-1')).rejects.toThrow(/stories pre-clean/);
  });

  it('inside a Playwright test: does NOT throw (later cleanup still runs) but soft-fails the test', async () => {
    inPlaywright = true;
    errors.profiles = { message: 'violates foreign key constraint' };
    await expect(deleteTestUser('u-1')).resolves.toBeUndefined();
    expect(soft).toHaveBeenCalledTimes(1);
    expect(String(soft.mock.calls[0][1])).toMatch(/failed at profile delete/);
  });

  it('inside a Playwright test: every failing step is reported, not just the first', async () => {
    inPlaywright = true;
    errors.stories = { message: 'trigger raised' };
    errors.profiles = { message: 'fk' };
    await deleteTestUser('u-1');
    expect(soft).toHaveBeenCalledTimes(2);
  });
});
