/**
 * Checks on the letter a response is for, and the two response helpers they answer with.
 *
 * P1691: a reader can send at most one rating per story of the letter and one position per
 * story and point sealed into it (the letter's snapshot is the record of both). A larger payload
 * gets the generic 400: after the letter is known to be valid, and before the address's mail
 * allowance is spent, an account is looked up or created, or anything is stored or mailed.
 * Which ids the entries name is decided when the response is confirmed.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { letterResponseBounds, type SnapshotRow } from '../_shared/letter-members.ts';
import { readAllPages } from '../_shared/read-all-pages.ts';

export function jsonResponse(body: Record<string, unknown>, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Generic 400 — never reveal which field failed (shape oracle prevention). */
export function validationError(cors: Record<string, string>): Response {
  return jsonResponse({ error: 'Invalid request. Please check your input and try again.' }, 400, cors);
}

/**
 * The refusal for this request, or null when the letter is a sealed public letter and the
 * response is no larger than it.
 */
export async function refuseUnlessLetterFits(
  supabase: SupabaseClient,
  letterId: string,
  ratingCount: number,
  positionCount: number,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  // ── Validate letter (step 1 continued) ────────────────────────────────────
  // Letter must exist, status='sealed', mode='one-to-many'.
  // Security: without this check an attacker could trigger auth emails against
  // arbitrary emails via one-to-one letters or drafts.
  const { data: letter, error: letterError } = await supabase
    .from('clarity_letters')
    .select('id, status, mode')
    .eq('id', letterId)
    .eq('status', 'sealed')
    .eq('mode', 'one-to-many')
    .maybeSingle();

  if (letterError) {
    console.error('[request-letter-response-signin] Letter lookup error:', letterError.message);
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
  }

  if (!letter) {
    // Letter not found, wrong status, or wrong mode — return generic error
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 400, corsHeaders);
  }

  // ── Size of the response against the letter (P1691) ────────────────────────
  // Read to the end: a truncated set would refuse a full response to a long letter.
  const snapshots = await readAllPages<SnapshotRow>((after, size) => {
    const query = supabase
      .from('letter_story_snapshots')
      .select('story_id, point_config')
      .eq('letter_id', letterId)
      .order('story_id');
    return (after === null ? query : query.gt('story_id', after)).range(0, size - 1);
  }, (row) => row.story_id);

  if (!snapshots) {
    console.error('[request-letter-response-signin] Snapshot lookup error: the snapshots could not all be read');
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders);
  }

  const bounds = letterResponseBounds(snapshots);
  if (ratingCount > bounds.stories || positionCount > bounds.pointEntries) {
    console.warn('[P719-DIAG] validation_fail: LARGER_THAN_LETTER');
    return validationError(corsHeaders);
  }

  return null;
}

/**
 * P1691: what is stored is rebuilt from the two validated fields of each entry, never the
 * caller's own objects, so nothing else a caller attaches to an entry is kept.
 */
export function ratingsToStore(ratings: Array<{ storyId: string; rating: number }>): Array<{ storyId: string; rating: number }> {
  return ratings.map((r) => ({ storyId: r.storyId, rating: r.rating }));
}

export function positionsToStore(positions: Array<{ pointId: string; position: number }>): Array<{ pointId: string; position: number }> {
  return positions.map((p) => ({ pointId: p.pointId, position: p.position }));
}
