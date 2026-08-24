/**
 * @file test-letter.ts
 *
 * E2E Test Helpers for Clarity Letters (P581)
 *
 * These helpers use the Supabase Admin API (service_role) to:
 * 1. Create test letters with story snapshots and predictions
 * 2. Create deliveries for 1-to-1 and 1-to-many letters
 * 3. Seal letters (transition from draft → sealed)
 * 4. Complete letters (simulate receiver reading flow)
 * 5. Clean up test data after tests
 *
 * All helpers use service_role key which bypasses RLS.
 * For RLS-sensitive tests, use makeUserClient() from the test file.
 */

import { supabaseAdmin } from './supabase-admin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestLetter {
  id: string;
  sourceDocId: string;
  senderId: string;
  mode: 'one-to-one' | 'one-to-many';
  status: 'draft' | 'sealed' | 'expired';
}

export interface TestDelivery {
  id: string;
  letterId: string;
  receiverEmail: string | null;
  receiverProfileId: string | null;
  invitationToken: string;
  status: 'sent' | 'opened' | 'in_progress' | 'completed';
}

export interface TestPrediction {
  id: string;
  letterId: string;
  deliveryId: string | null;
  storyId: string;
  prediction: number;
}

export interface TestStorySnapshot {
  letterId: string;
  storyId: string;
  versionId: string;
  position: number;
  visibility: string;
}

// ---------------------------------------------------------------------------
// Source-row helpers
// ---------------------------------------------------------------------------

/**
 * Creates a `clarity_docs` row to hang a letter off.
 *
 * P1043: three specs passed the *sender's user id* as `createTestLetter`'s `sourceDocId`,
 * which fails `clarity_letters_source_doc_id_fkey` (23503) because no such doc exists.
 * The helper's signature has been `(senderId, sourceDocId)` since 6caf43f0 and never
 * changed under them, so those tests could not have passed at any point. This exists so
 * the fix is one call rather than the same insert copied into three files.
 */
