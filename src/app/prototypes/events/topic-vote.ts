/**
 * P1414: which event pages carry the topic vote.
 *
 * A Clarity Night is published before its topic exists; the room's votes pick it (P1347).
 * Selected by the stored series key, never the title (P1403's rule) — a missing
 * statement_tag alone is not enough, because hikes and guest events have none either.
 */
import type { Event } from '@/app/types';

export const TOPIC_VOTE_SERIES = 'clarity-night';

export function showsTopicVote(
  event: Pick<Event, 'seriesSlug' | 'statementTag' | 'status'> | null | undefined,
  ended: boolean,
): boolean {
  if (!event || ended || event.status === 'cancelled') return false;
  return event.seriesSlug === TOPIC_VOTE_SERIES && !event.statementTag?.trim();
}
