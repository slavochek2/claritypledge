/**
 * @file test-point.ts
 *
 * E2E Test Helpers for Point and Position Management
 *
 * These helpers use the Supabase Admin API to:
 * 1. Create test points with verified validators
 * 2. Create test positions for users on points
 * 3. Clean up test data after tests
 *
 * All helpers use service_role key which bypasses RLS via
 * "Test data: service_role bypass" policies.
 */

import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from './supabase-admin';

// Same password used in createTestUser — must match
const TEST_PASSWORD = 'test-password-12345';

export interface TestPoint {
  id: string;
  statement: string;
  firstValidatorId: string;
}

export interface TestPosition {
  pointId: string;
  userId: string;
  position: 'agree' | 'disagree' | 'unsure' | null;
}

type PointOptions = {
  statement?: string;
  tags?: string[];
  visibility?: 'public' | 'private';
};

/**
 * Creates a test point in the database.
 * Supports two call signatures:
 *   createTestPoint(firstValidatorId, options?)
 *   createTestPoint(firstValidatorId, storyId, options?) — also links point to story
 */
export async function createTestPoint(
  firstValidatorId: string,
  storyIdOrOptions?: string | PointOptions,
  extraOptions?: PointOptions
): Promise<TestPoint> {
  let storyId: string | undefined;
  let options: PointOptions;

  if (typeof storyIdOrOptions === 'string') {
    storyId = storyIdOrOptions;
    options = extraOptions ?? {};
  } else {
    storyId = undefined;
    options = storyIdOrOptions ?? {};
  }

  const statement = options.statement || `E2E Test Point: ${Date.now()}`;
  const tags = options.tags || ['test'];

  console.log(`[TEST HELPER] Creating test point: ${statement}`);

  const { data, error } = await supabaseAdmin
    .from('points')
    .insert({
      statement,
      first_validator_id: firstValidatorId,
      tags,
      ...(options.visibility ? { visibility: options.visibility } : {}),
    })
    .select('id, statement, first_validator_id')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create test point:', error);
    throw new Error(`Failed to create test point: ${error.message}`);
  }

  console.log(`[TEST HELPER] Test point created: ${data.id}`);

  // If storyId provided, link the point to the story
  if (storyId) {
    const { error: linkError } = await supabaseAdmin
      .from('story_points')
      .insert({
        story_id: storyId,
        point_id: data.id,
        author_id: firstValidatorId,
      });
    if (linkError) {
      console.error('[TEST HELPER] Failed to link point to story:', linkError);
      throw new Error(`Failed to link point to story: ${linkError.message}`);
    }
    console.log(`[TEST HELPER] Point linked to story: ${storyId}`);
  }

  return {
    id: data.id,
    statement: data.statement,
    firstValidatorId: data.first_validator_id,
  };
}

/**
 * Creates a position for a user on a point
 * @param pointId - ID of the point
 * @param userId - ID of the user taking the position
 * @param position - Position value ('agree', 'disagree', 'unsure', or null to remove)
 */
export async function createTestPosition(
  pointId: string,
  userId: string,
  position: 'agree' | 'disagree' | 'unsure' | null
): Promise<TestPosition> {
  console.log(`[TEST HELPER] Creating position: ${position} on point ${pointId} for user ${userId}`);

  if (position === null) {
    // Remove position
    const { error } = await supabaseAdmin
      .from('point_positions')
      .delete()
      .eq('point_id', pointId)
      .eq('user_id', userId);

    if (error) {
      console.error('[TEST HELPER] Failed to remove position:', error);
      throw new Error(`Failed to remove position: ${error.message}`);
    }

    console.log(`[TEST HELPER] Position removed`);
    return { pointId, userId, position: null };
  }

  // Sign in as the user to insert with their JWT.
  // The point_positions INSERT policy requires auth.uid() = user_id and is_verified = true,
  // so we use the user's own session.
  //
  // IMPORTANT: Use a temp client (not supabaseAdmin) for sign-in to avoid corrupting
  // supabaseAdmin's service_role session. Calling supabaseAdmin.auth.signInWithPassword()
  // sets the in-memory session to the user's JWT, causing all subsequent admin inserts
  // to run as the user (not service_role) — breaking e.g. createTestStory with
  // visibility: 'private' (code 42501, RLS violation).
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    throw new Error(`Failed to get user for position creation: ${userError?.message}`);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
  const tempSignInClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: signInData, error: signInError } = await tempSignInClient.auth.signInWithPassword({
    email: userData.user.email,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in user for position creation: ${signInError?.message}`);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${signInData.session.access_token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await userClient
    .from('point_positions')
    .upsert({
      point_id: pointId,
      user_id: userId,
      position,
    }, {
      onConflict: 'point_id,user_id',
    });

  if (error) {
    console.error('[TEST HELPER] Failed to create/update position:', error);
    throw new Error(`Failed to create/update position: ${error.message}`);
  }

  console.log(`[TEST HELPER] Position created/updated: ${position}`);

  return { pointId, userId, position };
}

/**
 * Deletes a test point and its related data
 * @param pointId - ID of the point to delete
 *
 * Note: CASCADE will automatically delete:
 * - point_positions (via point_id FK)
 * - point_position_history (via point_id FK)
 * - story_points (via point_id FK)
 */
export async function deleteTestPoint(pointId: string): Promise<void> {
  console.log(`[TEST HELPER] Deleting test point: ${pointId}`);

  const { error } = await supabaseAdmin
    .from('points')
    .delete()
    .eq('id', pointId);

  if (error) {
    console.warn(`[TEST HELPER] Error deleting point ${pointId}:`, error);
    // Don't throw - point might already be deleted via CASCADE
  } else {
    console.log(`[TEST HELPER] Test point deleted: ${pointId}`);
  }
}
