/**
 * @file letters-service.ts
 * @description P581: Clarity Letters service — real Supabase implementation.
 * No mock service needed; letters are a new feature with no legacy mock layer (AD1).
 */

import * as Sentry from '@sentry/react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { logDbError } from './db-error-logger';
import type {
  ClarityLetter,
  LetterDelivery,
  LetterStorySnapshot,
  LetterPrediction,
  LetterPointResponse,
  LetterMode,
  DeliveryStatus,
  InboxItem,
  PositionType,
} from '@/app/types';
import { supabase } from '@/lib/supabase';

// Debug logging - only in development
const DEBUG = import.meta.env.DEV;
const log = (...args: unknown[]) => DEBUG && console.log('[letters-service]', ...args);

/**
 * Get the authenticated user ID or throw.
 * Uses getSession() (reads from client storage, no network) instead of getUser()
 * (hits /auth/v1/user on every call). P692: getUser() caused 27+ pending auth
 * requests on SentTab load, blocking all data queries indefinitely.
 */
async function requireAuth(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.user) {
    Sentry.captureMessage('letters-service: not authenticated', {
      level: 'error',
      extra: { authError: error?.message },
    });
    throw new Error('Not authenticated');
  }
  return session.user.id;
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
  deliveries: Array<{ receiver_email: string; receiver_name?: string }> = []
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

  // If letterId is empty but deliveryId is provided, look up letter via delivery first
  let resolvedLetterId = letterId;
  let delivery: LetterDelivery | null = null;

  if (deliveryId) {
    const { data: deliveryData, error: deliveryError } = await supabase
      .from('letter_deliveries')
      .select('*')
      .eq('id', deliveryId)
      .single();

    if (deliveryError && deliveryError.code !== 'PGRST116') {
      logDbError('getLetterForReading.delivery', deliveryError);
    }
    delivery = (deliveryData as LetterDelivery) ?? null;

    if (!resolvedLetterId && delivery) {
      resolvedLetterId = delivery.letter_id;
    }
  }

  if (!resolvedLetterId) {
    log('getLetterForReading: no letter ID resolved');
    return null;
  }

  // Fetch letter + sender profile for display name
  const { data: letterData, error: letterError } = await supabase
    .from('clarity_letters')
    .select('*')
    .eq('id', resolvedLetterId)
    .single();

  if (letterError || !letterData) {
    log('getLetterForReading: letter not found', resolvedLetterId);
    return null;
  }

  // Resolve sender profile (name + avatar fields)
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('name, avatar_url, avatar_color, has_pledged')
    .eq('id', letterData.sender_id)
    .single();

  const letterWithSender = {
    ...letterData,
    sender_display_name: senderProfile?.name || 'Someone',
    sender_avatar_url: senderProfile?.avatar_url ?? undefined,
    sender_avatar_color: senderProfile?.avatar_color ?? undefined,
    sender_has_pledged: senderProfile?.has_pledged ?? false,
  };

  const { data: snapshotsData, error: snapshotsError } = await supabase
    .from('letter_story_snapshots')
    .select('*')
    .eq('letter_id', resolvedLetterId)
    .order('position', { ascending: true });

  if (snapshotsError) {
    logDbError('getLetterForReading.snapshots', snapshotsError);
  }

  return {
    letter: letterWithSender as ClarityLetter,
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
  senderId: string,
  versionId?: string
): Promise<void> {
  // Get user from session (not getUser() which can fail on token refresh)
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Not authenticated');
  log('submitRating:', { deliveryId, storyId, rating, senderId, versionId });

  const { error } = await supabase.from('story_verifications').insert({
    story_id: storyId,
    version_id: versionId ?? null,
    speaker_id: senderId,
    listener_id: userId,
    listener_rating: rating,
    speaker_rating: 0, // Placeholder — sender predicts separately
    // Bug #1 fix: accuracy_achieved is GENERATED ALWAYS — do not set
    // Bug #2 fix: session_id is FK to clarity_sessions — letters use NULL
    source: 'letter',
    verified: false,
    session_id: null,
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
  log('revealPrediction:', { deliveryId, storyId });

  const { data, error } = await supabase.rpc('reveal_prediction', {
    p_delivery_id: deliveryId,
    p_story_id: storyId,
  });

  if (error) {
    logDbError('revealPrediction', error);
    return null;
  }

  return typeof data === 'number' ? { prediction: data } : null;
}

/**
 * Submit a point position response for a delivery.
 */
export async function submitPointResponse(
  deliveryId: string,
  pointId: string,
  position: string
): Promise<void> {
  // Note: no requireAuth() — RLS enforces auth via receiver_profile_id check.
  // requireAuth() uses getUser() (network call) which can fail even with a valid
  // session when the access token needs refresh. The Supabase client auto-refreshes
  // tokens on data calls, so the insert itself will work if the session is valid.
  log('submitPointResponse:', { deliveryId, pointId, position });

  // P705: Staging buffer — always write to letter_point_responses first (INSERT-only audit).
  const { error } = await supabase.from('letter_point_responses').insert({
    delivery_id: deliveryId,
    point_id: pointId,
    position,
  });

  if (error) {
    logDbError('submitPointResponse', error);
    throw new Error(`Failed to submit point response: ${error.message}`);
  }

  // P705: Live display store — upsert into point_positions for authenticated+verified users.
  // RLS requires auth.uid() = user_id AND is_verified = true; silently fails for unverified
  // users (their positions replay into point_positions via persist_anonymous_completion at
  // registration/verification). Do NOT throw on failure — staging write already succeeded.
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.id) {
    const { error: posErr } = await supabase.from('point_positions').upsert(
      { point_id: pointId, user_id: session.user.id, position },
      { onConflict: 'point_id,user_id' }
    );
    if (posErr) {
      // Non-fatal: unverified users will fail RLS here; their positions land via replay.
      log('submitPointResponse: point_positions upsert skipped (RLS/unverified):', posErr.message);
    }
  }
}

// ============================================================================
// TOKEN-BASED ENGAGEMENT (anon-safe RPCs)
// ============================================================================

/**
 * Submit point position via invitation token — works for anonymous recipients.
 */
export async function submitPointResponseByToken(
  token: string,
  pointId: string,
  position: string
): Promise<void> {
  log('submitPointResponseByToken');
  const { data, error } = await supabase.rpc('submit_point_response_by_token', {
    p_token: token,
    p_point_id: pointId,
    p_position: position,
  });
  if (error) {
    logDbError('submitPointResponseByToken', error);
    throw new Error(`Failed to submit point response: ${error.message}`);
  }
  if (data === false) throw new Error('Invalid or expired token');
}

/**
 * Submit story rating via invitation token — works for anonymous recipients.
 */
export async function submitRatingByToken(
  token: string,
  storyId: string,
  rating: number
): Promise<void> {
  log('submitRatingByToken');
  const { data, error } = await supabase.rpc('submit_rating_by_token', {
    p_token: token,
    p_story_id: storyId,
    p_rating: rating,
  });
  if (error) {
    logDbError('submitRatingByToken', error);
    throw new Error(`Failed to submit rating: ${error.message}`);
  }
  if (data === false) throw new Error('Invalid or expired token');
}

/**
 * Reveal prediction via invitation token — works for anonymous recipients.
 */
export async function revealPredictionByToken(
  token: string,
  storyId: string
): Promise<{ prediction: number } | null> {
  log('revealPredictionByToken');
  const { data, error } = await supabase.rpc('reveal_prediction_by_token', {
    p_token: token,
    p_story_id: storyId,
  });
  if (error) {
    logDbError('revealPredictionByToken', error);
    return null;
  }
  return data as { prediction: number } | null;
}

/**
 * Update delivery status via invitation token — works for anonymous recipients.
 */
export async function updateDeliveryStatusByToken(
  token: string,
  status: DeliveryStatus
): Promise<void> {
  log('updateDeliveryStatusByToken');
  const { error } = await supabase.rpc('update_delivery_status_by_token', {
    p_token: token,
    p_status: status,
  });
  if (error) {
    logDbError('updateDeliveryStatusByToken', error);
  }
}

// ============================================================================
// COMPLETION
// ============================================================================

/**
 * Get completion summary for a delivery — all ratings, predictions, and point responses.
 */
export async function getCompletionSummary(deliveryId: string, storyIds: string[]): Promise<{
  ratings: Array<{ story_id: string; listener_rating: number }>;
  predictions: LetterPrediction[];
  pointResponses: LetterPointResponse[];
}> {
  await requireAuth();
  log('getCompletionSummary:', deliveryId);

  const { data: { session: authSession } } = await supabase.auth.getSession();
  const listenerId = authSession?.user?.id ?? '';

  const [ratingsResult, predictionsResult, responsesResult] = await Promise.all([
    supabase
      .from('story_verifications')
      .select('story_id, listener_rating')
      .eq('listener_id', listenerId)
      .eq('source', 'letter')
      .in('story_id', storyIds),
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
 * P692: Batch fetch deliveries for multiple letters in one query.
 * Replaces N individual getDeliveriesForLetter() calls in SentTab.
 * Returns a map keyed by letter_id; missing letters get an empty array.
 */
export async function getDeliveriesForLetters(
  letterIds: string[]
): Promise<Record<string, LetterDelivery[]>> {
  if (letterIds.length === 0) return {};
  await requireAuth();
  log('getDeliveriesForLetters:', letterIds.length, 'letters');

  // P699 Phase 2: use get_deliveries_with_progress to include steps_completed + total_steps
  const { data, error } = await supabase
    .rpc('get_deliveries_with_progress', { p_letter_ids: letterIds });

  if (error) {
    logDbError('getDeliveriesForLetters', error);
    return Object.fromEntries(letterIds.map((id) => [id, []]));
  }

  const deliveries = (data ?? []) as LetterDelivery[];
  const grouped: Record<string, LetterDelivery[]> = Object.fromEntries(
    letterIds.map((id) => [id, []])
  );
  for (const delivery of deliveries) {
    grouped[delivery.letter_id]?.push(delivery);
  }
  return grouped;
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

/**
 * Claim a letter delivery — sets receiver_profile_id + marks as opened.
 * Must be called by an authenticated user when they open a letter via token.
 * Without this, all write RLS policies fail (they check receiver_profile_id = auth.uid()).
 */
export async function claimLetterDelivery(token: string): Promise<boolean> {
  log('claimLetterDelivery');

  const { data, error } = await supabase.rpc('claim_letter_delivery', {
    p_token: token,
  });

  if (error) {
    logDbError('claimLetterDelivery', error);
    return false;
  }

  if (!data || data.error) {
    log('claimLetterDelivery: rejected', data?.error);
    return false;
  }

  return true;
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

// ============================================================================
// P660: NEW LIST QUERIES
// ============================================================================

/**
 * P660 AD5: Get all sealed letters sent by a user (across all docs).
 * Joins clarity_docs to get the source doc title.
 */
export async function getAllSentLetters(senderId: string): Promise<
  Array<ClarityLetter & { doc_title: string }>
> {
  await requireAuth();
  log('getAllSentLetters:', senderId);

  const { data, error } = await supabase
    .from('clarity_letters')
    .select('*, clarity_docs!inner(title)')
    .eq('sender_id', senderId)
    .eq('status', 'sealed')
    .order('sealed_at', { ascending: false });

  if (error) {
    logDbError('getAllSentLetters', error);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    doc_title: (row.clarity_docs as { title: string })?.title ?? 'Untitled',
    clarity_docs: undefined,
  })) as Array<ClarityLetter & { doc_title: string }>;
}

/**
 * P660 AD6 / P690: Get inbox items combining received letters + responses to my letters.
 * Uses SECURITY DEFINER RPC to bypass clarity_docs SELECT RLS that would
 * drop receiver rows when the source doc is private (not owner/public).
 */
export async function getInboxItems(userId: string): Promise<InboxItem[]> {
  await requireAuth();
  log('getInboxItems:', userId);

  const { data, error } = await supabase.rpc('get_inbox_items');

  if (error) {
    logDbError('getInboxItems', error);
    return [];
  }

  const rows = (data as Array<Record<string, unknown>>) ?? [];

  return rows.slice(0, 20).map(row => ({
    type: row['type'] as InboxItem['type'],
    delivery_id: row['delivery_id'] as string,
    letter_id: row['letter_id'] as string,
    title: (row['title'] as string) ?? 'Untitled',
    actor_name: (row['actor_name'] as string) ?? 'Someone',
    timestamp: row['timestamp'] as string,
    read_at: (row['read_at'] as string | null) ?? null,
    completed_at: (row['completed_at'] as string | null) ?? null,
    stories_rated: row['stories_rated'] != null ? Number(row['stories_rated']) : undefined,
    total_stories: row['total_stories'] != null ? Number(row['total_stories']) : undefined,
    steps_completed: row['steps_completed'] != null ? Number(row['steps_completed']) : undefined,
    total_steps: row['total_steps'] != null ? Number(row['total_steps']) : undefined,
  }));
}

/**
 * P660: Mark an inbox delivery as read (calls RPC).
 */
export async function markDeliveryRead(deliveryId: string): Promise<void> {
  log('markDeliveryRead:', deliveryId);

  const { error } = await supabase.rpc('mark_inbox_item_read', {
    p_delivery_id: deliveryId,
  });

  if (error) {
    logDbError('markDeliveryRead', error);
    throw new Error(`Failed to mark as read: ${error.message}`);
  }
}

/**
 * P660: Add a recipient to an existing sealed letter (calls RPC).
 * P664: receiverName parameter added — passes p_receiver_name to RPC (DEFAULT NULL, backward compat).
 */
export async function addRecipientToSealed(
  letterId: string,
  email: string,
  receiverName?: string
): Promise<string> {
  await requireAuth();
  log('addRecipientToSealed:', { letterId, email, receiverName });

  const { data, error } = await supabase.rpc('add_recipient_to_sealed_letter', {
    p_letter_id: letterId,
    p_email: email,
    p_receiver_name: receiverName ?? null,
  });

  if (error) {
    logDbError('addRecipientToSealed', error);
    throw new Error(`Failed to add recipient: ${error.message}`);
  }

  return data as string;
}

// ============================================================================
// P684: ONE-TO-MANY PUBLIC READING & ACCOUNT GATE
// ============================================================================

/**
 * P684 AD3: Load letter + snapshots + shared predictions for anonymous one-to-many reading.
 * Uses SECURITY DEFINER RPC — no auth required, no delivery.
 * Predictions are returned so local mode can reveal them after the reader rates.
 */
export async function getLetterForPublicReading(letterId: string): Promise<{
  letter: Record<string, unknown>;
  snapshots: LetterStorySnapshot[];
  predictions: Array<{ story_id: string; prediction: number }>;
} | null> {
  const { data, error } = await supabase.rpc('get_letter_for_public_reading', {
    p_letter_id: letterId,
  });
  if (error) throw error;
  if (!data) return null;
  const result = data as Record<string, unknown>;
  return {
    letter: result.letter as Record<string, unknown>,
    snapshots: (result.snapshots ?? []) as LetterStorySnapshot[],
    predictions: (result.predictions ?? []) as Array<{ story_id: string; prediction: number }>,
  };
}

interface RequestLetterResponseSigninPayload {
  letterId: string;
  name: string;
  email: string;
  termsAccepted: boolean;
  termsVersion: string;
  ratings: Array<{ storyId: string; rating: number }>;
  positions: Array<{ pointId: string; position: number }>;
}

/**
 * P684 AD1: Request magic-link sign-in for one-to-many letter response submission.
 * Calls the `request-letter-response-signin` edge function which creates the auth user
 * if needed, mints a magic link, writes the `letter_response_pending` row, and sends
 * the branded email. Returns `{ ok: true }` on success.
 *
 * FunctionsHttpError: parse via fnError.context (IS the Response) — not fnError.context.response. See P683 KDD.
 */
export async function requestLetterResponseSignin(
  payload: RequestLetterResponseSigninPayload
): Promise<{ ok: true }> {
  const { data, error } = await supabase.functions.invoke('request-letter-response-signin', {
    body: payload,
  });

  if (error) {
    // FunctionsHttpError: parse via fnError.context (IS the Response) — not fnError.context.response. See P683 KDD.
    if (error instanceof FunctionsHttpError) {
      let body: Record<string, unknown> = {};
      try {
        body = await (error.context as Response).clone().json();
      } catch { /* body not JSON — fall through */ }
      throw new Error((body?.message as string) ?? (body?.error as string) ?? error.message ?? 'Request failed');
    }
    throw error;
  }

  if (!data?.ok) {
    throw new Error(data?.message ?? 'Request failed');
  }

  return { ok: true };
}

/**
 * P684 AD1: Confirm a letter response after magic-link authentication.
 * Called by the `/letter/:letterId/confirm` route after Supabase auth has established
 * a session. The user JWT is automatically included by the Supabase client.
 *
 * Returns `{ ok: true }` on success, or an error body so the caller can check
 * `{ error: 'expired' | 'hijack' | 'unauthenticated' | 'invalid' }`.
 *
 * FunctionsHttpError: parse via fnError.context (IS the Response) — not fnError.context.response. See P683 KDD.
 */
export async function confirmLetterResponse(
  letterId: string
): Promise<{ ok: true } | { error: string; message?: string }> {
  const { data, error } = await supabase.functions.invoke('confirm-letter-response', {
    body: { letterId },
  });

  if (error) {
    // FunctionsHttpError: parse via fnError.context (IS the Response) — not fnError.context.response. See P683 KDD.
    if (error instanceof FunctionsHttpError) {
      let body: Record<string, unknown> = {};
      try {
        body = await (error.context as Response).clone().json();
      } catch { /* body not JSON — fall through */ }
      // Return the error body so caller can branch on error type
      return {
        error: (body?.error as string) ?? 'unknown',
        message: (body?.message as string) ?? error.message,
      };
    }
    throw error;
  }

  if (!data?.ok) {
    return { error: data?.error ?? 'unknown', message: data?.message };
  }

  return { ok: true };
}


interface RatingEntry { storyId: string; rating: number }
interface PositionEntry { pointId: string; position: number | string }

/**
 * P684 AD4 Flow 4: Submit letter response for already-authenticated one-to-many readers.
 * No email round-trip — user is already signed in. Performs inline sequential inserts
 * under the user's JWT.
 *
 * No partial rollback in v1 — documented limitation per spec AD4.
 */
export async function submitLetterResponseAuthenticated(
  letterId: string,
  ratings: RatingEntry[],
  positions: PositionEntry[],
  termsVersion: string,
): Promise<string> {
  // P692: use getSession(), not getUser() — avoids auth race on letter flow
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    Sentry.captureMessage('submitLetterResponseAuthenticated: not authenticated', {
      level: 'error',
      extra: { authError: sessionError?.message },
    });
    throw new Error('Not authenticated');
  }

  const user = session.user;

  // 1. Fetch the letter to get sender_id (needed for story_verifications.speaker_id)
  const { data: letterData, error: letterError } = await supabase
    .from('clarity_letters')
    .select('sender_id')
    .eq('id', letterId)
    .single();

  if (letterError || !letterData) {
    throw new Error(`Failed to fetch letter: ${letterError?.message}`);
  }

  // 2. Create delivery via SECURITY DEFINER RPC
  //    (letter_deliveries has WITH CHECK(false) RLS; direct client inserts always fail)
  //    RPC is idempotent: returns existing delivery_id if already submitted.
  const { data: deliveryId, error: deliveryError } = await supabase
    .rpc('create_letter_delivery', {
      p_letter_id: letterId,
      p_stories_rated: ratings.length,
    });

  if (deliveryError || !deliveryId) {
    if (deliveryError?.message?.includes('Sender cannot submit')) {
      Sentry.captureMessage('submitLetterResponseAuthenticated: sender attempted own letter submission', {
        level: 'warning',
        extra: { letterId, error: deliveryError?.message },
      });
    } else {
      Sentry.captureMessage('submitLetterResponseAuthenticated: create_letter_delivery RPC failed', {
        level: 'error',
        extra: { letterId, error: deliveryError?.message ?? 'null delivery ID returned' },
      });
    }
    throw new Error(`Failed to create delivery: ${deliveryError?.message}`);
  }

  // 3. Insert story_verifications rows from ratings
  if (ratings.length > 0) {
    const verificationRows = ratings.map((r) => ({
      story_id: r.storyId,
      speaker_id: letterData.sender_id,
      listener_id: user.id,
      listener_rating: r.rating,
      speaker_rating: 0, // Placeholder — sender predicts separately
      source: 'letter',
      verified: false,
      session_id: null,
    }));

    const { error: ratingsError } = await supabase
      .from('story_verifications')
      .insert(verificationRows);

    if (ratingsError) {
      logDbError('submitLetterResponseAuthenticated.ratings', ratingsError);
      throw new Error(`Failed to insert ratings: ${ratingsError.message}`);
    }
  }

  // 4. Insert letter_point_responses rows from positions
  // positions come from letter-response-confirm-page.tsx as POSITION_VALUES numerics (-3..3).
  // Convert back to PositionType labels before storing so results page can highlight correctly.
  const NUMERIC_TO_POSITION_TYPE_AUTH = new Map<number, string>([
    [-3, 'strongly_disagree'],
    [-2, 'disagree'],
    [-1, 'somewhat_disagree'],
    [0, 'unsure'],
    [1, 'somewhat_agree'],
    [2, 'agree'],
    [3, 'strongly_agree'],
  ]);
  const VALID_POSITION_TYPES = new Set(NUMERIC_TO_POSITION_TYPE_AUTH.values());

  if (positions.length > 0) {
    const positionRows = positions.map((p) => {
      const positionLabel =
        typeof p.position === 'number'
          ? (NUMERIC_TO_POSITION_TYPE_AUTH.get(p.position) ?? String(p.position))
          : p.position;
      return {
        delivery_id: deliveryId,
        point_id: p.pointId,
        position: positionLabel,
      };
    });

    const { error: positionsError } = await supabase
      .from('letter_point_responses')
      .insert(positionRows);

    if (positionsError) {
      logDbError('submitLetterResponseAuthenticated.positions', positionsError);
      throw new Error(`Failed to insert positions: ${positionsError.message}`);
    }

    // 4b. P708: Dual-write to point_positions (live display store).
    // Mirror pattern from submitPointResponse. RLS requires auth.uid() = user_id
    // AND is_verified = true — silently fails for unverified users; their positions
    // replay into point_positions via persist_anonymous_completion at verification.
    // Do NOT throw on failure — staging write above already succeeded.
    const pointPositionRows = positions
      .filter((p) =>
        typeof p.position === 'number'
          ? NUMERIC_TO_POSITION_TYPE_AUTH.has(p.position)
          : VALID_POSITION_TYPES.has(String(p.position))
      )
      .map((p) => ({
        point_id: p.pointId,
        user_id: user.id,
        position:
          typeof p.position === 'number'
            ? (NUMERIC_TO_POSITION_TYPE_AUTH.get(p.position) ?? String(p.position))
            : String(p.position),
      }));

    if (pointPositionRows.length > 0) {
      const { error: ppError } = await supabase
        .from('point_positions')
        .upsert(pointPositionRows, { onConflict: 'point_id,user_id' });

      if (ppError) {
        logDbError('submitLetterResponseAuthenticated.point_positions', ppError);
        // Non-fatal: unverified users fail RLS here; positions replay at verification.
      }
    }
  }

  // 5. Insert terms_acceptances row (ignore duplicate on (user_id, terms_version))
  const { error: termsError } = await supabase
    .from('terms_acceptances')
    .upsert(
      {
        user_id: user.id,
        terms_version: termsVersion,
        ip_hash: null, // Client-side IP hash not reliable; server-side preferred for audits
        user_agent: navigator.userAgent,
      },
      { onConflict: 'user_id,terms_version', ignoreDuplicates: true }
    );

  if (termsError) {
    // Non-fatal: log but don't block — terms row is secondary to delivery + responses
    logDbError('submitLetterResponseAuthenticated.terms', termsError);
  }

  return deliveryId;
}

/**
 * P660 AD7: Get unread inbox count for badge display.
 * Counts: received letters with no read_at + completed responses to my letters with no read_at.
 * P709: Excludes self-sent letters from received count (mirrors get_inbox_items RPC filter).
 */
export async function getUnreadLetterCount(userId: string): Promise<number> {
  log('getUnreadLetterCount:', userId);

  // Fetch letters the user sent — used by both branches below.
  // Select status too so Branch 2 can filter to sealed without a second DB call.
  const { data: ownLetters, error: errOwn } = await supabase
    .from('clarity_letters')
    .select('id, status')
    .eq('sender_id', userId);

  if (errOwn) logDbError('getUnreadLetterCount.ownLetters', errOwn);
  const ownLetterIds = ownLetters?.map(l => l.id) ?? [];

  // Branch 1: Count received unread, excluding self-sent deliveries.
  let receivedQuery = supabase
    .from('letter_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_profile_id', userId)
    .is('read_at', null);
  if (ownLetterIds.length > 0) {
    receivedQuery = receivedQuery.not('letter_id', 'in', `(${ownLetterIds.join(',')})`);
  }
  const { count: receivedCount, error: err1 } = await receivedQuery;
  if (err1) logDbError('getUnreadLetterCount.received', err1);

  // Branch 2: Count unread responses to my sealed letters (in_progress or completed).
  // Mirrors get_inbox_items which surfaces status IN ('in_progress', 'completed').
  // Reuses ownLetters from above — no second DB call.
  const sealedIds = ownLetters?.filter(l => l.status === 'sealed').map(l => l.id) ?? [];
  let responsesCount = 0;
  if (sealedIds.length > 0) {
    const { count, error: err2 } = await supabase
      .from('letter_deliveries')
      .select('id', { count: 'exact', head: true })
      .in('letter_id', sealedIds)
      .in('status', ['in_progress', 'completed'])
      .neq('receiver_profile_id', userId)
      .is('read_at', null);

    if (err2) logDbError('getUnreadLetterCount.responses', err2);
    responsesCount = count ?? 0;
  }

  return (receivedCount ?? 0) + responsesCount;
}

// ============================================================================
// P699: Letter Results RPC
// ============================================================================

export interface ResultsProfileData {
  id: string;
  name: string;
  avatarUrl?: string;
  avatarColor?: string;
  role?: string;
  hasPledged: boolean;
  earsCount: number;
}

export interface LetterResultsData {
  perspective: 'sender' | 'receiver';
  /** Convenience shorthand — extracted from senderProfile.name */
  senderName: string;
  /** Convenience shorthand — extracted from receiverProfile.name, null when receiver unknown */
  receiverName: string | null;
  senderProfile: ResultsProfileData;
  receiverProfile: ResultsProfileData | null;
  snapshots: LetterStorySnapshot[];
  predictions: Array<{ story_id: string; prediction: number }>;
  ratings: Array<{ story_id: string; listener_rating: number }>;
  pointResponses: Array<{ point_id: string; delivery_id: string; position: PositionType }>;
}

/**
 * P699: Fetch full letter results via get_letter_results SECURITY DEFINER RPC.
 * Works for both sender (no deliveryId) and receiver (with deliveryId).
 * Returns null if unauthorized, letter not found, or not sealed.
 */
export async function getLetterResults(
  letterId: string,
  deliveryId?: string
): Promise<LetterResultsData | null> {
  await requireAuth();
  log('getLetterResults:', letterId, deliveryId);

  const params: Record<string, string> = { p_letter_id: letterId };
  if (deliveryId) params['p_delivery_id'] = deliveryId;

  const { data, error } = await supabase.rpc('get_letter_results', params);

  if (error) {
    logDbError('getLetterResults', error);
    return null;
  }

  // RPC returns TABLE — data is an array; null/empty = unauthorized or not found
  const rows = data as Array<Record<string, unknown>> | null;
  if (!rows || rows.length === 0) return null;

  const row = rows[0];

  const snapshotRows = (row['snapshots'] as Array<Record<string, unknown>>) ?? [];
  const predictionRows = (row['predictions'] as Array<Record<string, unknown>>) ?? [];
  const ratingRows = (row['ratings'] as Array<Record<string, unknown>>) ?? [];
  const responseRows = (row['point_responses'] as Array<Record<string, unknown>>) ?? [];

  const rawSenderProfile = row['sender_profile'] as Record<string, unknown> | null ?? {};
  const rawReceiverProfile = row['receiver_profile'] as Record<string, unknown> | null;

  const senderProfile: ResultsProfileData = {
    id: (rawSenderProfile['id'] as string) ?? '',
    name: (rawSenderProfile['name'] as string) ?? '',
    avatarUrl: (rawSenderProfile['avatar_url'] as string | null) ?? undefined,
    avatarColor: (rawSenderProfile['avatar_color'] as string | null) ?? undefined,
    role: (rawSenderProfile['role'] as string | null) ?? undefined,
    hasPledged: (rawSenderProfile['has_pledged'] as boolean) ?? false,
    earsCount: (rawSenderProfile['ears_count'] as number) ?? 0,
  };

  const receiverProfile: ResultsProfileData | null = rawReceiverProfile ? {
    id: (rawReceiverProfile['id'] as string) ?? '',
    name: (rawReceiverProfile['name'] as string) ?? '',
    avatarUrl: (rawReceiverProfile['avatar_url'] as string | null) ?? undefined,
    avatarColor: (rawReceiverProfile['avatar_color'] as string | null) ?? undefined,
    role: (rawReceiverProfile['role'] as string | null) ?? undefined,
    hasPledged: (rawReceiverProfile['has_pledged'] as boolean) ?? false,
    earsCount: (rawReceiverProfile['ears_count'] as number) ?? 0,
  } : null;

  return {
    perspective: row['perspective'] as 'sender' | 'receiver',
    senderName: senderProfile.name,
    receiverName: receiverProfile?.name ?? null,
    senderProfile,
    receiverProfile,
    snapshots: snapshotRows.map(s => ({
      letter_id: letterId,
      story_id: s['story_id'] as string,
      version_id: s['version_id'] as string,
      position: s['position'] as number,
      point_config: s['point_config'] as Record<string, unknown>,
      visibility: s['visibility'] as string,
    })),
    predictions: predictionRows.map(p => ({
      story_id: p['story_id'] as string,
      prediction: p['prediction'] as number,
    })),
    ratings: ratingRows.map(r => ({
      story_id: r['story_id'] as string,
      listener_rating: r['listener_rating'] as number,
    })),
    pointResponses: responseRows.map(r => ({
      point_id: r['point_id'] as string,
      delivery_id: r['delivery_id'] as string,
      position: r['position'] as PositionType,
    })),
  };
}
