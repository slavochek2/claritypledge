/**
 * @file letters-service.ts
 * @description P581: Clarity Letters service — real Supabase implementation.
 * No mock service needed; letters are a new feature with no legacy mock layer (AD1).
 */

import * as Sentry from '@sentry/react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { logDbError, throwDbError } from './db-error-logger';
import { earCountOf, type HasEarsCount } from './ear-count';
import { extractHashtags } from '@/lib/utils';
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
  ExplainBackRow,
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
    throwDbError('createLetter', error, `Failed to create letter: ${error?.message}`);
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
  // P878: a delivery may carry receiver_profile_id INSTEAD of receiver_email
  // (picker-selected recipient) — the RPC resolves the email in-DB (AD-6).
  deliveries: Array<{ receiver_email?: string; receiver_name?: string; receiver_profile_id?: string }> = [],
  // P952: author-chosen response intensity; defaults to 'invite' if not passed
  responsesMode: 'off' | 'invite' | 'push' = 'invite'
): Promise<{ success: boolean; error?: string }> {
  await requireAuth();
  log('sealLetter:', { letterId, predictions, deliveries, responsesMode });

  const { data, error } = await supabase.rpc('seal_and_send_letter', {
    p_letter_id: letterId,
    p_predictions: predictions,
    p_deliveries: deliveries,
    p_responses_mode: responsesMode,
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

  // Resolve sender profile (name + avatar + P725 slug for /p/:slug link)
  const { data: senderProfile } = await supabase
    .from('profiles')
    .select('name, slug, avatar_url, avatar_color, has_pledged')
    .eq('id', letterData.sender_id)
    .single();

  const letterWithSender = {
    ...letterData,
    sender_display_name: senderProfile?.name || 'Someone',
    sender_slug: senderProfile?.slug ?? null,
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
    throwDbError('submitRating', error, `Failed to submit rating: ${error.message}`);
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
    throwDbError('submitPointResponse', error, `Failed to submit point response: ${error.message}`);
  }

  // P778: Advance delivery status from 'opened' to 'in_progress' on first point response.
  // .eq('status','opened') guard makes this idempotent — non-fatal if it fails.
  const { error: statusErr } = await supabase
    .from('letter_deliveries')
    .update({ status: 'in_progress' })
    .eq('id', deliveryId)
    .eq('status', 'opened');
  if (statusErr) log('submitPointResponse: status advance skipped:', statusErr.message);

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

/**
 * P768: Read all prior `letter_point_responses` for a delivery (authed path).
 * Used on mount to rehydrate the reading-flow hook so already-answered points
 * render in `point-revealed` phase instead of `point-engage` (which would 409
 * on re-submit). Fail-open: on error returns `{}` so a transient read blip
 * degrades to pre-fix behavior rather than crashing the page.
 */
export async function getLetterPointResponses(
  deliveryId: string,
): Promise<Record<string, string>> {
  log('getLetterPointResponses:', { deliveryId });
  const { data, error } = await supabase
    .from('letter_point_responses')
    .select('point_id, position')
    .eq('delivery_id', deliveryId);
  if (error) {
    logDbError('getLetterPointResponses', error);
    return {};
  }
  return Object.fromEntries(
    (data ?? []).map((r) => [r.point_id as string, r.position as string]),
  );
}

/**
 * P768: Anon-safe read of prior `letter_point_responses` via invitation token.
 * Wraps the `get_letter_point_responses_by_token` SECURITY DEFINER RPC, which
 * bypasses RLS (the SELECT policy on letter_point_responses requires
 * `auth.uid()` — anon callers can't read otherwise). Mirrors the P642 pattern
 * used for `submit_point_response_by_token`.
 */
export async function getLetterPointResponsesByToken(
  token: string,
): Promise<Record<string, string>> {
  log('getLetterPointResponsesByToken');
  const { data, error } = await supabase.rpc('get_letter_point_responses_by_token', {
    p_token: token,
  });
  if (error) {
    logDbError('getLetterPointResponsesByToken', error);
    return {};
  }
  // Column name is `response_position` because `position` is reserved in
  // a RETURNS TABLE signature — see the migration for details.
  type Row = { point_id: string; response_position: string };
  return Object.fromEntries(
    ((data ?? []) as Row[]).map((r) => [r.point_id, r.response_position]),
  );
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
    throwDbError('submitPointResponseByToken', error, `Failed to submit point response: ${error.message}`);
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
    throwDbError('submitRatingByToken', error, `Failed to submit rating: ${error.message}`);
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
    throwDbError('updateDeliveryStatus', error, `Failed to update delivery status: ${error.message}`);
  }
}

/**
 * Refusals that are part of normal operation and must not raise a Sentry event.
 * Classify before reporting — noise ladder, docs/decisions.md 2026-07-15.
 *
 * - `cannot_claim_own_letter` — the sender opening their own letter.
 * - `no_delivery_for_token` — the token is already spent. `create-and-open-letter`
 *   expires the invitation in the *same* UPDATE that sets receiver_profile_id
 *   (P683 replay defence, create-and-open-letter/index.ts:205-213), and the RPC
 *   filters on `invitation_expires_at > now()`. So on the ordinary first-time
 *   1-to-1 open every subsequent claim lands here. That is the common path, not
 *   a fault.
 *
 * Any other reason — including one this set does not recognise — is reported.
 */
const EXPECTED_CLAIM_REFUSALS = new Set(['cannot_claim_own_letter', 'no_delivery_for_token']);

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
    const reason = (data?.error as string | undefined) ?? 'no_delivery_for_token';
    log('claimLetterDelivery: rejected', reason);

    // An unexpected refusal leaves receiver_profile_id unset, so the reader's
    // later writes fail via RLS with nothing pointing back at this call. Report
    // those so the two are linkable — but only those; see the set above.
    if (!EXPECTED_CLAIM_REFUSALS.has(reason)) {
      Sentry.captureMessage('claimLetterDelivery refused', {
        level: 'warning',
        extra: { reason },
      });
    }
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

  // P1011: throw rather than `return []`. Returning an empty array made a failed
  // fetch indistinguishable from a genuinely empty inbox, so the transient
  // stale-token failure (JAVASCRIPT-REACT-2F) rendered "No letters or responses
  // yet" to a user who had letters. The single caller (inbox-tab) needs the
  // difference to decide between its empty state and its reconnecting state.
  // throwDbError keeps the existing suppression behaviour: it routes through
  // logDbError first, so PGRST303 and network blips still never reach Sentry.
  if (error) {
    throwDbError('getInboxItems', error, `Failed to load inbox: ${error.message}`);
  }

  const rows = (data as Array<Record<string, unknown>>) ?? [];

  return rows.slice(0, 20).map(row => ({
    type: row['type'] as InboxItem['type'],
    delivery_id: row['delivery_id'] as string,
    letter_id: row['letter_id'] as string,
    title: (row['title'] as string) ?? 'Untitled',
    actor_name: (row['actor_name'] as string) ?? 'Someone',
    actor_slug: (row['actor_slug'] as string | null) ?? null,
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
    throwDbError('markDeliveryRead', error, `Failed to mark as read: ${error.message}`);
  }
}

/**
 * P770: Delete a sealed letter with zero deliveries.
 * Server-side guard re-checks delivery count before deleting — client-side
 * gate can be stale if deliveries arrived after the tab loaded.
 * Throws 'DELIVERIES_EXIST' if any delivery records exist.
 */
export async function deleteLetter(letterId: string): Promise<void> {
  await requireAuth();
  log('deleteLetter:', letterId);

  const { data: deliveries, error: checkErr } = await supabase
    .from('letter_deliveries')
    .select('id')
    .eq('letter_id', letterId)
    .limit(1);

  if (checkErr) {
    throwDbError('deleteLetter/check', checkErr, `Failed to check deliveries: ${checkErr.message}`);
  }

  if (deliveries && deliveries.length > 0) {
    throw new Error('DELIVERIES_EXIST');
  }

  const { data: deleted, error } = await supabase
    .from('clarity_letters')
    .delete()
    .eq('id', letterId)
    .select('id');

  if (error) {
    throwDbError('deleteLetter', error, `Failed to delete letter: ${error.message}`);
  }

  if (!deleted || deleted.length === 0) {
    throw new Error('DELETE_FAILED');
  }
}

/**
 * P660: Add a recipient to an existing sealed letter (calls RPC).
 * P664: receiverName parameter added — passes p_receiver_name to RPC (DEFAULT NULL, backward compat).
 */
export async function addRecipientToSealed(
  letterId: string,
  // P878: null when the recipient was picker-selected — pass receiverProfileId instead;
  // the RPC resolves the email in-DB (AD-6).
  email: string | null,
  receiverName?: string,
  receiverProfileId?: string
): Promise<string> {
  await requireAuth();
  log('addRecipientToSealed:', { letterId, email, receiverName, receiverProfileId });

  const { data, error } = await supabase.rpc('add_recipient_to_sealed_letter', {
    p_letter_id: letterId,
    p_email: email,
    p_receiver_name: receiverName ?? null,
    p_receiver_profile_id: receiverProfileId ?? null,
  });

  if (error) {
    // P883: expected duplicate-invite case — friendly error, no Sentry report.
    // Constraint name verified to surface in error.message (not details/hint) via
    // the prod Sentry events this fix silences (JAVASCRIPT-REACT-1X).
    if (
      error.message?.includes('idx_letter_deliveries_unique_email') ||
      error.message?.includes('idx_letter_deliveries_one_per_recipient')
    ) {
      throw new Error('This person has already been invited to this letter.');
    }
    throwDbError('addRecipientToSealed', error, `Failed to add recipient: ${error.message}`);
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
      throwDbError('submitLetterResponseAuthenticated.ratings', ratingsError, `Failed to insert ratings: ${ratingsError.message}`);
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
      throwDbError('submitLetterResponseAuthenticated.positions', positionsError, `Failed to insert positions: ${positionsError.message}`);
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

  // Branch 3 (P904): Count explain-backs on my letters that I (the sender) have not
  // opened. story_explain_backs is keyed by delivery_id, not letter_id (WARN-1), so
  // resolve my sealed letters' delivery IDs first, then count unread explain-backs
  // against them. RLS lets the sender (a participant) read these rows.
  let explainBackCount = 0;
  if (sealedIds.length > 0) {
    const { data: myDeliveries, error: errDel } = await supabase
      .from('letter_deliveries')
      .select('id')
      .in('letter_id', sealedIds)
      .neq('receiver_profile_id', userId); // exclude self-sent deliveries
    if (errDel) logDbError('getUnreadLetterCount.explainBackDeliveries', errDel);
    const deliveryIds = myDeliveries?.map(d => d.id) ?? [];
    if (deliveryIds.length > 0) {
      const { count: ebCount, error: err3 } = await supabase
        .from('story_explain_backs')
        .select('id', { count: 'exact', head: true })
        .in('delivery_id', deliveryIds)
        .is('author_read_at', null);
      if (err3) logDbError('getUnreadLetterCount.explainBacks', err3);
      explainBackCount = ebCount ?? 0;
    }
  }

  return (receivedCount ?? 0) + responsesCount + explainBackCount;
}

// ============================================================================
// P699: Letter Results RPC
// ============================================================================

export interface ResultsProfileData {
  id: string;
  name: string;
  /** P725: public handle for linking to /p/:slug (null when profile has no slug yet) */
  slug?: string | null;
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
  responsesMode: 'off' | 'invite' | 'push';
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
    slug: (rawSenderProfile['slug'] as string | null) ?? null,
    avatarUrl: (rawSenderProfile['avatar_url'] as string | null) ?? undefined,
    avatarColor: (rawSenderProfile['avatar_color'] as string | null) ?? undefined,
    role: (rawSenderProfile['role'] as string | null) ?? undefined,
    hasPledged: (rawSenderProfile['has_pledged'] as boolean) ?? false,
    earsCount: earCountOf(rawSenderProfile as HasEarsCount),
  };

  const receiverProfile: ResultsProfileData | null = rawReceiverProfile ? {
    id: (rawReceiverProfile['id'] as string) ?? '',
    name: (rawReceiverProfile['name'] as string) ?? '',
    slug: (rawReceiverProfile['slug'] as string | null) ?? null,
    avatarUrl: (rawReceiverProfile['avatar_url'] as string | null) ?? undefined,
    avatarColor: (rawReceiverProfile['avatar_color'] as string | null) ?? undefined,
    role: (rawReceiverProfile['role'] as string | null) ?? undefined,
    hasPledged: (rawReceiverProfile['has_pledged'] as boolean) ?? false,
    earsCount: earCountOf(rawReceiverProfile as HasEarsCount),
  } : null;

  const { data: letterMeta, error: letterMetaError } = await supabase
    .from('clarity_letters')
    .select('responses_mode')
    .eq('id', letterId)
    .single();
  if (letterMetaError && letterMetaError.code !== 'PGRST116') {
    logDbError('getLetterResults.letterMeta', letterMetaError);
  }

  return {
    perspective: row['perspective'] as 'sender' | 'receiver',
    senderName: senderProfile.name,
    receiverName: receiverProfile?.name ?? null,
    senderProfile,
    receiverProfile,
    responsesMode: ((letterMeta as { responses_mode?: string } | null)?.responses_mode ?? 'off') as 'off' | 'invite' | 'push',
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

// P745: persist the story index the recipient paused on so the letter can resume
export async function saveLetterPauseState(deliveryId: string, storyIndex: number): Promise<void> {
  if (storyIndex < 0 || storyIndex > 999) {
    throw new RangeError(`storyIndex ${storyIndex} out of bounds (0–999)`);
  }
  const { error } = await supabase
    .from('letter_deliveries')
    .update({ saved_story_index: storyIndex })
    .eq('id', deliveryId);
  if (error) throw new Error(`saveLetterPauseState failed: ${error.message}`);
}

// ============================================================================
// P700: Letter Overview
// ============================================================================

/**
 * P700: Fetch cohort overview for a letter via get_letter_overview SECURITY DEFINER RPC.
 * Author-only — returns null if unauthorized, letter not found, or not sealed.
 */
export async function getLetterOverview(letterId: string): Promise<import('@/app/types').LetterOverviewPayload | null> {
  await requireAuth();
  log('getLetterOverview:', letterId);

  const { data, error } = await supabase.rpc('get_letter_overview', { p_letter_id: letterId });

  if (error) {
    logDbError('getLetterOverview', error);
    return null;
  }

  // RPC returns TABLE — data is an array; null/empty = unauthorized or not found
  const rows = data as Array<Record<string, unknown>> | null;
  if (!rows || rows.length === 0) return null;

  const row = rows[0];

  const letterRaw = row['letter'] as Record<string, unknown> | null;
  const storiesRaw = (row['stories'] as Array<Record<string, unknown>>) ?? [];
  const deliveriesRaw = (row['deliveries'] as Array<Record<string, unknown>>) ?? [];
  const predictionsRaw = (row['predictions'] as Array<Record<string, unknown>>) ?? [];
  const ratingsRaw = (row['ratings'] as Array<Record<string, unknown>>) ?? [];
  const responsesRaw = (row['point_responses'] as Array<Record<string, unknown>>) ?? [];

  if (!letterRaw) return null;

  return {
    letter: (() => {
      const senderRaw = (letterRaw['sender'] as Record<string, unknown> | null) ?? {};
      return {
        id: (letterRaw['id'] as string) ?? '',
        title: (letterRaw['title'] as string) ?? '',
        status: (letterRaw['status'] as string) ?? '',
        sender_id: (letterRaw['sender_id'] as string) ?? '',
        sender: {
          profile_id: (senderRaw['profile_id'] as string | null) ?? null,
          name: (senderRaw['name'] as string) ?? 'Author',
          slug: (senderRaw['slug'] as string | null) ?? null,
          avatar_url: (senderRaw['avatar_url'] as string | null) ?? null,
          has_pledged: (senderRaw['has_pledged'] as boolean) ?? false,
        },
      };
    })(),
    stories: storiesRaw.map(s => ({
      story_id: (s['story_id'] as string) ?? '',
      position: (s['position'] as number) ?? 0,
      title: (s['title'] as string) ?? '',
      content: (s['content'] as string) ?? '',
      hashtags: (s['hashtags'] as string[]) ?? [],
      points: ((s['points'] as Array<Record<string, unknown>>) ?? []).map(p => ({
        id: (p['id'] as string) ?? '',
        text: (p['text'] as string) ?? '',
        hashtag: (p['hashtag'] as string) ?? '',
        sort_order: (p['sort_order'] as number) ?? 0,
      })),
    })),
    deliveries: deliveriesRaw.map(d => ({
      delivery_id: (d['delivery_id'] as string) ?? '',
      display_name: (d['display_name'] as string) ?? 'Anonymous',
      full_display_name: (d['full_display_name'] as string) ?? (d['display_name'] as string) ?? 'Anonymous',
      profile_slug: (d['profile_slug'] as string | null) ?? null,
      profile_id: (d['profile_id'] as string | null) ?? null,
      avatar_url: (d['avatar_url'] as string | null) ?? null,
      has_pledged: (d['has_pledged'] as boolean) ?? false,
      has_responded: (d['has_responded'] as boolean) ?? false,
      completed_at: (d['completed_at'] as string | null) ?? null,
    })),
    predictions: predictionsRaw.map(p => ({
      delivery_id: (p['delivery_id'] as string | null) ?? null,
      story_id: (p['story_id'] as string) ?? '',
      prediction: (p['prediction'] as number) ?? 0,
    })),
    ratings: ratingsRaw.map(r => ({
      delivery_id: (r['delivery_id'] as string) ?? '',
      story_id: (r['story_id'] as string) ?? '',
      listener_rating: (r['listener_rating'] as number) ?? 0,
    })),
    pointResponses: responsesRaw.map(r => ({
      delivery_id: (r['delivery_id'] as string) ?? '',
      point_id: (r['point_id'] as string) ?? '',
      position: (r['position'] as import('@/app/types').PositionType),
    })),
  };
}

// P772: resolve a shortcode like "st5" to the latest sealed delivery UUID for a sender slug
export async function resolveLetterShortcode(
  code: string,
  senderSlug: string
): Promise<string | null> {
  const { data } = await supabase.rpc('resolve_letter_shortcode', {
    p_code: code,
    p_sender_slug: senderSlug,
  });
  return data ?? null;
}

export interface LetterPreloadDescriptor {
  letterId: string;
  deliveryId: string;
  senderId: string;
  receiverId: string;
}

// P827: discover whether the two /live participants share a completed letter that
// covers the picked story. Used by handleSelectStory to drive preload (positions +
// ratings + ratingPhase='explain-back') in the picker-sourced path.
//
// Filters: clarity_letters.status='sealed' AND letter_deliveries.status='completed'
// AND (sender=A,receiver=B) OR (sender=B,receiver=A). Most-recent completed_at wins.
// RLS guarantees the caller is sender or receiver — no SECURITY DEFINER needed.
//
// Returns null on no match. Over-fetch guard: select only the four routing IDs.
export async function findLetterPreloadForStory(args: {
  storyId: string;
  participantAId: string;
  participantBId: string;
}): Promise<LetterPreloadDescriptor | null> {
  const { storyId, participantAId, participantBId } = args;
  if (!storyId || !participantAId || !participantBId) return null;
  if (participantAId === participantBId) return null;

  // Two narrow queries (one per direction) instead of one .or() across base+joined
  // tables. PostgREST .or() with foreignTable only filters the foreign table;
  // mixing base (receiver_profile_id) and joined (sender_id) conditions in a
  // single OR isn't expressible.
  //
  // letter_story_snapshots is FK'd to clarity_letters, NOT to letter_deliveries.
  // PostgREST won't auto-traverse the two-hop chain (deliveries → letters →
  // snapshots) — embed snapshots inside the clarity_letters join so the FK is
  // direct. !inner on the nested snapshot enforces story-match at SQL level.
  const buildQuery = (senderId: string, receiverId: string) =>
    supabase
      .from('letter_deliveries')
      .select(
        'id, receiver_profile_id, completed_at, clarity_letters!inner(id, sender_id, status, letter_story_snapshots!inner(story_id))'
      )
      .eq('status', 'completed')
      .eq('receiver_profile_id', receiverId)
      .eq('clarity_letters.status', 'sealed')
      .eq('clarity_letters.sender_id', senderId)
      .eq('clarity_letters.letter_story_snapshots.story_id', storyId)
      .order('completed_at', { ascending: false })
      .limit(1);

  const [aToB, bToA] = await Promise.all([
    buildQuery(participantAId, participantBId),
    buildQuery(participantBId, participantAId),
  ]);

  if (aToB.error) {
    logDbError('findLetterPreloadForStory(A→B)', aToB.error, { storyId });
    return null;
  }
  if (bToA.error) {
    logDbError('findLetterPreloadForStory(B→A)', bToA.error, { storyId });
    return null;
  }

  type Row = {
    id: string;
    receiver_profile_id: string;
    completed_at: string | null;
    clarity_letters: { id: string; sender_id: string } | { id: string; sender_id: string }[];
  };

  const pickLetter = (cl: Row['clarity_letters']) => (Array.isArray(cl) ? cl[0] : cl);

  const candidates: Row[] = [
    ...((aToB.data ?? []) as Row[]),
    ...((bToA.data ?? []) as Row[]),
  ].filter(r => !!pickLetter(r.clarity_letters));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  const best = candidates[0];
  const letter = pickLetter(best.clarity_letters);
  if (!letter) return null;

  return {
    letterId: letter.id,
    deliveryId: best.id,
    senderId: letter.sender_id,
    receiverId: best.receiver_profile_id,
  };
}

// ============================================================================
// P904: Async letter verification — explain-backs
// ============================================================================

const EXPLAIN_BACK_SELECT =
  'id, letter_id, story_id, delivery_id, recorder_id, medium, audio_storage_path, text_fallback, author_read_at, created_at';

/**
 * P904: Record an explain-back for one (story × delivery).
 *
 * Audio: requests a size-bounded, receiver-only signed PUT URL from the new
 * `explain-back-signed-url` edge function (in-process V4 signer — it CAN sign
 * x-goog-content-length-range, unlike the ml-training signer, P812), PUTs the blob to
 * the private GCS bucket, then inserts the row. Text: inserts directly, no GCS.
 * `letter_id` is required to satisfy the composite FK to letter_story_snapshots.
 */
export async function uploadExplainBack(params: {
  deliveryId: string;
  storyId: string;
  letterId: string;
  medium: 'audio' | 'text';
  blob?: Blob;
  text?: string;
}): Promise<ExplainBackRow | null> {
  const { deliveryId, storyId, letterId, medium } = params;
  const recorderId = await requireAuth();
  log('uploadExplainBack:', { deliveryId, storyId, medium });

  let audioStoragePath: string | null = null;
  let textFallback: string | null = null;

  if (medium === 'audio') {
    if (!params.blob) throw new Error('uploadExplainBack: audio medium requires a blob');
    const contentType = params.blob.type || 'audio/webm';

    // 1. Receiver-only signed upload URL (membership checked server-side).
    const { data: signed, error: signError } = await supabase.functions.invoke('explain-back-signed-url', {
      body: { mode: 'upload', deliveryId, storyId, contentType },
    });
    if (signError || !signed?.signedUrl) {
      throwDbError('uploadExplainBack.sign', signError ?? new Error('no signed URL'), 'Could not start the upload. Please try again.');
    }

    // 2. PUT the blob. The signed URL commits to Content-Type AND the size range —
    //    both headers must be sent verbatim or GCS rejects with MalformedSecurityHeader.
    const putResponse = await fetch(signed.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'x-goog-content-length-range': signed.contentLengthRange ?? '1,5242880',
      },
      body: params.blob,
    });
    if (!putResponse.ok) {
      const detail = await putResponse.text().catch(() => '');
      throwDbError('uploadExplainBack.put', new Error(`${putResponse.status} ${detail.slice(0, 300)}`), 'Upload failed. Please try again.');
    }
    audioStoragePath = signed.storagePath as string;
  } else {
    if (!params.text?.trim()) throw new Error('uploadExplainBack: text medium requires non-empty text');
    textFallback = params.text.trim();
  }

  const { data, error } = await supabase
    .from('story_explain_backs')
    .insert({
      letter_id: letterId,
      story_id: storyId,
      delivery_id: deliveryId,
      recorder_id: recorderId,
      medium,
      audio_storage_path: audioStoragePath,
      text_fallback: textFallback,
    })
    .select(EXPLAIN_BACK_SELECT)
    .single();

  if (error) {
    // [P904 v0 ACCEPTED] If the GCS PUT (step 2) succeeded but this INSERT fails,
    // the audio object is orphaned (no row points at it). This is bounded and
    // self-healing: the object key is deterministic ({deliveryId}/{storyId}.webm),
    // so a re-record overwrites it, and the thrown error surfaces in the capture
    // UI to prompt that retry. The orphan only persists if the receiver abandons
    // this one story. We do NOT reorder to INSERT-before-upload: that trades the
    // invisible orphan for a user-visible broken row (medium='audio', path=null
    // → broken player on the view page). Revisit if corpus hygiene needs a sweep.
    throwDbError('uploadExplainBack.insert', error, 'Could not save your explanation. Please try again.');
  }
  return data as ExplainBackRow;
}

/** P904: Fetch all explain-backs for a delivery (pair-private RLS gates access). */
export async function getExplainBacksForDelivery(deliveryId: string): Promise<ExplainBackRow[]> {
  const { data, error } = await supabase
    .from('story_explain_backs')
    .select(EXPLAIN_BACK_SELECT)
    .eq('delivery_id', deliveryId);
  if (error) {
    logDbError('getExplainBacksForDelivery', error);
    return [];
  }
  return (data ?? []) as ExplainBackRow[];
}

/**
 * P904: Story title for the explain-back view's context line. Reads the immutable
 * snapshot's point_config (participant-readable via letter_story_snapshots RLS).
 */
export async function getSnapshotStoryTitle(letterId: string, storyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('letter_story_snapshots')
    .select('point_config')
    .eq('letter_id', letterId)
    .eq('story_id', storyId)
    .maybeSingle();
  if (error || !data) return null;
  const cfg = data.point_config as { storyTitle?: string } | null;
  return cfg?.storyTitle ?? null;
}

/** P904: Fetch a single explain-back by id (used by the view focus page). */
export async function getExplainBackById(explainBackId: string): Promise<ExplainBackRow | null> {
  const { data, error } = await supabase
    .from('story_explain_backs')
    .select(EXPLAIN_BACK_SELECT)
    .eq('id', explainBackId)
    .maybeSingle();
  if (error) {
    logDbError('getExplainBackById', error);
    return null;
  }
  return (data as ExplainBackRow) ?? null;
}

/**
 * P904: Mark an explain-back read. Sender-only — routed through the
 * mark_explain_back_read SECURITY DEFINER RPC, never a raw client UPDATE
 * (the receiver holds UPDATE on content columns but NOT on author_read_at).
 */
export async function markExplainBackRead(explainBackId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_explain_back_read', { p_id: explainBackId });
  if (error) logDbError('markExplainBackRead', error);
}

/**
 * P904: Get a short-TTL signed playback URL for an audio explain-back.
 * The edge function enforces the pair-membership check before signing.
 */
export async function getExplainBackSignedUrl(explainBackId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('explain-back-signed-url', {
    body: { mode: 'playback', explainBackId },
  });
  if (error || !data?.signedUrl) {
    logDbError('getExplainBackSignedUrl', error ?? new Error('no signed URL'));
    return null;
  }
  return data.signedUrl as string;
}

/**
 * P904: Count unread explain-backs per delivery for the inbox "N new from <name>" signal.
 * Client-side group (WARN-2) — RLS returns only rows the viewer (a participant) may read.
 */
export async function getUnreadExplainBackCountsByDelivery(
  deliveryIds: string[]
): Promise<Record<string, number>> {
  if (deliveryIds.length === 0) return {};
  const { data, error } = await supabase
    .from('story_explain_backs')
    .select('delivery_id')
    .in('delivery_id', deliveryIds)
    .is('author_read_at', null);
  if (error) {
    logDbError('getUnreadExplainBackCountsByDelivery', error);
    return {};
  }
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const id = (row as { delivery_id: string }).delivery_id;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** R3b: Viewer's existing stories keyed by point_id — for the "1 story by Name →" filled state.
 * story_points has no author_id — resolve via stories.user_id then join to story_points. */
export async function getViewerStoriesForPoints(pointIds: string[], userId: string): Promise<Map<string, string>> {
  if (pointIds.length === 0) return new Map();
  // Step 1: get the viewer's story IDs (stories they authored)
  const { data: storyRows, error: storyErr } = await supabase
    .from('stories')
    .select('id')
    .eq('user_id', userId);
  if (storyErr) {
    logDbError('getViewerStoriesForPoints:stories', storyErr);
    return new Map();
  }
  const storyIds = (storyRows ?? []).map((r) => (r as { id: string }).id);
  if (storyIds.length === 0) return new Map();
  // Step 2: find which of those stories are attached to the requested points
  const { data, error } = await supabase
    .from('story_points')
    .select('point_id, story_id')
    .in('story_id', storyIds)
    .in('point_id', pointIds);
  if (error) {
    logDbError('getViewerStoriesForPoints:story_points', error);
    return new Map();
  }
  const result = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { point_id: string; story_id: string };
    result.set(r.point_id, r.story_id);
  }
  return result;
}

/** P904: Batch-resolve profile display names by id (for explain-back recorder labels). */
export async function getProfileNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name')
    .in('id', ids);
  if (error) {
    logDbError('getProfileNames', error);
    return {};
  }
  const names: Record<string, string> = {};
  for (const row of data ?? []) {
    const r = row as { id: string; name: string | null };
    names[r.id] = r.name ?? 'Someone';
  }
  return names;
}

// ============================================================================
// P904 plan addendum: pair-visible position stories
// ============================================================================

export interface LetterPositionStory {
  storyId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  authorAvatarColor: string | null;
  authorHasPledged: boolean;
  content: string;
  tags: string[];
  isOwn: boolean;
}

/**
 * Returns the RECEIVER's position-stories filed on points of the delivery's
 * letter, keyed by point_id. Calls the get_letter_position_stories SECURITY
 * DEFINER RPC (returns empty for non-participants). isOwn = true when authorId
 * matches currentUserId.
 *
 * R6: the point-level slot is receiver-only. The RPC returns rows for BOTH
 * participants, but the sender's story belongs in the letter body (reachable
 * via the "Open story" link), NOT in the receiver's position-story slot. We
 * skip sender-authored rows AT ITERATION TIME — before the Map.set — so that
 * when both participants filed a story on the same point, the receiver's row is
 * never dropped by the point-keyed overwrite (the original UAT bug).
 *
 * CONTRACT (review #4): `senderId` MUST be the letter's authoritative sender —
 * i.e. `resultsData.senderProfile.id` from the get_letter_results RPC. The
 * sender-skip below trusts it blindly; passing the wrong id (e.g. a sender/
 * receiver swap at the call site) would silently drop the receiver's rows or
 * surface the sender's story in the receiver-only slot, with no error. The dev
 * guard below catches the most common swap: receiver calling with their own id.
 */
export async function getLetterPositionStories(
  deliveryId: string,
  currentUserId: string,
  senderId: string
): Promise<Map<string, LetterPositionStory>> {
  if (import.meta.env.DEV && senderId === currentUserId) {
    // The receiver is the typical caller of the receiver-only slot; if senderId
    // equals the current user, a sender/receiver swap is the likely cause.
    console.warn(
      '[getLetterPositionStories] senderId === currentUserId — likely a sender/receiver ' +
      'swap at the call site. senderId must be resultsData.senderProfile.id.'
    );
  }
  const { data, error } = await supabase.rpc('get_letter_position_stories', {
    p_delivery_id: deliveryId,
  });
  if (error) {
    logDbError('getLetterPositionStories', error);
    return new Map();
  }
  const result = new Map<string, LetterPositionStory>();
  for (const row of (data ?? []) as Array<{
    point_id: string;
    story_id: string;
    author_id: string;
    author_name: string;
    author_avatar_url: string | null;
    author_avatar_color: string | null;
    author_has_pledged: boolean;
    content: string;
    tags: string[] | null;
  }>) {
    // R6: receiver-only slot — never let the sender's story occupy it.
    if (row.author_id === senderId) continue;
    result.set(row.point_id, {
      storyId: row.story_id,
      authorId: row.author_id,
      authorName: row.author_name,
      authorAvatarUrl: row.author_avatar_url,
      authorAvatarColor: row.author_avatar_color,
      authorHasPledged: row.author_has_pledged,
      content: row.content,
      tags: row.tags ?? [],
      isOwn: row.author_id === currentUserId,
    });
  }
  return result;
}

/**
 * Creates a private Story linked to pointId. Uses the authenticated user's
 * identity (createStory ignores _authorId and uses auth.uid()). Returns the
 * new storyId, or null on failure.
 */
export async function createLetterPositionStory(
  pointId: string,
  content: string
): Promise<{ storyId: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  const user = session.user;

  const { data: storyData, error: storyError } = await supabase
    .from('stories')
    .insert({
      author_id: user.id,
      content,
      tags: extractHashtags(content),
      system_tags: [],
      visibility: 'private',
    })
    .select('id')
    .single();

  if (storyError || !storyData) {
    logDbError('createLetterPositionStory:story', storyError);
    return null;
  }

  const { error: linkError } = await supabase
    .from('story_points')
    .insert({ story_id: storyData.id, point_id: pointId, author_id: user.id });

  if (linkError && linkError.code !== '23505') {
    // 23505 = already linked (idempotent); other errors are real
    logDbError('createLetterPositionStory:link', linkError);
  }

  return { storyId: (storyData as { id: string }).id };
}

/**
 * Overwrites the content (and tags) of an existing position-story. Only the
 * authenticated owner can update their own story (enforced by RLS on stories).
 * Returns true on success, false on failure.
 */
export async function updateLetterPositionStory(
  storyId: string,
  content: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('stories')
    .update({ content, tags: extractHashtags(content) })
    .eq('id', storyId);
  if (error) {
    logDbError('updateLetterPositionStory', error);
    return false;
  }
  return true;
}
