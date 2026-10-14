/**
 * P1486 — an agreement puts two people in each other's relationship scope only once the partner
 * has accepted it.
 *
 * Runs against the TEST project only (npx playwright test --project=integration
 * e2e/integration/p1486-scope-accepted-agreements-only.spec.ts). Fixtures are created and
 * removed with the service-role client; every write and search under test uses the anon key
 * with a signed-in user's JWT — the same credentials a browser has.
 *
 * Red state: the defect groups fail before the P1486 migration.
 *
 * Controls (must stay green before AND after): every relationship the scope documents —
 * an accepted agreement, active or later ended; letter correspondents in both directions;
 * witnesses in both directions — and the existing exclusion of a pending invitation.
 *
 * The scope is read directly (the helper, as service role — exact set) and through every
 * product surface that consumes it, called as the signed-in user: the people search, the
 * agreement-by-profile RPC, and both letter-addressing RPCs.
 */
import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestAgreement } from '../helpers/test-agreement';
import {
  createTestDoc,
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

// In order, one worker, but a failure does not skip the rest: each test owns its fixtures, so the
// red run shows every defect assertion failing alongside every control passing.
test.describe.configure({ mode: 'default' });

// Unique per run: profile search is a name-prefix match over the shared test project.
const RUN = randomBytes(4).toString('hex');
const nameFor = (role: string) => `P1486${RUN}${role}`;

function makeAnonClient(): SupabaseClient {
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// One session per user for the whole file — every sign-in counts against the auth rate limit.
const sessions = new Map<string, Promise<SupabaseClient>>();
function signIn(email: string): Promise<SupabaseClient> {
  if (!sessions.has(email)) sessions.set(email, freshSignIn(email));
  return sessions.get(email)!;
}
async function freshSignIn(email: string): Promise<SupabaseClient> {
  const { data, error } = await makeAnonClient().auth.signInWithPassword({ email, password: TEST_PASSWORD });
  expect(error, `sign-in failed for ${email}: ${error?.message}`).toBeNull();
  return createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${data!.session!.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const users: Record<string, TestUser> = {};
const letterIds: string[] = [];
const docIds: string[] = [];

async function scopeOf(user: TestUser): Promise<string[]> {
  const { data, error } = await supabaseAdmin.rpc('p878_relationship_scope', { p_caller: user.user.id });
  expect(error, error?.message).toBeNull();
  return (data ?? []) as string[];
}

/** What the people picker shows `searcher` for `target`'s full name. */
async function searchFinds(searcher: TestUser, target: TestUser): Promise<boolean> {
  const client = await signIn(searcher.email);
  const { data, error } = await client.rpc('search_profiles', { p_query: target.name });
  expect(error, error?.message).toBeNull();
  return ((data ?? []) as { profile_id: string }[]).some((r) => r.profile_id === target.user.id);
}

/** The app's own write: a party ending an agreement (agreements-service-real.ts cancel/terminate). */
async function endAs(party: TestUser, agreementId: string) {
  const client = await signIn(party.email);
  const { error } = await client
    .from('clarity_agreements')
    .update({ status: 'terminated', terminated_at: new Date().toISOString(), terminated_by: party.user.id })
    .eq('id', agreementId);
  expect(error, error?.message).toBeNull();
}

/** The app's create → accept path: pending with no partner, then the partner accepts. */
async function acceptedAgreement(creator: TestUser, partner: TestUser): Promise<string> {
  const c = await signIn(creator.email);
  const { data: row, error } = await c
    .from('clarity_agreements')
    .insert({
      creator_profile_id: creator.user.id,
      partner_email: partner.email,
      partner_display_name: null,
      terms_text: 'P1486 accepted control',
      visibility: 'private',
      agreement_version: '4',
    })
    .select('id, invitation_token')
    .single();
  expect(error, error?.message).toBeNull();

  const p = await signIn(partner.email);
  const { data: ok, error: acceptErr } = await p.rpc('accept_agreement', {
    p_agreement_id: row!.id,
    p_token: row!.invitation_token,
    p_partner_id: partner.user.id,
    p_partner_display_name: null,
  });
  expect(acceptErr, acceptErr?.message).toBeNull();
  expect(ok).toBe(true);
  return row!.id;
}

test.beforeAll(async () => {
  const roles = [
    'InvCreator', 'Invitee', // defect: agreement never accepted
    'EndCreator', 'EndPartner', // control: accepted, then ended
    'ActCreator', 'ActPartner', // control: accepted, active
    'Sender', 'Receiver', // control: letter correspondents
    'Endorsee', 'Witness', // control: witness
    'PendCreator', 'PendInvitee', // control: pending invitation stays out
  ];
  for (const role of roles) {
    users[role] = await createTestUser({ name: nameFor(role) });
  }
});

test.afterAll(async () => {
  // ~30 users plus their letters and agreements: the default 30 s hook budget is not enough.
  test.setTimeout(240_000);
  for (const id of letterIds) await deleteTestLetter(id);
  for (const id of docIds) await supabaseAdmin.from('clarity_docs').delete().eq('id', id);
  for (const u of Object.values(users)) {
    await supabaseAdmin.from('clarity_agreements').delete().eq('creator_profile_id', u.user.id);
    await supabaseAdmin.from('witnesses').delete().eq('profile_id', u.user.id);
  }
  for (const u of Object.values(users)) await deleteTestUser(u.user.id);
});

/** Fixture self-check: the agreement under test is ended, addressed to `invitee`, never signed. */
async function expectUnaccepted(agreementId: string, invitee: TestUser) {
  const { data } = await supabaseAdmin
    .from('clarity_agreements')
    .select('status, partner_profile_id, partner_signed_at')
    .eq('id', agreementId)
    .single();
  expect(data).toEqual({ status: 'terminated', partner_profile_id: invitee.user.id, partner_signed_at: null });
}

test.describe('P1486 defect: an agreement the partner never accepted is not a relationship', () => {
  test.beforeAll(async () => {
    // Addressed to a profile (as create_agreement_with_profile writes it), then ended by the
    // creator through the app's own write.
    const a = await createTestAgreement(users.InvCreator.user.id, users.Invitee.email, {
      partnerProfileId: users.Invitee.user.id,
    });
    await endAs(users.InvCreator, a.id);
    await expectUnaccepted(a.id, users.Invitee);
  });

  test('the invitee is not in the creator\'s scope', async () => {
    expect(await scopeOf(users.InvCreator)).not.toContain(users.Invitee.user.id);
  });

  test('the creator is not in the invitee\'s scope', async () => {
    expect(await scopeOf(users.Invitee)).not.toContain(users.InvCreator.user.id);
  });

  test('neither finds the other in the people search', async () => {
    expect(await searchFinds(users.InvCreator, users.Invitee)).toBe(false);
    expect(await searchFinds(users.Invitee, users.InvCreator)).toBe(false);
  });

  test('the creator cannot address the invitee by profile again', async () => {
    const client = await signIn(users.InvCreator.email);
    const { data, error } = await client.rpc('create_agreement_with_profile', {
      p_partner_profile_id: users.Invitee.user.id,
      p_partner_display_name: null,
      p_terms_text: 'P1486 scope probe',
      p_visibility: 'private',
      p_agreement_version: '4',
    });
    expect(error?.message).toMatch(/not in your relationship scope/);
    expect(data).toBeNull();
  });
});

test.describe('P1486 controls: documented relationships stay in scope', () => {
  test('accepted, then ended: both directions, search and agreement RPC', async () => {
    const id = await acceptedAgreement(users.EndCreator, users.EndPartner);
    await endAs(users.EndCreator, id);

    expect(await scopeOf(users.EndCreator)).toContain(users.EndPartner.user.id);
    expect(await scopeOf(users.EndPartner)).toContain(users.EndCreator.user.id);
    expect(await searchFinds(users.EndCreator, users.EndPartner)).toBe(true);
    expect(await searchFinds(users.EndPartner, users.EndCreator)).toBe(true);

    const client = await signIn(users.EndCreator.email);
    const { error } = await client.rpc('create_agreement_with_profile', {
      p_partner_profile_id: users.EndPartner.user.id,
      p_partner_display_name: null,
      p_terms_text: 'P1486 renewed after an ended agreement',
      p_visibility: 'private',
      p_agreement_version: '4',
    });
    expect(error, error?.message).toBeNull();
  });

  test('accepted and active: both directions', async () => {
    await acceptedAgreement(users.ActCreator, users.ActPartner);
    expect(await scopeOf(users.ActCreator)).toContain(users.ActPartner.user.id);
    expect(await scopeOf(users.ActPartner)).toContain(users.ActCreator.user.id);
    expect(await searchFinds(users.ActPartner, users.ActCreator)).toBe(true);
  });

  test('letter correspondents: both directions', async () => {
    const doc = await createTestDoc(users.Sender.user.id, 'P1486 fixture');
    docIds.push(doc.id);
    const letter = await createTestLetter(users.Sender.user.id, doc.id, { mode: 'one-to-one' });
    letterIds.push(letter.id);
    await sealTestLetter(letter.id);
    await createTestDelivery(letter.id, {
      receiverEmail: users.Receiver.email,
      receiverProfileId: users.Receiver.user.id,
    });

    expect(await scopeOf(users.Sender)).toContain(users.Receiver.user.id);
    expect(await scopeOf(users.Receiver)).toContain(users.Sender.user.id);
    expect(await searchFinds(users.Receiver, users.Sender)).toBe(true);
  });

  test('witnesses: both directions', async () => {
    const { error } = await supabaseAdmin.from('witnesses').insert({
      profile_id: users.Endorsee.user.id,
      witness_name: nameFor('Witness'),
      witness_profile_id: users.Witness.user.id,
    });
    expect(error, error?.message).toBeNull();

    expect(await scopeOf(users.Endorsee)).toContain(users.Witness.user.id);
    expect(await scopeOf(users.Witness)).toContain(users.Endorsee.user.id);
  });

  test('a pending invitation addressed to a profile stays out of scope', async () => {
    await createTestAgreement(users.PendCreator.user.id, users.PendInvitee.email, {
      partnerProfileId: users.PendInvitee.user.id,
    });
    expect(await scopeOf(users.PendCreator)).not.toContain(users.PendInvitee.user.id);
    expect(await scopeOf(users.PendInvitee)).not.toContain(users.PendCreator.user.id);
  });
});

/**
 * The letter RPCs (seal_and_send_letter, add_recipient_to_sealed_letter) and the agreement RPC
 * resolve a recipient's email in-DB from a profile id, gated on the scope (P914, P878). Called
 * here as the signed-in sender — the gate, not the helper, is what is under test.
 *
 * Each defect case gets its own pair of users: before the fix a refused call would have
 * succeeded and the resulting letter would itself relate the pair, contaminating later cases.
 */
test.describe('P1486: the scope-gated RPCs follow the same rule', () => {
  let n = 0;
  async function freshUser(tag: string): Promise<TestUser> {
    const key = `${tag}${++n}`;
    users[key] = await createTestUser({ name: nameFor(key) });
    return users[key];
  }

  /** A pair related only by an agreement the partner never accepted. */
  async function unacceptedPair(tag: string): Promise<[TestUser, TestUser]> {
    const creator = await freshUser(`${tag}C`);
    const invitee = await freshUser(`${tag}I`);
    const a = await createTestAgreement(creator.user.id, invitee.email, {
      partnerProfileId: invitee.user.id,
      status: 'terminated',
    });
    await expectUnaccepted(a.id, invitee);
    return [creator, invitee];
  }

  async function draftBy(sender: TestUser): Promise<string> {
    const doc = await createTestDoc(sender.user.id, 'P1486 letter fixture');
    docIds.push(doc.id);
    const letter = await createTestLetter(sender.user.id, doc.id, { mode: 'one-to-one' });
    letterIds.push(letter.id);
    return letter.id;
  }

  async function seal(sender: TestUser, letterId: string, deliveries: object[]) {
    const client = await signIn(sender.email);
    return client.rpc('seal_and_send_letter', {
      p_letter_id: letterId,
      p_predictions: [],
      p_deliveries: deliveries,
    });
  }

  async function deliveriesOf(letterId: string) {
    const { data, error } = await supabaseAdmin
      .from('letter_deliveries')
      .select('receiver_profile_id, receiver_email')
      .eq('letter_id', letterId);
    expect(error, error?.message).toBeNull();
    return data ?? [];
  }

  async function letterStatus(letterId: string) {
    const { data } = await supabaseAdmin.from('clarity_letters').select('status').eq('id', letterId).single();
    return (data as { status: string } | null)?.status;
  }

  test('control: sealing to an accepted (then ended) partner by profile works', async () => {
    const creator = await freshUser('LetC');
    const partner = await freshUser('LetP');
    const id = await acceptedAgreement(creator, partner);
    await endAs(creator, id);

    const letterId = await draftBy(creator);
    const { data, error } = await seal(creator, letterId, [{ receiver_profile_id: partner.user.id }]);
    expect(error, error?.message).toBeNull();
    expect(data).toBe(true);
    const rows = await deliveriesOf(letterId);
    expect(rows).toHaveLength(1);
    expect(rows[0].receiver_profile_id).toBe(partner.user.id);
    expect(rows[0].receiver_email?.toLowerCase()).toBe(partner.email.toLowerCase());
  });

  test('control: adding a past correspondent to a sealed letter by profile works', async () => {
    const sender = await freshUser('CorS');
    const receiver = await freshUser('CorR');
    const prior = await draftBy(sender);
    await sealTestLetter(prior);
    await createTestDelivery(prior, { receiverEmail: receiver.email, receiverProfileId: receiver.user.id });

    const letterId = await draftBy(sender);
    const sealed = await seal(sender, letterId, []);
    expect(sealed.error, sealed.error?.message).toBeNull();

    const client = await signIn(sender.email);
    const { data, error } = await client.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_receiver_profile_id: receiver.user.id,
    });
    expect(error, error?.message).toBeNull();
    expect(typeof data).toBe('string');
    const rows = await deliveriesOf(letterId);
    expect(rows.map((r) => r.receiver_profile_id)).toEqual([receiver.user.id]);
  });

  test('refused: sealing to the other party of an unaccepted agreement', async () => {
    const [creator, invitee] = await unacceptedPair('SealU');
    const letterId = await draftBy(creator);
    const { error } = await seal(creator, letterId, [{ receiver_profile_id: invitee.user.id }]);
    expect(error?.message ?? '').toMatch(/relationship scope/i);
    expect(await letterStatus(letterId)).toBe('draft');
    expect(await deliveriesOf(letterId)).toHaveLength(0);
  });

  test('refused: adding the other party of an unaccepted agreement to a sealed letter', async () => {
    const [creator, invitee] = await unacceptedPair('AddU');
    const letterId = await draftBy(creator);
    const sealed = await seal(creator, letterId, []);
    expect(sealed.error, sealed.error?.message).toBeNull();

    const client = await signIn(creator.email);
    const { error } = await client.rpc('add_recipient_to_sealed_letter', {
      p_letter_id: letterId,
      p_receiver_profile_id: invitee.user.id,
    });
    expect(error?.message ?? '').toMatch(/relationship scope/i);
    expect(await deliveriesOf(letterId)).toHaveLength(0);
  });

  test('refused, invitee side: addressing the creator by profile in a new agreement', async () => {
    const [creator, invitee] = await unacceptedPair('AgrI');
    const client = await signIn(invitee.email);
    const { data, error } = await client.rpc('create_agreement_with_profile', {
      p_partner_profile_id: creator.user.id,
      p_partner_display_name: null,
      p_terms_text: 'P1486 invitee-side probe',
      p_visibility: 'private',
      p_agreement_version: '4',
    });
    expect(error?.message ?? '').toMatch(/not in your relationship scope/);
    expect(data).toBeNull();
    // Nothing was created that would carry the creator's address back to the invitee.
    const { count } = await supabaseAdmin
      .from('clarity_agreements')
      .select('id', { count: 'exact', head: true })
      .eq('creator_profile_id', invitee.user.id);
    expect(count).toBe(0);
  });

  test('refused, invitee side: sealing to the creator by profile', async () => {
    const [creator, invitee] = await unacceptedPair('SealI');
    const letterId = await draftBy(invitee);
    const { error } = await seal(invitee, letterId, [{ receiver_profile_id: creator.user.id }]);
    expect(error?.message ?? '').toMatch(/relationship scope/i);
    expect(await letterStatus(letterId)).toBe('draft');
    expect(await deliveriesOf(letterId)).toHaveLength(0);
  });
});
