/**
 * @file p1446-ownership-columns.spec.ts
 * @description P1446 H2 + H3: who an object belongs to is decided by the server, never rewritten
 * or pre-set by a client.
 *
 * H2 — a delivery's receiver may record progress on it (status, opened_at, completed_at,
 * saved_story_index: the four columns any client writes, letters-service.ts) and nothing else.
 * Before the fix `authenticated` held UPDATE on every column and the only policy checked
 * receiver_profile_id on both sides, so a receiver could repoint letter_id at another letter.
 *
 * H3 — a client INSERT creates only a pending agreement with no partner. Before the fix the
 * INSERT policy checked only creator_profile_id, so a creator could insert an already-ended
 * agreement naming anyone, which p878_relationship_scope counts as a relationship.
 *
 * Every refusal is checked by reading the row back through the service-role client, so a
 * policy change elsewhere (the test project can carry unshipped SELECT policies) cannot turn
 * a successful write into an apparent refusal. Each refusal has a control that the app-shaped
 * write still works.
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD } from '../helpers/test-user';
import {
  createTestDoc,
  createTestLetter,
  createTestDelivery,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

test.describe.configure({ mode: 'serial' });

let receiverId: string;
let receiverEmail: string;
let senderId: string;
let outsiderId: string;
let outsiderEmail: string;
let receiver: SupabaseClient;
let publicLetterId: string;
let privateLetterId: string;
let receiverDeliveryId: string;
const docIds: string[] = [];

async function signedIn(email: string) {
  // Throwaway auth client — signing in on supabaseAdmin would replace its service-role session.
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

async function storedDelivery() {
  const { data, error } = await supabaseAdmin
    .from('letter_deliveries')
    .select('letter_id, receiver_profile_id, receiver_email, invitation_expires_at, status, saved_story_index')
    .eq('id', receiverDeliveryId)
    .single();
  expect(error).toBeNull();
  return data!;
}

test.beforeAll(async () => {
  receiverEmail = generateTestEmail();
  receiverId = (await createTestUser({ email: receiverEmail })).user.id;
  senderId = (await createTestUser({ email: generateTestEmail() })).user.id;
  outsiderEmail = generateTestEmail();
  outsiderId = (await createTestUser({ email: outsiderEmail })).user.id;
  receiver = await signedIn(receiverEmail);

  const doc = await createTestDoc(senderId, 'P1446 fixture');
  docIds.push(doc.id);

  // A public letter the receiver legitimately holds a delivery for…
  publicLetterId = (await createTestLetter(senderId, doc.id, { mode: 'one-to-many' })).id;
  await sealTestLetter(publicLetterId);
  receiverDeliveryId = (
    await createTestDelivery(publicLetterId, { receiverProfileId: receiverId, status: 'sent' })
  ).id;

  // …and a private letter addressed to somebody else.
  privateLetterId = (await createTestLetter(senderId, doc.id, { mode: 'one-to-one' })).id;
  await sealTestLetter(privateLetterId);
  await createTestDelivery(privateLetterId, { receiverEmail: outsiderEmail, receiverProfileId: outsiderId });
});

test.afterAll(async () => {
  for (const id of [publicLetterId, privateLetterId].filter(Boolean)) await deleteTestLetter(id);
  for (const id of docIds) await supabaseAdmin.from('clarity_docs').delete().eq('id', id);
  for (const id of [receiverId, senderId, outsiderId].filter(Boolean)) {
    await supabaseAdmin.from('clarity_agreements').delete().eq('creator_profile_id', id);
  }
  for (const id of [receiverId, senderId, outsiderId].filter(Boolean)) await deleteTestUser(id);
});

test.describe('P1446 H2: a receiver records progress on a delivery and changes nothing else', () => {
  test('control: the progress writes the app makes still work', async () => {
    const opened = await receiver
      .from('letter_deliveries')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', receiverDeliveryId);
    expect(opened.error, opened.error?.message).toBeNull();

    const paused = await receiver
      .from('letter_deliveries')
      .update({ saved_story_index: 2 })
      .eq('id', receiverDeliveryId);
    expect(paused.error, paused.error?.message).toBeNull();

    const row = await storedDelivery();
    expect(row.status).toBe('opened');
    expect(row.saved_story_index).toBe(2);
  });

  test('refused: moving the delivery onto another letter', async () => {
    const { error } = await receiver
      .from('letter_deliveries')
      .update({ letter_id: privateLetterId })
      .eq('id', receiverDeliveryId);
    expect(error, 'the write must be refused, not silently dropped').not.toBeNull();
    expect((await storedDelivery()).letter_id).toBe(publicLetterId);
  });

  test('refused: rewriting the address or the invitation window', async () => {
    const before = await storedDelivery();

    const email = await receiver
      .from('letter_deliveries')
      .update({ receiver_email: outsiderEmail })
      .eq('id', receiverDeliveryId);
    expect(email.error).not.toBeNull();

    const window = await receiver
      .from('letter_deliveries')
      .update({ invitation_expires_at: '2099-01-01T00:00:00Z' })
      .eq('id', receiverDeliveryId);
    expect(window.error).not.toBeNull();

    const after = await storedDelivery();
    expect(after.receiver_email).toBe(before.receiver_email);
    expect(after.invitation_expires_at).toBe(before.invitation_expires_at);
    expect(after.receiver_profile_id).toBe(receiverId);
  });
});

test.describe('P1446 H3: a client creates only a pending agreement with no partner', () => {
  const appShaped = () => ({
    creator_profile_id: receiverId,
    partner_email: outsiderEmail,
    partner_display_name: null,
    terms_text: 'P1446 H3 probe',
    visibility: 'private',
    agreement_version: '4',
  });

  async function agreementsNaming(partnerId: string) {
    const { count, error } = await supabaseAdmin
      .from('clarity_agreements')
      .select('id', { count: 'exact', head: true })
      .eq('creator_profile_id', receiverId)
      .eq('partner_profile_id', partnerId);
    expect(error).toBeNull();
    return count;
  }

  test('control: the app-shaped insert works and lands pending with no partner', async () => {
    const { data, error } = await receiver
      .from('clarity_agreements')
      .insert(appShaped())
      .select('status, partner_profile_id')
      .single();
    expect(error, error?.message).toBeNull();
    expect(data!.status).toBe('pending');
    expect(data!.partner_profile_id).toBeNull();
  });

  test('refused: an already-ended agreement naming someone', async () => {
    const { error } = await receiver
      .from('clarity_agreements')
      .insert({ ...appShaped(), status: 'terminated', partner_profile_id: outsiderId });
    expect(error?.message).toMatch(/row-level security/i);
    expect(await agreementsNaming(outsiderId)).toBe(0);
  });

  test('refused: a pending agreement that pre-names the partner', async () => {
    const { error } = await receiver
      .from('clarity_agreements')
      .insert({ ...appShaped(), partner_profile_id: outsiderId });
    expect(error?.message).toMatch(/row-level security/i);
    expect(await agreementsNaming(outsiderId)).toBe(0);
  });

  test('refused: an agreement born active', async () => {
    const { error } = await receiver
      .from('clarity_agreements')
      .insert({ ...appShaped(), status: 'active' });
    expect(error?.message).toMatch(/row-level security/i);
  });

  test('so the outsider stays out of scope: no agreement, no email', async () => {
    // The forgery attempt is repeated HERE, not relied on from the test above: Playwright
    // restarts the worker after a failure and beforeAll then builds fresh users, so a
    // consequence check that depends on another test's row passes against an unfixed
    // database (observed while writing this file).
    await receiver
      .from('clarity_agreements')
      .insert({ ...appShaped(), status: 'terminated', partner_profile_id: outsiderId });

    const { data, error } = await receiver.rpc('create_agreement_with_profile', {
      p_partner_profile_id: outsiderId,
      p_partner_display_name: null,
      p_terms_text: 'P1446 H3 scope probe',
      p_visibility: 'private',
      p_agreement_version: '4',
    });
    expect(error?.message).toMatch(/not in your relationship scope/);
    expect(data).toBeNull();
  });

  test('control: create → accept still makes the partner, through the accept RPC', async () => {
    const { data: created, error } = await receiver
      .from('clarity_agreements')
      .insert(appShaped())
      .select('id, invitation_token')
      .single();
    expect(error, error?.message).toBeNull();

    const outsider = await signedIn(outsiderEmail);
    const { data: accepted, error: acceptErr } = await outsider.rpc('accept_agreement', {
      p_agreement_id: created!.id,
      p_token: created!.invitation_token,
      p_partner_id: outsiderId,
      p_partner_display_name: null,
    });
    expect(acceptErr, acceptErr?.message).toBeNull();
    expect(accepted).toBe(true);

    const { data: row } = await supabaseAdmin
      .from('clarity_agreements')
      .select('status, partner_profile_id')
      .eq('id', created!.id)
      .single();
    expect(row).toEqual({ status: 'active', partner_profile_id: outsiderId });
  });
});
