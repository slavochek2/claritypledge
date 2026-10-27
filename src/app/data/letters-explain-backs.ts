/**
 * @file letters-explain-backs.ts
 * @description P904: async letter verification — explain-backs (record, read, mark read, play back, count unread).
 * Re-exported from letters-service.ts, which is the path callers import and tests mock.
 */
import type { ExplainBackRow } from '@/app/types';
import { supabase } from '@/lib/supabase';
import { logDbError, throwDbError } from './db-error-logger';
import { requireAuth } from './letters-require-auth';
import { log } from './letters-log';


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
