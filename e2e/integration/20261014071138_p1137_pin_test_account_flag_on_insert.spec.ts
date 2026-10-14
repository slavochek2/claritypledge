/**
 * @file 20261014071138_p1137_pin_test_account_flag_on_insert.spec.ts
 * @description P1137: is_test_account is server-owned on client-role INSERT, like the other trust
 * columns. Controls: the rest of a client insert is still saved, a service_role insert keeps the
 * value it asks for, and a client UPDATE of the flag is still refused with an error (P571).
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';

test.describe.configure({ mode: 'serial' });

const admin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cleanup: string[] = [];

async function signedIn(email: string): Promise<SupabaseClient> {
  const auth = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(error, `sign-in failed: ${error?.message}`).toBeNull();
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function stored(id: string) {
  const { data, error } = await admin
    .from('profiles')
    .select('name, is_test_account')
    .eq('id', id)
    .maybeSingle();
  expect(error).toBeNull();
  return data as { name: string; is_test_account: boolean } | null;
}

test.afterAll(async () => {
  for (const id of cleanup) await deleteTestUser(id);
});

test.describe('P1137: is_test_account is server-owned on client-role INSERT', () => {
  test('a client-role insert of the caller\'s own row starts unflagged', async () => {
    // A confirmed auth user with no profile row yet (clients cannot delete profiles since P1137).
    const email = generateTestEmail();
    const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
    expect(error).toBeNull();
    const id = data.user!.id;
    cleanup.push(id);
    const client = await signedIn(email);

    const ins = await client.from('profiles').insert({
      id,
      email,
      name: 'P1137 Client Insert',
      slug: `p1137-client-insert-${Date.now()}`,
      is_test_account: true,
    });
    expect(ins.error, ins.error?.message).toBeNull();

    const row = await stored(id);
    expect(row?.name, 'control: the rest of the insert is saved').toBe('P1137 Client Insert');
    expect(row?.is_test_account).toBe(false);
  });

  test('control: a service_role insert keeps the flag it asks for', async () => {
    const email = generateTestEmail();
    const { data, error } = await admin.auth.admin.createUser({ email, password: TEST_PASSWORD, email_confirm: true });
    expect(error).toBeNull();
    cleanup.push(data.user!.id);

    const ins = await admin.from('profiles').insert({
      id: data.user!.id,
      email,
      name: 'P1137 Seeded',
      slug: `p1137-seeded-${Date.now()}`,
      is_test_account: true,
    });
    expect(ins.error, ins.error?.message).toBeNull();
    expect((await stored(data.user!.id))?.is_test_account).toBe(true);
  });

  test('control: a client UPDATE of the flag is still refused with an error', async () => {
    const u = await createTestUser({ email: generateTestEmail() });
    cleanup.push(u.user.id);
    await admin.from('profiles').update({ is_test_account: true }).eq('id', u.user.id);
    const client = await signedIn(u.email);

    const { error } = await client.from('profiles').update({ is_test_account: false }).eq('id', u.user.id);
    expect(error, 'P571 WITH CHECK still refuses the write').not.toBeNull();
    expect((await stored(u.user.id))?.is_test_account).toBe(true);
  });
});
