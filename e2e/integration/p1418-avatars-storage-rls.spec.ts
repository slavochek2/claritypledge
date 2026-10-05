/**
 * P1418: the `avatars` bucket is the first one the browser writes to. Each signed-in user may
 * write, list and delete only under their own "<uid>/" folder, and a profile may record
 * avatar_provider = 'upload'. Runs against the test project with two real users.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { supabaseAdmin } from '../helpers/supabase-admin';

const URL = process.env.VITE_SUPABASE_URL!;
const ANON = process.env.VITE_SUPABASE_ANON_KEY!;
const webp = () => new Blob([new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])], { type: 'image/webp' });

async function signedIn(u: TestUser): Promise<SupabaseClient> {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: TEST_PASSWORD });
  if (error) throw error;
  return c;
}

test.describe('P1418 avatars storage RLS', () => {
  test.describe.configure({ timeout: 90_000 });
  let a: TestUser;
  let b: TestUser;

  test.beforeAll(async () => {
    a = await createTestUser({ name: 'P1418 Owner' });
    b = await createTestUser({ name: 'P1418 Other' });
  });

  test.afterAll(async () => {
    for (const u of [a, b]) {
      if (!u) continue;
      const { data } = await supabaseAdmin.storage.from('avatars').list(u.user.id);
      if (data?.length) await supabaseAdmin.storage.from('avatars').remove(data.map((o) => `${u.user.id}/${o.name}`));
      await deleteTestUser(u.user.id);
    }
  });

  test('owner can upload, list and delete in their own folder', async () => {
    const c = await signedIn(a);
    const path = `${a.user.id}/1.webp`;
    expect((await c.storage.from('avatars').upload(path, webp(), { contentType: 'image/webp' })).error).toBeNull();
    const { data: listed } = await c.storage.from('avatars').list(a.user.id);
    expect(listed?.map((o) => o.name)).toContain('1.webp');
    const { data: removed } = await c.storage.from('avatars').remove([path]);
    expect(removed?.length).toBe(1);
  });

  test("a user cannot write into another user's folder", async () => {
    const c = await signedIn(b);
    const { error } = await c.storage
      .from('avatars')
      .upload(`${a.user.id}/evil.webp`, webp(), { contentType: 'image/webp' });
    expect(error).not.toBeNull();
  });

  test("a user cannot delete another user's photo", async () => {
    const owner = await signedIn(a);
    const path = `${a.user.id}/keep.webp`;
    expect((await owner.storage.from('avatars').upload(path, webp(), { contentType: 'image/webp' })).error).toBeNull();
    const other = await signedIn(b);
    await other.storage.from('avatars').remove([path]);
    const { data } = await supabaseAdmin.storage.from('avatars').list(a.user.id);
    expect(data?.map((o) => o.name)).toContain('keep.webp');
  });

  test('the bucket refuses a non-image type', async () => {
    const c = await signedIn(a);
    const { error } = await c.storage
      .from('avatars')
      .upload(`${a.user.id}/x.txt`, new Blob(['hi'], { type: 'text/plain' }), { contentType: 'text/plain' });
    expect(error).not.toBeNull();
  });

  test("a profile can record avatar_provider = 'upload'", async () => {
    const c = await signedIn(a);
    const url = `${URL}/storage/v1/object/public/avatars/${a.user.id}/1.webp`;
    const { error } = await c
      .from('profiles')
      .update({ avatar_url: url, avatar_provider: 'upload' })
      .eq('id', a.user.id);
    expect(error).toBeNull();
    const { data } = await supabaseAdmin
      .from('profiles')
      .select('avatar_url, avatar_provider')
      .eq('id', a.user.id)
      .single();
    expect(data).toEqual({ avatar_url: url, avatar_provider: 'upload' });
  });
});
