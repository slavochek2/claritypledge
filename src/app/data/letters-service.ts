/**
 * @file letters-service.ts
 * @description P581: Clarity Letters service — real Supabase implementation.
 * No mock service needed; letters are a new feature with no legacy mock layer (AD1).
 */

import * as Sentry from '@sentry/react';
import { logDbError } from './db-error-logger';
import type {
  ClarityLetter,
  LetterDelivery,
  LetterStorySnapshot,
  LetterPrediction,
  LetterPointResponse,
  LetterMode,
  DeliveryStatus,
} from '@/app/types';
import { supabase } from '@/lib/supabase';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
const log = (...args: unknown[]) => DEBUG && console.log('[letters-service]', ...args);

/**
 * Get the authenticated user or throw.
 */
async function requireAuth(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    Sentry.captureMessage('letters-service: not authenticated', {
      level: 'error',
      extra: { authError: error?.message },
    });
    throw new Error('Not authenticated');
  }
  return user.id;
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Create a new clarity letter from a source doc.
 */
export async function createLetter(
  sourceDocId: string,
  senderId: string,
  mode: LetterMode
): Promise<ClarityLetter> {
  await requireAuth();
  log('createLetter:', { sourceDocId, senderId, mode });

  const { data, error } = await supabase
    .from('clarity_letters')
    .insert({
      source_doc_id: sourceDocId,
      sender_id: senderId,
      mode,
    })
    .select('*')
    .single();

  if (error || !data) {
    logDbError('createLetter', error);
    throw new Error(`Failed to create letter: ${error?.message}`);
  }

  return data as ClarityLetter;
}

// ============================================================================
// SEAL & SEND
// ============================================================================

/**
 * Seal a letter — calls the seal_and_send_letter RPC which snapshots stories
 * and creates deliveries atomically.
 */
export async function sealLetter(
  letterId: string,
  predictions: Array<{ story_id: string; prediction: number }> = [],
  deliveries: Array<{ receiver_email: string }> = []
): Promise<{ success: boolean; error?: string }> {
  await requireAuth();
  log('sealLetter:', { letterId, predictions, deliveries });

  const { data, error } = await supabase.rpc('seal_and_send_letter', {
    p_letter_id: letterId,
    p_predictions: predictions,
    p_deliveries: deliveries,
  });

  if (error) {
    logDbError('sealLetter', error);
    return { success: false, error: error.message };
  }

  return { success: true, ...(data as object) };
}

// ============================================================================
// READ — Receiver View
// ============================================================================

type LetterReadingData = {
  letter: ClarityLetter;
  snapshots: LetterStorySnapshot[];
  delivery: LetterDelivery | null;
};

/**
 * Get letter data for reading via invitation token (anonymous-safe).
 * Uses SECURITY DEFINER RPC — bypasses RLS so anon recipients can read.
 * Does NOT include predictions — sealed-bid pattern.
 */
export async function getLetterForReadingByToken(
  token: string
): Promise<LetterReadingData | null> {
  log('getLetterForReadingByToken');

  const { data, error } = await supabase.rpc('get_letter_for_reading', {
    p_token: token,
  });

  if (error) {
    logDbError('getLetterForReadingByToken', error);
    return null;
  }

  if (!data) return null;

  return {
    letter: data.letter as ClarityLetter,
    snapshots: (data.snapshots ?? []) as LetterStorySnapshot[],
    delivery: data.delivery as LetterDelivery | null,
  };
}

/**
 * Get letter data for reading (authenticated receiver view).
 * Uses direct table queries — requires auth.uid() (RLS-protected).
 * Does NOT include predictions — sealed-bid pattern.
 */