export async function createTestDoc(ownerId: string, title?: string): Promise<{ id: string }> {
  const { data, error } = await supabaseAdmin
    .from('clarity_docs')
    .insert({ title: title ?? `E2E Test Doc ${Date.now()}`, owner_id: ownerId })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create test doc: ${error?.message}`);
  }
  console.log(`[TEST HELPER] Test doc created: ${data.id}`);
  return { id: data.id };
}

/**
 * Returns the id of a story's first `story_versions` row.
 *
 * P1043: the same three specs passed `storyId` as `createTestStorySnapshot`'s `versionId`.
 * `letter_story_snapshots.version_id` is `NOT NULL REFERENCES story_versions(id)`
 * (20260403224331_p581_clarity_letters.sql:58), so that is a second FK violation stacked
 * behind the first — fixing only the doc id would just move the failure one line down.
 * The row is created by a trigger on story INSERT, so it always exists by now.
 */
export async function getTestStoryVersionId(storyId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', storyId)
    .order('version_number', { ascending: true })
    .limit(1)
    .single();

  if (error || !data) {
    throw new Error(`Failed to fetch story version for ${storyId}: ${error?.message}`);
  }
  return data.id;
}

// ---------------------------------------------------------------------------
// Letter CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a test letter in draft status.
 * Does NOT create snapshots or deliveries — call sealTestLetter() for that.
 */
export async function createTestLetter(
  senderId: string,
  sourceDocId: string,
  options: {
    mode?: 'one-to-one' | 'one-to-many';
  } = {}
): Promise<TestLetter> {
  const mode = options.mode ?? 'one-to-one';

  console.log(`[TEST HELPER] Creating test letter: sender=${senderId}, doc=${sourceDocId}, mode=${mode}`);

  const { data, error } = await supabaseAdmin
    .from('clarity_letters')
    .insert({
      source_doc_id: sourceDocId,
      sender_id: senderId,
      mode,
      status: 'draft',
    })
    .select('id, source_doc_id, sender_id, mode, status')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create test letter:', error);
    throw new Error(`Failed to create test letter: ${error.message}`);
  }

  console.log(`[TEST HELPER] Test letter created: ${data.id}`);

  return {
    id: data.id,
    sourceDocId: data.source_doc_id,
    senderId: data.sender_id,
    mode: data.mode,
    status: data.status,
  };
}

/**
 * Creates a delivery row for a letter.
 * For 1-to-1: pass receiverEmail and optionally receiverProfileId.
 * For 1-to-many: pass neither (anonymous access).
 */
export async function createTestDelivery(
  letterId: string,
  options: {
    receiverEmail?: string;
    receiverProfileId?: string;
    status?: 'sent' | 'opened' | 'in_progress' | 'completed';
    invitationExpiresAt?: string;
    completedAt?: string;
  } = {}
): Promise<TestDelivery> {
  console.log(`[TEST HELPER] Creating test delivery for letter: ${letterId}`);

  const status = options.status ?? 'sent';
  // completed_at_status_sync constraint: completed_at IS NULL iff status != 'completed'
  const completedAt = status === 'completed'
    ? (options.completedAt ?? new Date().toISOString())
    : null;

  const { data, error } = await supabaseAdmin
    .from('letter_deliveries')
    .insert({
      letter_id: letterId,
      receiver_email: options.receiverEmail ?? null,
      receiver_profile_id: options.receiverProfileId ?? null,
      status,
      ...(completedAt && { completed_at: completedAt }),
      ...(options.invitationExpiresAt && {
        invitation_expires_at: options.invitationExpiresAt,
      }),
    })
    .select('id, letter_id, receiver_email, receiver_profile_id, invitation_token, status')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create test delivery:', error);
    throw new Error(`Failed to create test delivery: ${error.message}`);
  }

  console.log(`[TEST HELPER] Test delivery created: ${data.id}, token=${data.invitation_token}`);

  return {
    id: data.id,
    letterId: data.letter_id,
    receiverEmail: data.receiver_email,
    receiverProfileId: data.receiver_profile_id,
    invitationToken: data.invitation_token,
    status: data.status,
  };
}

/**
 * Creates a story snapshot in a letter.
 * Call after creating the letter but before sealing.
 */
export async function createTestStorySnapshot(
  letterId: string,
  storyId: string,
  versionId: string,
  options: {
    position?: number;
    pointConfig?: Record<string, unknown>;
    visibility?: string;
  } = {}
): Promise<TestStorySnapshot> {
  console.log(`[TEST HELPER] Creating story snapshot: letter=${letterId}, story=${storyId}`);

  const { data, error } = await supabaseAdmin
    .from('letter_story_snapshots')
    .insert({
      letter_id: letterId,
      story_id: storyId,
      version_id: versionId,
      position: options.position ?? 0,
      point_config: options.pointConfig ?? {},
      visibility: options.visibility ?? 'public',
    })
    .select('letter_id, story_id, version_id, position, visibility')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create story snapshot:', error);
    throw new Error(`Failed to create story snapshot: ${error.message}`);
  }

  console.log(`[TEST HELPER] Story snapshot created`);

  return {
    letterId: data.letter_id,
    storyId: data.story_id,
    versionId: data.version_id,
    position: data.position,
    visibility: data.visibility,
  };
}

/**
 * Creates a prediction for a story in a letter.
 * For 1-to-1: pass deliveryId. For 1-to-many: pass null (shared prediction).
 */
export async function createTestPrediction(
  letterId: string,
  storyId: string,
  prediction: number,
  deliveryId: string | null = null
): Promise<TestPrediction> {
  console.log(`[TEST HELPER] Creating prediction: letter=${letterId}, story=${storyId}, value=${prediction}`);

  const { data, error } = await supabaseAdmin
    .from('letter_predictions')
    .insert({
      letter_id: letterId,
      delivery_id: deliveryId,
      story_id: storyId,
      prediction,
    })
    .select('id, letter_id, delivery_id, story_id, prediction')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create prediction:', error);
    throw new Error(`Failed to create prediction: ${error.message}`);
  }

  console.log(`[TEST HELPER] Prediction created: ${data.id}`);

  return {
    id: data.id,
    letterId: data.letter_id,
    deliveryId: data.delivery_id,
    storyId: data.story_id,
    prediction: data.prediction,
  };
}

/**
 * Seals a letter: transitions status from 'draft' to 'sealed', sets sealed_at.
 * In production this is done by the seal_and_send_letter RPC.
 * For tests, we directly update the row via service_role.
 */
export async function sealTestLetter(letterId: string): Promise<void> {
  console.log(`[TEST HELPER] Sealing letter: ${letterId}`);

  const { error } = await supabaseAdmin
    .from('clarity_letters')
    .update({
      status: 'sealed',
      sealed_at: new Date().toISOString(),
    })
    .eq('id', letterId);

  if (error) {
    console.error('[TEST HELPER] Failed to seal letter:', error);
    throw new Error(`Failed to seal letter: ${error.message}`);
  }

  console.log(`[TEST HELPER] Letter sealed: ${letterId}`);
}

/**
 * Simulates a receiver completing a letter delivery.
 * Updates delivery status to 'completed' and sets completed_at.
 */
export async function completeTestDelivery(deliveryId: string, storiesRated: number): Promise<void> {
  console.log(`[TEST HELPER] Completing delivery: ${deliveryId}`);

  const { error } = await supabaseAdmin
    .from('letter_deliveries')
    .update({
      status: 'completed',
      stories_rated: storiesRated,
      completed_at: new Date().toISOString(),
    })
    .eq('id', deliveryId);

  if (error) {
    console.error('[TEST HELPER] Failed to complete delivery:', error);
    throw new Error(`Failed to complete delivery: ${error.message}`);
  }

  console.log(`[TEST HELPER] Delivery completed: ${deliveryId}`);
}

/**
 * Creates a full test letter with snapshots, predictions, and a delivery.
 * Convenience wrapper for the common test setup pattern.
 * Returns the letter + delivery for further assertions.
 */
export async function createFullTestLetter(
  senderId: string,
  sourceDocId: string,
  stories: Array<{ storyId: string; versionId: string; prediction: number; position?: number }>,
  receiver: {
    email?: string;
    profileId?: string;
  },
  options: {
    mode?: 'one-to-one' | 'one-to-many';
    seal?: boolean;
  } = {}
): Promise<{ letter: TestLetter; delivery: TestDelivery; predictions: TestPrediction[] }> {
  const mode = options.mode ?? 'one-to-one';
  const seal = options.seal ?? true;

  // 1. Create the letter
  const letter = await createTestLetter(senderId, sourceDocId, { mode });

  // 2. Create story snapshots — populate point_config with story content + linked points
  for (let i = 0; i < stories.length; i++) {
    const s = stories[i];

    // Fetch story content for point_config.storyTitle / storyText
    const { data: storyData, error: storyError } = await supabaseAdmin
      .from('stories')
      // P701 dropped stories.title; selecting it returns 42703 and this fetch
      // only warns, so the failure would surface later as an undefined storyTitle.
      .select('content')
      .eq('id', s.storyId)
      .single();
    if (storyError) console.warn(`[TEST HELPER] story fetch warning for ${s.storyId}:`, storyError.message);

    // Fetch linked points for point_config.points (two queries to avoid PostgREST join issues)
    const { data: storyPointRows } = await supabaseAdmin
      .from('story_points')
      .select('point_id')
      .eq('story_id', s.storyId);

    const linkedPointIds = (storyPointRows ?? []).map((sp) => sp.point_id as string);
    let configPoints: Array<{ id: string; text: string; authorPosition: null }> = [];

    if (linkedPointIds.length > 0) {
      const { data: pointRows } = await supabaseAdmin
        .from('points')
        .select('id, statement')
        .in('id', linkedPointIds);
      configPoints = (pointRows ?? []).map((p) => ({
        id: p.id as string,
        text: p.statement as string,
        authorPosition: null,
      }));
    }


    const pointConfig = {
      storyTitle: undefined,
      storyText: storyData?.content,
      points: configPoints,
    };

    await createTestStorySnapshot(letter.id, s.storyId, s.versionId, {
      position: s.position ?? i,
      pointConfig,
    });
  }

  // 3. Create delivery
  const delivery = await createTestDelivery(letter.id, {
    receiverEmail: receiver.email,
    receiverProfileId: receiver.profileId,
  });

  // 4. Create predictions
  const predictions: TestPrediction[] = [];
  for (const s of stories) {
    const pred = await createTestPrediction(
      letter.id,
      s.storyId,
      s.prediction,
      mode === 'one-to-one' ? delivery.id : null
    );
    predictions.push(pred);
  }

  // 5. Seal if requested
  if (seal) {
    await sealTestLetter(letter.id);
    letter.status = 'sealed';
  }

  return { letter, delivery, predictions };
}

/**
 * P884: reads a delivery's notified_at stamp (notification-claim state).
 * NULL = not yet emailed / eligible for the next send-letter-emails invoke.
 */
export async function getDeliveryNotifiedAt(deliveryId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('letter_deliveries')
    .select('notified_at')
    .eq('id', deliveryId)
    .single();
  if (error) throw new Error(`notified_at lookup failed: ${error.message}`);
  return data.notified_at as string | null;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Deletes a test letter and all cascade-dependent rows
 * (deliveries, snapshots, predictions via ON DELETE CASCADE).
 */
export async function deleteTestLetter(letterId: string): Promise<void> {
  console.log(`[TEST HELPER] Deleting test letter: ${letterId}`);

  // letter_point_responses reference delivery_id, clean them first
  const { data: deliveries } = await supabaseAdmin
    .from('letter_deliveries')
    .select('id')
    .eq('letter_id', letterId);

  if (deliveries && deliveries.length > 0) {
    const deliveryIds = deliveries.map((d) => d.id);
    await supabaseAdmin
      .from('letter_point_responses')
      .delete()
      .in('delivery_id', deliveryIds);
  }

  // story_verifications with source='letter' may reference this letter indirectly
  // Clean those that match the letter's stories
  const { data: snapshots } = await supabaseAdmin
    .from('letter_story_snapshots')
    .select('story_id')
    .eq('letter_id', letterId);

  if (snapshots && snapshots.length > 0 && deliveries && deliveries.length > 0) {
    const storyIds = snapshots.map((s) => s.story_id);
    for (const storyId of storyIds) {
      await supabaseAdmin
        .from('story_verifications')
        .delete()
        .eq('story_id', storyId)
        .eq('source', 'letter');
    }
  }

  // Delete the letter (CASCADE handles deliveries, snapshots, predictions)
  const { error } = await supabaseAdmin
    .from('clarity_letters')
    .delete()
    .eq('id', letterId);

  if (error) {
    console.warn(`[TEST HELPER] Error deleting letter ${letterId}:`, error);
  } else {
    console.log(`[TEST HELPER] Test letter deleted: ${letterId}`);
  }
}
