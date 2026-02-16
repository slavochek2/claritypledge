/**
 * @file test-calibration.ts
 *
 * E2E Test Helpers for Calibration Data
 *
 * Creates story verification records to generate calibration data.
 * Calibration requires 5+ story_verifications with speaker/listener ratings.
 */

import { supabaseAdmin } from '../../src/lib/supabase-admin';

/**
 * Creates story verification records for calibration testing
 * Generates enough data to trigger calibration display (≥5 sessions)
 *
 * @param listenerId - User whose calibration we're building
 * @param speakerId - User who rates the listener (can be same for testing)
 * @param count - Number of verification sessions (default 5)
 * @param overconfident - If true, listener rates self higher than speaker rates them
 */
export async function createCalibrationData(options: {
  listenerId: string;
  speakerId: string;
  count?: number;
  overconfident?: boolean;
}): Promise<void> {
  const { listenerId, speakerId, count = 5, overconfident = false } = options;

  console.log(`[TEST HELPER] Creating ${count} calibration records for listener: ${listenerId}`);

  // First, create a story and version (required by foreign key constraints)
  const { data: story, error: storyError } = await supabaseAdmin
    .from('stories')
    .insert({
      author_id: speakerId,
      title: 'Test Story for Calibration',
      content_json: JSON.stringify({ type: 'doc', content: [] }),
      content_text: 'Test content',
      is_public: true,
    })
    .select('id')
    .single();

  if (storyError || !story) {
    throw new Error(`Failed to create test story: ${storyError?.message}`);
  }

  console.log(`[TEST HELPER] Created test story: ${story.id}`);

  // Get the version (created automatically by trigger)
  const { data: version, error: versionError } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  if (versionError || !version) {
    throw new Error(`Failed to get story version: ${versionError?.message}`);
  }

  console.log(`[TEST HELPER] Using version: ${version.id}`);

  // Create verification records with calibration patterns
  const verifications = [];
  for (let i = 0; i < count; i++) {
    let speakerRating: number;
    let listenerRating: number;

    if (overconfident) {
      // Listener thinks they understood better than speaker agrees
      // Speaker rating: 6-7 (decent), Listener rating: 8-9 (high)
      // Gap = listener - speaker = positive (overconfident)
      speakerRating = 6 + Math.floor(Math.random() * 2); // 6-7
      listenerRating = 8 + Math.floor(Math.random() * 2); // 8-9
    } else {
      // Well calibrated: ratings match closely
      // Both ratings: 7-9
      const baseRating = 7 + Math.floor(Math.random() * 3); // 7-9
      speakerRating = baseRating;
      listenerRating = baseRating + Math.floor(Math.random() * 2) - 1; // ±1
    }

    verifications.push({
      story_id: story.id,
      version_id: version.id,
      speaker_id: speakerId,
      listener_id: listenerId,
      speaker_rating: speakerRating,
      listener_rating: listenerRating,
      created_at: new Date(Date.now() - (count - i) * 86400000).toISOString(), // Spread over days
    });
  }

  const { error: verifyError } = await supabaseAdmin
    .from('story_verifications')
    .insert(verifications);

  if (verifyError) {
    throw new Error(`Failed to create verifications: ${verifyError.message}`);
  }

  console.log(`[TEST HELPER] Created ${count} verification records`);

  // Trigger to update verification_session_count runs automatically
  // Wait for trigger to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify the count was updated
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('verification_session_count')
    .eq('id', listenerId)
    .single();

  console.log(`[TEST HELPER] Profile verification_session_count: ${profile?.verification_session_count}`);
}

/**
 * Creates ear count data (successful story verifications as listener)
 * Ear count = stories where listener achieved speaker_rating ≥ 8
 *
 * @param listenerId - User whose ear count we're building
 * @param speakerId - User who rates the listener
 * @param count - Number of successful understandings (default 3)
 */
export async function createEarCountData(options: {
  listenerId: string;
  speakerId: string;
  count?: number;
}): Promise<void> {
  const { listenerId, speakerId, count = 3 } = options;

  console.log(`[TEST HELPER] Creating ${count} ear count records for listener: ${listenerId}`);

  // Create story and version
  const { data: story, error: storyError } = await supabaseAdmin
    .from('stories')
    .insert({
      author_id: speakerId,
      title: 'Test Story for Ear Count',
      content_json: JSON.stringify({ type: 'doc', content: [] }),
      content_text: 'Test content',
      is_public: true,
    })
    .select('id')
    .single();

  if (storyError || !story) {
    throw new Error(`Failed to create test story: ${storyError?.message}`);
  }

  const { data: version, error: versionError } = await supabaseAdmin
    .from('story_versions')
    .select('id')
    .eq('story_id', story.id)
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  if (versionError || !version) {
    throw new Error(`Failed to get story version: ${versionError?.message}`);
  }

  // Create verification records with speaker_rating ≥ 8
  const verifications = [];
  for (let i = 0; i < count; i++) {
    verifications.push({
      story_id: story.id,
      version_id: version.id,
      speaker_id: speakerId,
      listener_id: listenerId,
      speaker_rating: 8 + Math.floor(Math.random() * 3), // 8-10 (ear achieved)
      listener_rating: 8 + Math.floor(Math.random() * 3), // 8-10
      created_at: new Date(Date.now() - (count - i) * 86400000).toISOString(),
    });
  }

  const { error: verifyError } = await supabaseAdmin
    .from('story_verifications')
    .insert(verifications);

  if (verifyError) {
    throw new Error(`Failed to create verifications: ${verifyError.message}`);
  }

  console.log(`[TEST HELPER] Created ${count} ear count records`);

  // Wait for trigger to update ears_count
  await new Promise(resolve => setTimeout(resolve, 500));

  // Verify the count was updated
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('ears_count')
    .eq('id', listenerId)
    .single();

  console.log(`[TEST HELPER] Profile ears_count: ${profile?.ears_count}`);
}

/**
 * Deletes all calibration test data for a user
 * Call this in afterEach to clean up
 */
export async function deleteCalibrationData(userId: string): Promise<void> {
  console.log(`[TEST HELPER] Deleting calibration data for user: ${userId}`);

  // Delete verifications where user is listener or speaker
  await supabaseAdmin
    .from('story_verifications')
    .delete()
    .or(`listener_id.eq.${userId},speaker_id.eq.${userId}`);

  // Delete test stories created by user
  await supabaseAdmin
    .from('stories')
    .delete()
    .eq('author_id', userId);

  console.log(`[TEST HELPER] Calibration data deleted`);
}
