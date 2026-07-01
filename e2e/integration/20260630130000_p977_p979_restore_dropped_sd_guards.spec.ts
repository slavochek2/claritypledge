/**
 * @file 20260630130000_p977_p979_restore_dropped_sd_guards.spec.ts
 * @description P270 migration integration test for the P977/P978/P979 restore
 *   of three SECURITY DEFINER guards silently dropped by recreate-from-older-base
 *   migrations (the P952 regression class). Each test exercises the RUNTIME
 *   behavior the guard protects — not just the migration text (the static
 *   sd-guard-completeness canary covers the text).
 *
 *   P977 get_letter_position_stories — a third party's story on a shared snapshot
 *        point must NOT be returned to the letter's participant.
 *   P978 reveal_prediction_by_token — a co-recipient's rating must NOT unlock the
 *        sender's prediction for a caller who hasn't rated.
 *   P979 update_delivery_status_by_token — a backward status transition must be a
 *        no-op (forward-only).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../helpers/supabase-admin';
import { createTestUser, deleteTestUser, generateTestEmail, TEST_PASSWORD, type TestUser } from '../helpers/test-user';
import { createTestStory, linkStoryToPoint, deleteTestStory } from '../helpers/test-story';
import {
  createTestLetter,
  createTestStorySnapshot,
  createTestDelivery,
  createTestPrediction,
  sealTestLetter,
  deleteTestLetter,
} from '../helpers/test-letter';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '';

async function versionIdOf(storyId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', storyId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(`version lookup failed: ${error.message}`);
  return data!.id as string;
}

async function createDoc(ownerId: string, title: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ owner_id: ownerId, title })
    .select('id')
    .single();
  if (error) throw new Error(`doc insert failed: ${error.message}`);
  return data!.id as string;
}

async function createPoint(authorId: string, statement: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('points')
    .insert({ first_validator_id: authorId, statement })
    .select('id')
    .single();
  if (error) throw new Error(`point insert failed: ${error.message}`);
  return data!.id as string;
}

// ===========================================================================
// P977: get_letter_position_stories — third-party author whitelist restored
// ===========================================================================
test.describe('P977 migration: get_letter_position_stories author whitelist', () => {
  test.setTimeout(60000);

  let sender: TestUser; // Alice
  let receiver: TestUser; // Bob
  let thirdParty: TestUser; // X — unrelated to the letter
  let docId: string;
  let pointId: string;
  let senderStoryId: string;
  let receiverStoryId: string;
  let thirdPartyStoryId: string;
  let letterId: string;
  let deliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P977 sender' });
    receiver = await createTestUser({ name: 'P977 receiver' });
    thirdParty = await createTestUser({ name: 'P977 third party' });

    docId = await createDoc(sender.user.id, 'P977 doc');
    pointId = await createPoint(sender.user.id, 'P977 shared point statement.');

    // Three stories on the SAME point: sender, receiver, and an unrelated third
    // party whose story is PRIVATE (the latent-leak case the whitelist blocks).
    const senderStory = await createTestStory(sender.user.id, { title: 'P977 sender story' });
    const receiverStory = await createTestStory(receiver.user.id, { title: 'P977 receiver story' });
    const thirdPartyStory = await createTestStory(thirdParty.user.id, {
      title: 'P977 third-party PRIVATE story',
      visibility: 'private',
    });
    senderStoryId = senderStory.id;
    receiverStoryId = receiverStory.id;
    thirdPartyStoryId = thirdPartyStory.id;

    await linkStoryToPoint(senderStoryId, pointId);
    await linkStoryToPoint(receiverStoryId, pointId);
    await linkStoryToPoint(thirdPartyStoryId, pointId);

    // Letter Alice -> Bob; snapshot carries the shared point so the RPC scans it.
    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
    await createTestStorySnapshot(letterId, senderStoryId, await versionIdOf(senderStoryId), {
      position: 0,
      pointConfig: { points: [{ id: pointId, text: 'P977 shared point statement.', authorPosition: null }] },
    });
    const delivery = await createTestDelivery(letterId, { receiverProfileId: receiver.user.id });
    deliveryId = delivery.id;

    // Delivery-scope the receiver's story (P964 #1): a point-response row for
    // (delivery, point) is required for a receiver-authored story to surface.
    const { error: lprError } = await supabaseAdmin
      .from('letter_point_responses')
      .insert({ delivery_id: deliveryId, point_id: pointId, position: 'agree' });
    if (lprError) throw new Error(`lpr insert failed: ${lprError.message}`);

    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    for (const id of [senderStoryId, receiverStoryId, thirdPartyStoryId]) {
      if (id) await deleteTestStory(id).catch(() => {});
    }
    if (pointId) await supabaseAdmin.from('points').delete().eq('id', pointId);
    for (const u of [sender, receiver, thirdParty]) {
      if (u?.user?.id) await deleteTestUser(u.user.id).catch(() => {});
    }
  });

  test('returns the receiver story but never the sender or third-party story', async () => {
    // Call as the authenticated receiver (RPC is REVOKEd from anon; _is_letter_participant gates the caller).
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInError } = await client.auth.signInWithPassword({
      email: receiver.email,
      password: TEST_PASSWORD,
    });
    expect(signInError, 'receiver sign-in').toBeNull();

    const { data, error } = await client.rpc('get_letter_position_stories', {
      p_delivery_id: deliveryId,
    });
    expect(error, 'rpc error').toBeNull();

    const authorIds = ((data ?? []) as Array<{ author_id: string; story_id: string }>).map((r) => r.author_id);
    const storyIds = ((data ?? []) as Array<{ author_id: string; story_id: string }>).map((r) => r.story_id);

    // The fix: third party never appears (this is the leak P977 closed).
    expect(authorIds, 'third-party author must NOT be returned').not.toContain(thirdParty.user.id);
    expect(storyIds, 'third-party story must NOT be returned').not.toContain(thirdPartyStoryId);
    // Sender excluded server-side (P964 #2).
    expect(authorIds, 'sender excluded server-side').not.toContain(sender.user.id);
    // The legitimate receiver story IS returned (delivery-scoped).
    expect(storyIds, 'receiver story is returned').toContain(receiverStoryId);
  });
});

// ===========================================================================
// P978: reveal_prediction_by_token — per-listener sealed-bid scope restored
// ===========================================================================
test.describe('P978 migration: reveal_prediction_by_token sealed-bid scope', () => {
  test.setTimeout(60000);

  // Authenticated-receiver path (v_receiver_id IS NOT NULL): the gate keys on
  // listener_id = the delivery's receiver, so a co-recipient's rating must not
  // unlock the reveal for a receiver who hasn't rated.
  let sender: TestUser;
  let receiver: TestUser; // Bob — this delivery's receiver
  let coRecipient: TestUser; // X — a different listener who rated the same story
  let docId: string;
  let storyId: string;
  let letterId: string;
  let invitationToken: string;
  const prediction = 7;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P978 sender' });
    receiver = await createTestUser({ name: 'P978 receiver' });
    coRecipient = await createTestUser({ name: 'P978 co-recipient' });

    docId = await createDoc(sender.user.id, 'P978 doc');
    const story = await createTestStory(sender.user.id, { title: 'P978 story' });
    storyId = story.id;

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
    await createTestStorySnapshot(letterId, storyId, await versionIdOf(storyId), { position: 0 });

    const delivery = await createTestDelivery(letterId, { receiverProfileId: receiver.user.id });
    invitationToken = delivery.invitationToken;
    await createTestPrediction(letterId, storyId, prediction, delivery.id);

    // A DIFFERENT listener (the co-recipient) rated the story. Pre-fix this
    // unlocked the reveal for everyone; post-fix it must not.
    const { error: svError } = await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      version_id: await versionIdOf(storyId),
      speaker_id: sender.user.id,
      listener_id: coRecipient.user.id,
      listener_rating: 5,
      speaker_rating: 0,
      source: 'letter',
      verified: false,
      session_id: null,
    });
    if (svError) throw new Error(`co-recipient verification insert failed: ${svError.message}`);

    await sealTestLetter(letterId);
  });

  test.afterAll(async () => {
    if (storyId) await supabaseAdmin.from('story_verifications').delete().eq('story_id', storyId);
    if (letterId) await deleteTestLetter(letterId);
    if (storyId) await deleteTestStory(storyId).catch(() => {});
    for (const u of [sender, receiver, coRecipient]) {
      if (u?.user?.id) await deleteTestUser(u.user.id).catch(() => {});
    }
  });

  async function revealAsReceiver() {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInError } = await client.auth.signInWithPassword({
      email: receiver.email,
      password: TEST_PASSWORD,
    });
    expect(signInError, 'receiver sign-in').toBeNull();
    return client.rpc('reveal_prediction_by_token', { p_token: invitationToken, p_story_id: storyId });
  }

  test('does not reveal the prediction when only a co-recipient has rated', async () => {
    const { data, error } = await revealAsReceiver();
    expect(error, 'rpc error').toBeNull();
    // Fixed: the receiver has not rated → co-recipient's rating must not unlock.
    expect(data, 'co-recipient rating must NOT unlock the reveal').toBeNull();
  });

  test('reveals the prediction once the receiver has rated', async () => {
    // Positive control: the receiver rates the story (real listener_id = receiver).
    const { error: svError } = await supabaseAdmin.from('story_verifications').insert({
      story_id: storyId,
      version_id: await versionIdOf(storyId),
      speaker_id: sender.user.id,
      listener_id: receiver.user.id,
      listener_rating: 6,
      speaker_rating: 0,
      source: 'letter',
      verified: false,
      session_id: null,
    });
    expect(svError, 'receiver verification insert').toBeNull();

    const { data, error } = await revealAsReceiver();
    expect(error, 'rpc error').toBeNull();
    expect((data as { prediction: number } | null)?.prediction, 'prediction revealed after own rating').toBe(prediction);
  });
});

// ===========================================================================
// P979: update_delivery_status_by_token — forward-only guard restored
// ===========================================================================
test.describe('P979 migration: update_delivery_status_by_token forward-only', () => {
  test.setTimeout(60000);

  let sender: TestUser;
  let docId: string;
  let letterId: string;
  let completedToken: string;
  let sentToken: string;
  let completedDeliveryId: string;
  let sentDeliveryId: string;

  test.beforeAll(async () => {
    sender = await createTestUser({ name: 'P979 sender' });
    docId = await createDoc(sender.user.id, 'P979 doc');

    const letter = await createTestLetter(sender.user.id, docId, { mode: 'one-to-one' });
    letterId = letter.id;
    await sealTestLetter(letterId);

    const completed = await createTestDelivery(letterId, {
      receiverEmail: generateTestEmail(),
      status: 'completed',
    });
    completedToken = completed.invitationToken;
    completedDeliveryId = completed.id;

    const sent = await createTestDelivery(letterId, {
      receiverEmail: generateTestEmail(),
      status: 'sent',
    });
    sentToken = sent.invitationToken;
    sentDeliveryId = sent.id;
  });

  test.afterAll(async () => {
    if (letterId) await deleteTestLetter(letterId);
    if (sender?.user?.id) await deleteTestUser(sender.user.id).catch(() => {});
  });

  test('backward transition (completed -> opened) is a no-op', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await anon.rpc('update_delivery_status_by_token', {
      p_token: completedToken,
      p_status: 'opened',
    });
    expect(error, 'rpc error').toBeNull();

    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('status')
      .eq('id', completedDeliveryId)
      .single();
    expect(data?.status, 'status must remain completed').toBe('completed');
  });

  test('forward transition (sent -> opened) still advances', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await anon.rpc('update_delivery_status_by_token', {
      p_token: sentToken,
      p_status: 'opened',
    });
    expect(error, 'rpc error').toBeNull();

    const { data } = await supabaseAdmin
      .from('letter_deliveries')
      .select('status, opened_at')
      .eq('id', sentDeliveryId)
      .single();
    expect(data?.status, 'status advanced to opened').toBe('opened');
    expect(data?.opened_at, 'opened_at stamped on first transition').not.toBeNull();
  });
});
