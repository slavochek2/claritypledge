/**
 * @file p1604-mirror-no-archive.spec.ts
 * @description P1604 (migration 20261104160000): the mirror agent's chat cannot be archived. The real RPC, as a real signed-in person.
 * CONTROL: an ordinary chat still archives and unarchives; the mirror can still be marked unread, and an already archived mirror
 * (seeded by the service role, the state older clients could reach) can still be unarchived.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { signIn, ok, refused, mirrorOf, type SignedIn } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('P1604: the mirror chat is not archivable', () => {
  let a: TestUser, b: TestUser;
  let asA: SignedIn;
  let mirror = '';
  let dm = '';

  test.beforeAll(async () => {
    a = await createTestUser({ name: 'P1604 Mirror A' });
    b = await createTestUser({ name: 'P1604 Mirror B' });
    asA = await signIn(a);
    mirror = await mirrorOf(asA);
    const [lo, hi] = [a.user.id, b.user.id].sort();
    const { data } = await supabaseAdmin.from('chat_conversations').insert({ kind: 'dm', dm_user_a: lo, dm_user_b: hi }).select('id').single();
    dm = data!.id;
  });

  test.afterAll(async () => {
    if (dm) await supabaseAdmin.from('chat_conversations').delete().eq('id', dm);
    for (const u of [a, b]) if (u?.user?.id) { try { await deleteTestUser(u.user.id); } catch { /* ignore */ } }
  });

  const archived = async (conv: string) => {
    const { data } = await supabaseAdmin.from('chat_member_state').select('archived').eq('conversation_id', conv).eq('profile_id', a.user.id).maybeSingle();
    return data?.archived ?? false;
  };

  test('archiving the mirror is refused, and nothing is stored', async () => {
    await refused(asA.client.rpc('set_chat_state', { p_conversation: mirror, p_archived: true }), 'archive the mirror');
    expect(await archived(mirror)).toBe(false);
  });

  test('CONTROL: an ordinary chat archives and unarchives', async () => {
    await ok(asA.client.rpc('set_chat_state', { p_conversation: dm, p_archived: true }), 'archive a dm');
    expect(await archived(dm)).toBe(true);
    await ok(asA.client.rpc('set_chat_state', { p_conversation: dm, p_archived: false }), 'unarchive a dm');
    expect(await archived(dm)).toBe(false);
  });

  test('the mirror can still be marked unread; an already archived mirror can be unarchived', async () => {
    await ok(asA.client.rpc('set_chat_state', { p_conversation: mirror, p_manual_unread: true }), 'mark the mirror unread');
    await supabaseAdmin.from('chat_member_state').upsert({ conversation_id: mirror, profile_id: a.user.id, archived: true }, { onConflict: 'conversation_id,profile_id' });
    expect(await archived(mirror)).toBe(true);
    await ok(asA.client.rpc('set_chat_state', { p_conversation: mirror, p_archived: false }), 'unarchive the mirror');
    expect(await archived(mirror)).toBe(false);
  });
});
