/**
 * @file p1556-contact-code.spec.ts
 * @description Server rules for personal contact codes (supabase/migrations/20261106100000_p1556_contact_codes.sql).
 *
 * THE INVARIANTS (spec P1556): starting a 1:1 is decided on the server; a token is readable only by its owner; a reset
 * code stops starting new chats at once while existing chats stay; block wins over a code in both directions; and a
 * stranger cannot tell blocked from invalid. Every refusal is paired with a control that succeeds where it should.
 */
import { test, expect } from '@playwright/test';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, type TestUser } from '../helpers/test-user';
import { RUN, signIn, anonClient, ok, refused, myChatIds, purgeChatFor, type SignedIn } from '../helpers/test-chat';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

const created: TestUser[] = [];
async function mk(label: string): Promise<TestUser> {
  const u = await createTestUser({ name: `Code${label} ${RUN}` });
  created.push(u);
  return u;
}

// A owns the code. B, C, D, E share nothing with A (no group, event or agreement).
let A: TestUser, B: TestUser, C: TestUser, D: TestUser, E: TestUser;
let sA: SignedIn, sB: SignedIn, sC: SignedIn, sD: SignedIn, sE: SignedIn;
let token: string;

const myCode = (s: SignedIn) => ok<string>(s.client.rpc('get_my_contact_code'), 'read own code');
const redeem = (s: SignedIn, t: string) => s.client.rpc('redeem_contact_code', { p_token: t });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  [A, B, C, D, E] = await Promise.all([mk('A'), mk('B'), mk('C'), mk('D'), mk('E')]);
  [sA, sB, sC, sD, sE] = await Promise.all([signIn(A), signIn(B), signIn(C), signIn(D), signIn(E)]);
  token = await myCode(sA);
});

test.afterAll(async () => {
  test.setTimeout(240_000);
  const ids = created.map((u) => u.user.id);
  await supabaseAdmin.from('contact_code_redemptions').delete().in('owner_id', ids);
  await purgeChatFor(ids);
  for (const u of created) await deleteTestUser(u.user.id);
});

test('a token is 128 bits, stable, and readable only by its owner', async () => {
  expect(token).toMatch(/^[0-9a-f]{32}$/);
  expect(await myCode(sA)).toBe(token);
  // Direct table reads: refused or empty for everyone but the service role, which is the control.
  for (const [who, client] of [['B', sB.client], ['anon', anonClient()]] as const) {
    const { data } = await client.from('contact_codes').select('token');
    expect(data ?? [], `${who} must not read any token`).toHaveLength(0);
  }
  const { data: admin } = await supabaseAdmin.from('contact_codes').select('token').eq('profile_id', A.user.id);
  expect(admin?.[0]?.token).toBe(token);
});

test('signed out, a valid code shows only the owner name; an invalid one shows nothing', async () => {
  const anon = anonClient();
  const rows = await ok<Array<Record<string, unknown>>>(anon.rpc('lookup_contact_code', { p_token: token }), 'anon lookup');
  expect(rows).toHaveLength(1);
  expect(Object.keys(rows[0]).sort()).toEqual(['avatar_color', 'avatar_url', 'name']);
  const { data: prof } = await supabaseAdmin.from('profiles').select('name').eq('id', A.user.id).single();
  expect(rows[0].name).toBe(prof?.name);
  expect(await ok<unknown[]>(anon.rpc('lookup_contact_code', { p_token: 'f'.repeat(32) }), 'anon bad lookup')).toHaveLength(0);
  // Signed out, nothing but the lookup is reachable.
  await refused(anon.rpc('redeem_contact_code', { p_token: token }), 'anon redeem');
  await refused(anon.rpc('get_my_contact_code'), 'anon read code');
  await refused(anon.rpc('reset_my_contact_code'), 'anon reset');
  const { data: led } = await anon.from('contact_code_redemptions').select('id');
  expect(led ?? []).toHaveLength(0);
  // A signed-in person blocked by the owner sees nothing, exactly as for a made-up code.
  await ok(sA.client.rpc('block_user', { p_other: E.user.id }), 'A blocks E');
  expect(await ok<unknown[]>(sE.client.rpc('lookup_contact_code', { p_token: token }), 'blocked lookup')).toHaveLength(0);
  await ok(sA.client.rpc('unblock_user', { p_other: E.user.id }), 'A unblocks E');
  expect(await ok<unknown[]>(sE.client.rpc('lookup_contact_code', { p_token: token }), 'unblocked lookup')).toHaveLength(1);
});

test('a stranger opening the code gets a 1:1 with the owner, and opening it again returns the same chat', async () => {
  // Control: the ordinary path still refuses these two, so the code is what lets B in.
  await refused(sB.client.rpc('start_dm', { p_other: A.user.id }), 'B start_dm without a connection');
  const conv = await ok<string>(redeem(sB, token), 'B redeems A code');
  expect(await ok<string>(redeem(sB, token), 'B redeems again')).toBe(conv);
  expect(await myChatIds(sA.client)).toContain(conv);
  expect(await myChatIds(sB.client)).toContain(conv);
  const { count } = await supabaseAdmin.from('contact_code_redemptions').select('id', { count: 'exact', head: true }).eq('owner_id', A.user.id);
  expect(count).toBe(1);
});

