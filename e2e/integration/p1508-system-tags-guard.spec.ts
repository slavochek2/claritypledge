/**
 * @file p1508-system-tags-guard.spec.ts
 * @description P1508: system tags (box tags included) are written only by privileged roles.
 *
 * Every client-role write is exercised the way an attacker would send it — a direct
 * PostgREST call with a signed-in user's JWT, not through the app's services (which hard-code
 * `system_tags: []` and would prove nothing). Covers points and stories, INSERT and UPDATE.
 *
 * Controls that must stay green:
 *   - a client insert with an empty `system_tags` still works (the app's own path)
 *   - service_role can set system tags on insert and update (the P1508 seed)
 *   - the story → point st-tag sync trigger still writes point system tags
 *
 * Every assertion reads the persisted row back via service role.
 * Runs against the TEST DB via .env.test.local: npx playwright test --project=integration p1508
 */

import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';

function makeAnonClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function makeUserClient(accessToken: string) {
  return createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}

// Unique per worker run: cleanup deletes by this marker, so it must never match another run's rows.
const TAG = `p1508guard${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;

async function storedPointTags(id: string): Promise<string[] | null> {
  const { data } = await supabaseAdmin.from('points').select('system_tags').eq('id', id).maybeSingle();
  return (data?.system_tags as string[] | undefined) ?? null;
}

async function storedStoryTags(id: string): Promise<string[] | null> {
  const { data } = await supabaseAdmin.from('stories').select('system_tags').eq('id', id).maybeSingle();
  return (data?.system_tags as string[] | undefined) ?? null;
}

test.describe('P1508: system tags are written only by privileged roles', () => {
  test.describe.configure({ timeout: 90_000 });

  let user: TestUser;
  let userId: string;
  let userClient: SupabaseClient;

  test.beforeAll(async () => {
    user = await createTestUser({ name: 'P1508 Guard User' });
    userId = user.user.id;
    const { data, error } = await makeAnonClient().auth.signInWithPassword({
      email: user.email,
      password: TEST_PASSWORD,
    });
    if (error || !data.session) throw new Error(`[P1508] sign-in failed: ${error?.message}`);
    userClient = makeUserClient(data.session.access_token);
  });

  test.afterAll(async () => {
    // Points outlive their author (first_validator_id is ON DELETE SET NULL): remove this
    // spec's rows by their marker first, so no `st7` or box-tagged point is stranded on test.
    const { data: pts } = await supabaseAdmin.from('points').select('id').like('statement', `${TAG} %`);
    const ids = (pts ?? []).map(p => p.id as string);
    if (ids.length) {
      await supabaseAdmin.from('story_points').delete().in('point_id', ids);
      await supabaseAdmin.from('points').delete().in('id', ids);
    }
    if (userId) await supabaseAdmin.from('stories').delete().eq('author_id', userId).like('content', `${TAG} %`);
    if (userId) await deleteTestUser(userId);
  });

  // R9: a canvas's reserved `canvas_<name>` tag is a system tag too.
  for (const forged of [['canvas:problem'], ['canvas_claritypledge'], ['understanding'], ['st3', 'v2'], ['misunderstanding']]) {
    test(`signed-in point INSERT with system_tags ${JSON.stringify(forged)} is refused`, async () => {
      const statement = `${TAG} forged insert ${forged.join(',')} ${Date.now()}`;
      const { data, error } = await userClient.from('points').insert({
        statement, first_validator_id: userId, visibility: 'public', tags: [TAG], system_tags: forged,
      }).select('id');
      expect(error, 'the write must be refused').not.toBeNull();
      expect(data).toBeNull();
      const { data: rows } = await supabaseAdmin.from('points').select('id').eq('statement', statement);
      expect(rows ?? []).toHaveLength(0);
    });
  }

  test('signed-in point INSERT with empty system_tags still works (the app path)', async () => {
    const { data, error } = await userClient.from('points').insert({
      statement: `${TAG} clean insert ${Date.now()}`, first_validator_id: userId, visibility: 'public',
      tags: [TAG], system_tags: [],
    }).select('id').single();
    expect(error).toBeNull();
    expect(await storedPointTags(data!.id)).toEqual([]);
  });

  // Defense in depth: `points` has no client UPDATE policy, so RLS stops this before the
  // trigger does. The trigger's UPDATE branch is proven by the story UPDATE below.
  test('signed-in point UPDATE of system_tags does not persist', async () => {
    const { data: pt, error } = await userClient.from('points').insert({
      statement: `${TAG} update target ${Date.now()}`, first_validator_id: userId, visibility: 'public',
      tags: [TAG],
    }).select('id').single();
    expect(error).toBeNull();
    await userClient.from('points').update({ system_tags: ['canvas:problem', 'canvas_claritypledge'] }).eq('id', pt!.id);
    expect(await storedPointTags(pt!.id)).toEqual([]);
  });

  test('signed-in story INSERT with system_tags is refused; empty still works', async () => {
    const forgedContent = `${TAG} forged story ${Date.now()}`;
    const forged = await userClient.from('stories').insert({
      content: forgedContent, author_id: userId, visibility: 'public', system_tags: ['st1'],
    }).select('id');
    expect(forged.error, 'the write must be refused').not.toBeNull();
    const { data: rows } = await supabaseAdmin.from('stories').select('id').eq('content', forgedContent);
    expect(rows ?? []).toHaveLength(0);

    const clean = await userClient.from('stories').insert({
      content: `${TAG} clean story ${Date.now()}`, author_id: userId, visibility: 'public',
    }).select('id').single();
    expect(clean.error).toBeNull();

    await userClient.from('stories').update({ system_tags: ['understanding'] }).eq('id', clean.data!.id);
    expect(await storedStoryTags(clean.data!.id)).toEqual([]);
  });

  // Defense in depth: RLS refuses an anonymous INSERT on its own; the trigger also covers `anon`.
  test('anonymous point INSERT with system_tags is refused', async () => {
    const statement = `${TAG} anon insert ${Date.now()}`;
    const { error } = await makeAnonClient().from('points').insert({
      statement, first_validator_id: userId, visibility: 'public', system_tags: ['canvas:problem'],
    });
    expect(error).not.toBeNull();
    const { data: rows } = await supabaseAdmin.from('points').select('id').eq('statement', statement);
    expect(rows ?? []).toHaveLength(0);
  });

  test('service role still sets system tags on insert and update (the seed path)', async () => {
    const { data: pt, error } = await supabaseAdmin.from('points').insert({
      statement: `${TAG} service insert ${Date.now()}`, first_validator_id: userId, visibility: 'public',
      tags: [TAG], system_tags: ['canvas:problem'],
    }).select('id').single();
    expect(error).toBeNull();
    expect(await storedPointTags(pt!.id)).toEqual(['canvas:problem']);

    const upd = await supabaseAdmin.from('points').update({ system_tags: ['canvas:cost'] }).eq('id', pt!.id);
    expect(upd.error).toBeNull();
    expect(await storedPointTags(pt!.id)).toEqual(['canvas:cost']);
  });

  test('the story → point st-tag sync trigger still writes point system tags', async () => {
    const { data: pt } = await supabaseAdmin.from('points').insert({
      statement: `${TAG} sync target ${Date.now()}`, first_validator_id: userId, visibility: 'public', tags: [TAG],
    }).select('id').single();
    const { data: st } = await supabaseAdmin.from('stories').insert({
      content: `${TAG} sync story ${Date.now()}`, author_id: userId, visibility: 'public',
    }).select('id').single();
    const link = await supabaseAdmin.from('story_points').insert({ story_id: st!.id, point_id: pt!.id, author_id: userId });
    expect(link.error).toBeNull();
    const upd = await supabaseAdmin.from('stories').update({ system_tags: ['st7'] }).eq('id', st!.id);
    expect(upd.error).toBeNull();
    expect(await storedPointTags(pt!.id)).toContain('st7');
  });
});
