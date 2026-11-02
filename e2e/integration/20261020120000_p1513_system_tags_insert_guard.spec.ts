/**
 * @file 20261020120000_p1513_system_tags_insert_guard.spec.ts
 * @description Migration integration test for P1513: the system_tags write guard must cover
 * INSERT, not only UPDATE (P630 guard was BEFORE UPDATE only).
 *
 * Exercises the real REST surface with a signed-in user client (the attack path), and the
 * service-role path (which must keep working). Stored values are read back via service role.
 *
 * Runs against the TEST DB via .env.test.local.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

const FORGED = ['understanding', 'st3', 'v2'];

test.describe('P1513: system_tags insert guard', () => {
  test.describe.configure({ timeout: 60_000 });

  let user: TestUser;
  let userId: string;
  let userClient: SupabaseClient;
  const pointIds: string[] = [];
  const storyIds: string[] = [];

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1513 Insert Guard User' });
    userId = user.user.id;
    const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.auth.signInWithPassword({ email: user.email, password: TEST_PASSWORD });
    if (error || !data.session) throw new Error(`[P1513] sign-in failed: ${error?.message}`);
    userClient = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  test.afterAll(async () => {
    if (pointIds.length) await supabaseAdmin.from('points').delete().in('id', pointIds);
    if (storyIds.length) await supabaseAdmin.from('stories').delete().in('id', storyIds);
    if (userId) await deleteTestUser(userId);
  });

  async function storedTags(table: 'points' | 'stories', id: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin.from(table).select('system_tags').eq('id', id).single();
    expect(error, `read-back ${table}: ${error?.message}`).toBeNull();
    return (data as { system_tags: string[] }).system_tags;
  }

  // 42501 alone is not enough: an RLS denial has the same code and would pass with the guard gone.
  function expectGuardRejection(error: { code: string; message: string }) {
    expect(error.code, `rejection code: ${error.message}`).toBe('42501');
    expect(error.message).toBe('system_tags are set by the system only');
  }

  test('verified user INSERT of a point with system_tags stores none', async () => {
    const { data, error } = await userClient
      .from('points')
      .insert({
        statement: `P1513 forged point ${Date.now()}`,
        first_validator_id: userId,
        system_tags: FORGED,
      })
      .select('id')
      .single();
    // Spec allows reject OR strip; either way nothing forged may be stored.
    if (error) {
      expectGuardRejection(error);
    } else {
      pointIds.push(data!.id);
      expect(await storedTags('points', data!.id)).toEqual([]);
    }
  });

  test('verified user INSERT of a story with system_tags stores none', async () => {
    const { data, error } = await userClient
      .from('stories')
      .insert({
        author_id: userId,
        content: `P1513 forged story ${Date.now()}`,
        system_tags: FORGED,
        visibility: 'private',
      })
      .select('id')
      .single();
    if (error) {
      expectGuardRejection(error);
    } else {
      storyIds.push(data!.id);
      expect(await storedTags('stories', data!.id)).toEqual([]);
    }
  });

  test('service-role INSERT still stores system_tags (points and stories)', async () => {
    const p = await supabaseAdmin
      .from('points')
      .insert({ statement: `P1513 service point ${Date.now()}`, first_validator_id: userId, system_tags: FORGED })
      .select('id')
      .single();
    expect(p.error, `service point insert: ${p.error?.message}`).toBeNull();
    pointIds.push(p.data!.id);
    expect(await storedTags('points', p.data!.id)).toEqual(expect.arrayContaining(['understanding', 'st3', 'v2']));

    const s = await supabaseAdmin
      .from('stories')
      .insert({ author_id: userId, content: `P1513 service story ${Date.now()}`, system_tags: ['st3'], visibility: 'private' })
      .select('id')
      .single();
    expect(s.error, `service story insert: ${s.error?.message}`).toBeNull();
    storyIds.push(s.data!.id);
    expect(await storedTags('stories', s.data!.id)).toContain('st3');
  });

  test('verified user INSERT without system_tags is unaffected', async () => {
    const { data, error } = await userClient
      .from('points')
      .insert({ statement: `P1513 clean point ${Date.now()}`, first_validator_id: userId })
      .select('id')
      .single();
    expect(error, `clean insert: ${error?.message}`).toBeNull();
    pointIds.push(data!.id);
    expect(await storedTags('points', data!.id)).toEqual([]);
  });

  test('verified user INSERT of a story without system_tags is unaffected', async () => {
    const { data, error } = await userClient
      .from('stories')
      .insert({ author_id: userId, content: `P1513 clean story ${Date.now()}`, visibility: 'private' })
      .select('id')
      .single();
    expect(error, `clean story insert: ${error?.message}`).toBeNull();
    storyIds.push(data!.id);
    expect(await storedTags('stories', data!.id)).toEqual([]);
  });
});