export async function getLetterForReading(
  letterId: string,
  deliveryId?: string
): Promise<LetterReadingData | null> {
  log('getLetterForReading:', { letterId, deliveryId });

  const { data: letterData, error: letterError } = await supabase
    .from('clarity_letters')
    .select('*')
    .eq('id', letterId)
    .single();

  if (letterError || !letterData) {
    log('getLetterForReading: letter not found', letterId);
    return null;
  }

  const { data: snapshotsData, error: snapshotsError } = await supabase
    .from('letter_story_snapshots')
    .select('*')
    .eq('letter_id', letterId)
    .order('position', { ascending: true });

  if (snapshotsError) {
    logDbError('getLetterForReading.snapshots', snapshotsError);
  }

  let delivery: LetterDelivery | null = null;
  if (deliveryId) {
    const { data: deliveryData, error: deliveryError } = await supabase
      .from('letter_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();

    if (deliveryError) {
      logDbError('getLetterForReading.delivery', deliveryError);
    }
    delivery = (deliveryData as LetterDelivery) ?? null;
  }

  return {
    letter: letterData as ClarityLetter,
    snapshots: (snapshotsData ?? []) as LetterStorySnapshot[],
    delivery,
  };
}

// ============================================================================
// READ — Sender View
// ============================================================================

/**
 * Get full letter data for the sender — includes all deliveries and predictions.
 */
export async function getLetterForSender(
  letterId: string
): Promise<{
  letter: ClarityLetter;
  snapshots: LetterStorySnapshot[];
  deliveries: LetterDelivery[];
  predictions: LetterPrediction[];
} | null> {
  await requireAuth();
  log('getLetterForSender:', letterId);

  const { data: letterData, error: letterError } = await supabase
    .from('clarity_letters')
    .select('*')
    .eq('id', letterId)
    .single();

  if (letterError || !letterData) {
    log('getLetterForSender: letter not found', letterId);
    return null;
  }

  // Fetch all related data in parallel
  const [snapshotsResult, deliveriesResult, predictionsResult] = await Promise.all([
    supabase
      .from('letter_story_snapshots')
      .select('*')
      .eq('letter_id', letterId)
      .order('position', { ascending: true }),
    supabase
      .from('letter_deliveries')
      .select('*')
      .eq('letter_id', letterId)
      .order('created_at', { ascending: true }),
    supabase
      .from('letter_predictions')
      .select('*')
      .eq('letter_id', letterId)
      .order('created_at', { ascending: true }),
  ]);

  if (snapshotsResult.error) logDbError('getLetterForSender.snapshots', snapshotsResult.error);
  if (deliveriesResult.error) logDbError('getLetterForSender.deliveries', deliveriesResult.error);
  if (predictionsResult.error)
    logDbError('getLetterForSender.predictions', predictionsResult.error);

  return {
    letter: letterData as ClarityLetter,
    snapshots: (snapshotsResult.data ?? []) as LetterStorySnapshot[],
    deliveries: (deliveriesResult.data ?? []) as LetterDelivery[],
    predictions: (predictionsResult.data ?? []) as LetterPrediction[],
  };
}

// ============================================================================
// RATINGS & RESPONSES
// ============================================================================

/**
 * Submit a rating for a story in a letter delivery.
 * Inserts into story_verifications with source='letter', verified=false.
 */
export async function submitRating(
  deliveryId: string,
  storyId: string,
  rating: number,
  senderId: string
): Promise<void> {
  const userId = await requireAuth();
  log('submitRating:', { deliveryId, storyId, rating, senderId });

  const { error } = await supabase.from('story_verifications').insert({
    story_id: storyId,
    speaker_id: senderId,
    listener_id: userId,
    listener_rating: rating,
    speaker_rating: 0, // Placeholder — sender predicts separately
    accuracy_achieved: false, // Determined after reveal
    source: 'letter',
    verified: false,
    session_id: deliveryId, // Reuse session_id column to link to delivery
  });

  if (error) {
    logDbError('submitRating', error);
    throw new Error(`Failed to submit rating: ${error.message}`);
  }
}

/**
 * Reveal prediction for a specific story in a delivery — calls reveal_prediction RPC.
 */
export async function revealPrediction(
  deliveryId: string,
  storyId: string
): Promise<{ prediction: number } | null> {
  await requireAuth();
  log('revealPrediction:', { deliveryId, storyId });

  const { data, error } = await supabase.rpc('reveal_prediction', {
    p_delivery_id: deliveryId,
    p_story_id: storyId,
  });

  if (error) {
    logDbError('revealPrediction', error);
    return null;
  }

  return data as { prediction: number } | null;
}

/**
 * Submit a point position response for a delivery.
 */
export async function submitPointResponse(
  deliveryId: string,
  pointId: string,
  position: string
): Promise<void> {
  await requireAuth();
  log('submitPointResponse:', { deliveryId, pointId, position });

  const { error } = await supabase.from('letter_point_responses').insert({
    delivery_id: deliveryId,
    point_id: pointId,
    position,
  });

  if (error) {
    logDbError('submitPointResponse', error);
    throw new Error(`Failed to submit point response: ${error.message}`);
  }
}

// ============================================================================
// COMPLETION
// ============================================================================

/**
 * Get completion summary for a delivery — all ratings, predictions, and point responses.
 */
export async function getCompletionSummary(deliveryId: string): Promise<{
  ratings: Array<{ story_id: string; listener_rating: number }>;
  predictions: LetterPrediction[];
  pointResponses: LetterPointResponse[];
}> {
  await requireAuth();
  log('getCompletionSummary:', deliveryId);

  const [ratingsResult, predictionsResult, responsesResult] = await Promise.all([
    supabase
      .from('story_verifications')
      .select('story_id, listener_rating')
      .eq('session_id', deliveryId)
      .eq('source', 'letter'),
    supabase
      .from('letter_predictions')
      .select('*')
      .eq('delivery_id', deliveryId),
    supabase
      .from('letter_point_responses')
      .select('*')
      .eq('delivery_id', deliveryId),
  ]);

  if (ratingsResult.error) logDbError('getCompletionSummary.ratings', ratingsResult.error);
  if (predictionsResult.error)
    logDbError('getCompletionSummary.predictions', predictionsResult.error);
  if (responsesResult.error) logDbError('getCompletionSummary.responses', responsesResult.error);

  return {
    ratings: (ratingsResult.data ?? []) as Array<{ story_id: string; listener_rating: number }>,
    predictions: (predictionsResult.data ?? []) as LetterPrediction[],
    pointResponses: (responsesResult.data ?? []) as LetterPointResponse[],
  };
}

// ============================================================================
// DELIVERY MANAGEMENT
// ============================================================================

/**
 * Get all deliveries for a letter with optional profile data.
 */
export async function getDeliveriesForLetter(letterId: string): Promise<LetterDelivery[]> {
  await requireAuth();
  log('getDeliveriesForLetter:', letterId);

  const { data, error } = await supabase
    .from('letter_deliveries')
    .select('*')
    .eq('letter_id', letterId)
    .order('created_at', { ascending: true });

  if (error) {
    logDbError('getDeliveriesForLetter', error);
    return [];
  }

  return (data ?? []) as LetterDelivery[];
}

/**
 * Update delivery status (e.g., opened, in_progress, completed).
 */
export async function updateDeliveryStatus(
  deliveryId: string,
  status: DeliveryStatus
): Promise<void> {
  log('updateDeliveryStatus:', { deliveryId, status });

  const updates: Record<string, unknown> = { status };
  if (status === 'opened') updates.opened_at = new Date().toISOString();
  if (status === 'completed') updates.completed_at = new Date().toISOString();

  const { error } = await supabase
    .from('letter_deliveries')
    .update(updates)
    .eq('id', deliveryId);

  if (error) {
    logDbError('updateDeliveryStatus', error);
    throw new Error(`Failed to update delivery status: ${error.message}`);
  }
}

// ============================================================================
// TOKEN-BASED ACCESS
// ============================================================================

/**
 * Look up a letter by invitation token — calls get_letter_by_token RPC.
 */
export async function getLetterByToken(
  token: string
): Promise<{ letter_id: string; delivery_id: string } | null> {
  log('getLetterByToken:', token);

  const { data, error } = await supabase.rpc('get_letter_by_token', {
    p_token: token,
  });

  if (error) {
    logDbError('getLetterByToken', error);
    return null;
  }

  return data as { letter_id: string; delivery_id: string } | null;
}

// ============================================================================
// LIST QUERIES
// ============================================================================

/**
 * Get all sent letters for a specific doc.
 */
export async function getSentLettersForDoc(docId: string): Promise<ClarityLetter[]> {
  await requireAuth();
  log('getSentLettersForDoc:', docId);

  const { data, error } = await supabase
    .from('clarity_letters')
    .select('*')
    .eq('source_doc_id', docId)
    .order('created_at', { ascending: false });

  if (error) {
    logDbError('getSentLettersForDoc', error);
    return [];
  }

  return (data ?? []) as ClarityLetter[];
}

/**
 * Get all received letters (deliveries) for the current user.
 */
export async function getReceivedLetters(userId: string): Promise<LetterDelivery[]> {
  await requireAuth();
  log('getReceivedLetters:', userId);

  const { data, error } = await supabase
    .from('letter_deliveries')
    .select('*')
    .eq('receiver_profile_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logDbError('getReceivedLetters', error);
    return [];
  }

  return (data ?? []) as LetterDelivery[];
}