test('opening your own code is refused with its own reason', async () => {
  const err = await refused(redeem(sA, token), 'A redeems own code');
  expect(err.message).toContain('contact code: own code');
});

test('reset: the old code starts nothing, the new one works, and an existing chat stays', async () => {
  const bChat = await ok<string>(redeem(sB, token), 'B chat before reset');
  const fresh = await ok<string>(sA.client.rpc('reset_my_contact_code'), 'A resets');
  expect(fresh).not.toBe(token);
  const err = await refused(redeem(sC, token), 'C redeems the OLD code');
  expect(err.message).toContain('contact code: not available');
  expect(await myChatIds(sB.client)).toContain(bChat);
  await ok<string>(redeem(sC, fresh), 'C redeems the NEW code');
  token = fresh;
});

test('block wins in both directions, with the same message as an invalid code', async () => {
  const invalid = await refused(redeem(sD, 'e'.repeat(32)), 'D redeems a made-up code');
  await ok(sA.client.rpc('block_user', { p_other: D.user.id }), 'A blocks D');
  const ownerBlocked = await refused(redeem(sD, token), 'D redeems after A blocked D');
  expect(ownerBlocked.message).toBe(invalid.message);
  await ok(sA.client.rpc('unblock_user', { p_other: D.user.id }), 'A unblocks D');
  await ok(sD.client.rpc('block_user', { p_other: A.user.id }), 'D blocks A');
  const scannerBlocked = await refused(redeem(sD, token), 'D redeems after D blocked A');
  expect(scannerBlocked.message).toBe(invalid.message);
  await ok(sD.client.rpc('unblock_user', { p_other: A.user.id }), 'D unblocks A');
  // Control: with no block, D gets in.
  await ok<string>(redeem(sD, token), 'D redeems with no block');
});

test('the owner-side limit pauses a code after 20 new chats in a day', async () => {
  const { data: conv } = await supabaseAdmin.from('chat_conversations').select('id').eq('kind', 'dm').eq('created_by', B.user.id).limit(1);
  const convId = conv?.[0]?.id as string;
  const { count: already } = await supabaseAdmin.from('contact_code_redemptions').select('id', { count: 'exact', head: true }).eq('owner_id', A.user.id);
  const filler = Array.from({ length: 20 - (already ?? 0) }, () => ({ owner_id: A.user.id, redeemer_id: B.user.id, conversation_id: convId }));
  if (filler.length) await supabaseAdmin.from('contact_code_redemptions').insert(filler);
  const err = await refused(redeem(sE, token), 'E redeems a paused code');
  expect(err.message).toContain('contact code: paused');
  // An existing chat still opens past the limit (B already has one).
  await ok<string>(redeem(sB, token), 'B reopens past the limit');
});

test('an agent account has no code and cannot be reached by one', async () => {
  const F = await mk('F');
  const sF = await signIn(F);
  const fToken = await myCode(sF); // made while F is still a person
  // Control first: while F is a person, F's code works (C has no chat with F yet).
  await ok<string>(redeem(sC, fToken), 'C redeems F code while F is a person');
  // An agent row cannot be deleted directly (trg_guard_agent_account_delete, P1104); deleting F in afterAll cascades it.
  const { error: insErr } = await supabaseAdmin.from('agent_accounts').insert({ profile_id: F.user.id, subject_key: `p1556-${RUN}`, operator_name: 'P1556 test' });
  expect(insErr).toBeNull();
  {
    const err = await refused(sF.client.rpc('get_my_contact_code'), 'agent reads a code');
    expect(err.message).toContain('contact code: not available');
    await refused(sF.client.rpc('reset_my_contact_code'), 'agent resets a code');
    expect(await ok<unknown[]>(anonClient().rpc('lookup_contact_code', { p_token: fToken }), 'anon looks up the agent code')).toHaveLength(0);
    const r = await refused(redeem(sE, fToken), 'E redeems the agent code');
    expect(r.message).toContain('contact code: not available');
  }
});

test('exact handle finds a profile; Message only where a 1:1 is allowed; blocked people are not found', async () => {
  const found = await ok<Array<{ id: string; can_message: boolean }>>(sB.client.rpc('find_profile_by_handle', { p_handle: A.slug.toUpperCase() }), 'B finds A by handle');
  expect(found[0]?.id).toBe(A.user.id);
  expect(found[0]?.can_message).toBe(true); // B has a 1:1 with A
  const none = await ok<Array<{ id: string; can_message: boolean }>>(sE.client.rpc('find_profile_by_handle', { p_handle: A.slug }), 'E finds A');
  expect(none[0]?.can_message).toBe(false); // no 1:1, no shared connection
  expect(await ok<boolean>(sE.client.rpc('can_message_profile', { p_other: A.user.id }), 'E can message A')).toBe(false);
  expect(await ok<unknown[]>(sB.client.rpc('find_profile_by_handle', { p_handle: A.slug.slice(0, -2) }), 'partial handle')).toHaveLength(0);
  await ok(sA.client.rpc('block_user', { p_other: E.user.id }), 'A blocks E');
  expect(await ok<unknown[]>(sE.client.rpc('find_profile_by_handle', { p_handle: A.slug }), 'E finds A after block')).toHaveLength(0);
  await ok(sA.client.rpc('unblock_user', { p_other: E.user.id }), 'A unblocks E');
});
