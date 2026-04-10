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
  InboxItem,
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

    if (deliveryError) {
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

  // Resolve sender display name (profiles table join)
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', letterData.sender_id)
    .single();

  const letterWithSender = {
    ...letterData,
    sender_display_name: senderProfile?.name || 'Someone',
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
  // Note: no requireAuth() — RLS enforces auth via receiver_profile_id check.
  // requireAuth() uses getUser() (network call) which can fail even with a valid
  // session when the access token needs refresh. The Supabase client auto-refreshes
  // tokens on data calls, so the insert itself will work if the session is valid.
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
 * P660 AD6: Get inbox items combining received letters + responses to my letters.
 * Client-side merge, sorted by timestamp descending.
 */
export async function getInboxItems(userId: string): Promise<InboxItem[]> {
  await requireAuth();
  log('getInboxItems:', userId);

  // Query 1: Letters received by this user
  const { data: receivedData, error: receivedError } = await supabase
    .from('letter_deliveries')
    .select('*, clarity_letters!inner(source_doc_id, sender_id, clarity_docs!inner(title), profiles!clarity_letters_sender_id_fkey(name))')
    .eq('receiver_profile_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (receivedError) logDbError('getInboxItems.received', receivedError);

  // Query 2: Responses to letters I sent (completed deliveries from others)
  const { data: responsesData, error: responsesError } = await supabase
    .from('letter_deliveries')
    .select('*, clarity_letters!inner(source_doc_id, sender_id, clarity_docs!inner(title)), profiles!letter_deliveries_receiver_profile_id_fkey(name)')
    .eq('clarity_letters.sender_id', userId)
    .in('status', ['completed'])
    .neq('receiver_profile_id', userId)
    .order('completed_at', { ascending: false })
    .limit(20);

  if (responsesError) logDbError('getInboxItems.responses', responsesError);

  const items: InboxItem[] = [];

  // Map received letters
  for (const row of (receivedData ?? []) as Record<string, unknown>[]) {
    const letter = row.clarity_letters as Record<string, unknown>;
    const doc = letter?.clarity_docs as { title: string } | null;
    const sender = letter?.profiles as { name: string } | null;
    items.push({
      type: 'received',
      delivery_id: row.id as string,
      letter_id: row.letter_id as string,
      title: doc?.title ?? 'Untitled',
      actor_name: sender?.name ?? 'Someone',
      timestamp: row.created_at as string,
      read_at: row.read_at as string | null,
    });
  }

  // Map responses to my letters
  for (const row of (responsesData ?? []) as Record<string, unknown>[]) {
    const letter = row.clarity_letters as Record<string, unknown>;
    const doc = letter?.clarity_docs as { title: string } | null;
    const responder = row.profiles as { name: string } | null;
    const hasProfileId = !!(row.receiver_profile_id);
    items.push({
      type: hasProfileId ? 'recipient_responded' : 'link_respondent',
      delivery_id: row.id as string,
      letter_id: row.letter_id as string,
      title: doc?.title ?? 'Untitled',
      actor_name: responder?.name ?? 'Someone',
      timestamp: (row.completed_at ?? row.created_at) as string,
      read_at: row.read_at as string | null,
    });
  }

  // Sort by timestamp descending
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return items.slice(0, 20);
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

/**
 * P660 AD7: Get unread inbox count for badge display.
 * Counts: received letters with no read_at + completed responses to my letters with no read_at.
 */
export async function getUnreadLetterCount(userId: string): Promise<number> {
  log('getUnreadLetterCount:', userId);

  // Count received unread
  const { count: receivedCount, error: err1 } = await supabase
    .from('letter_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_profile_id', userId)
    .is('read_at', null);

  if (err1) logDbError('getUnreadLetterCount.received', err1);

  // Count unread responses to my letters
  const { data: myLetterIds, error: err2 } = await supabase
    .from('clarity_letters')
    .select('id')
    .eq('sender_id', userId)
    .eq('status', 'sealed');

  if (err2) logDbError('getUnreadLetterCount.myLetters', err2);

  let responsesCount = 0;
  if (myLetterIds?.length) {
    const ids = myLetterIds.map(l => l.id);
    const { count, error: err3 } = await supabase
      .from('letter_deliveries')
      .select('id', { count: 'exact', head: true })
      .in('letter_id', ids)
      .eq('status', 'completed')
      .neq('receiver_profile_id', userId)
      .is('read_at', null);

    if (err3) logDbError('getUnreadLetterCount.responses', err3);
    responsesCount = count ?? 0;
  }

  return (receivedCount ?? 0) + responsesCount;
}
