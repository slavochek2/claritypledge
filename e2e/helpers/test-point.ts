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
import { supabaseAdmin } from '../../src/lib/supabase-admin';

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

/**
 * Creates a test point in the database
 * @param firstValidatorId - User ID of the first validator (must be verified user)
 * @param options - Optional overrides for point properties
 */
export async function createTestPoint(
  firstValidatorId: string,
  options: {
    statement?: string;
    context?: string;
    tags?: string[];
  } = {}
): Promise<TestPoint> {
  const statement = options.statement || `E2E Test Point: ${Date.now()}`;
  const context = options.context || 'Testing point functionality';
  const tags = options.tags || ['test'];

  console.log(`[TEST HELPER] Creating test point: ${statement}`);

  const { data, error } = await supabaseAdmin
    .from('points')
    .insert({
      statement,
      context,
      first_validator_id: firstValidatorId,
      tags,
    })
    .select('id, statement, first_validator_id')
    .single();

  if (error) {
    console.error('[TEST HELPER] Failed to create test point:', error);
    throw new Error(`Failed to create test point: ${error.message}`);
  }

  console.log(`[TEST HELPER] Test point created: ${data.id}`);

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
  // so we use the user's own session (same pattern as createTestUser's profile creation).
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    throw new Error(`Failed to get user for position creation: ${userError?.message}`);
  }

  const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email: userData.user.email,
    password: TEST_PASSWORD,
  });

  if (signInError || !signInData.session) {
    throw new Error(`Failed to sign in user for position creation: ${signInError?.message}`);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL!;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
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
