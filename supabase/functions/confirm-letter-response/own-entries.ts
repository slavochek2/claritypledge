/**
 * P1691: the part of a stored letter response that belongs to the letter.
 *
 * The stored response is the reader's own input. Only what belongs to the letter is written: a
 * rating must name a story of this letter and a position a point sealed into it (the letter's
 * snapshot is the record of both); anything else is left out, and an id named more than once
 * counts once, first entry wins — each store holds one row per story or point. Lookup,
 * de-duplication and the returned ids all use the one spelling letter-members.ts returns.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { keepMembersOnce, letterMembers, type SnapshotRow } from '../_shared/letter-members.ts';
import { readAllPages } from '../_shared/read-all-pages.ts';

export interface OwnRating {
  storyId: string;
  rating: number;
  /** The version of the story sealed into the letter. */
  versionId: string | null;
}

export interface OwnPosition {
  pointId: string;
  position: number;
}

export interface OwnEntries {
  ratings: OwnRating[];
  positions: OwnPosition[];
}

/**
 * Reads the letter's snapshots and returns the stored ratings and positions that belong to it.
 * Null when the snapshots could not be read (the error is logged here).
 */
export async function lettersOwnEntries(
  serviceClient: SupabaseClient,
  letterId: string,
  stored: { ratings_json: unknown; positions_json: unknown },
): Promise<OwnEntries | null> {
  // Fetch story snapshots: they resolve version_id per story, and they are the record of what
  // belongs to this letter (its stories, and the points sealed into each). Read to the end: a
  // truncated set would drop the answers to the stories past the first page.
  const snapshots = await readAllPages<SnapshotRow>((after, size) => {
    const query = serviceClient
      .from('letter_story_snapshots')
      .select('story_id, version_id, point_config')
      .eq('letter_id', letterId)
      .order('story_id');
    return (after === null ? query : query.gt('story_id', after)).range(0, size - 1);
  }, (row) => row.story_id);

  if (!snapshots) {
    console.error('[confirm-letter-response] Snapshot lookup error: the snapshots could not all be read');
    return null;
  }

  const members = letterMembers(snapshots);
  const keptRatings = keepMembersOnce<{ storyId: string; rating: number }>(stored.ratings_json, (r) => r.storyId, members.stories);
  const keptPositions = keepMembersOnce<{ pointId: string; position: number }>(stored.positions_json, (p) => p.pointId, members.points);
  if (keptRatings.dropped > 0 || keptPositions.dropped > 0) {
    console.warn('[confirm-letter-response] entries left out (not part of the letter, or repeated):', {
      ratings: keptRatings.dropped,
      positions: keptPositions.dropped,
    });
  }

  return {
    ratings: keptRatings.kept.map(({ id, entry }) => ({ storyId: id, rating: entry.rating, versionId: members.stories.get(id) ?? null })),
    positions: keptPositions.kept.map(({ id, entry }) => ({ pointId: id, position: entry.position })),
  };
}
