/**
 * P1401: the tags the home feed offers as filters. Founder, 2026-10-04: show the topics of
 * OUR events plus understanding / misunderstanding — not the five most-used tags, which on
 * production surfaced core-point sets (cmp7/cmp10) and a `deprecated` tag.
 *
 * Each event's own topic (`events.statement_tag`, P1336) is picked up automatically, so a
 * new Clarity Night topic appears without anyone editing a list. FIXED_TOPIC_TAGS covers what
 * the column cannot: the two understanding tags, and aisafety1 — Clarity Night #1 ran before
 * `statement_tag` existed and has none.
 */
import { supabase } from '@/lib/supabase';

export const FIXED_TOPIC_TAGS = ['understanding', 'misunderstanding', 'aisafety1'] as const;

export async function getEventTopicTags(): Promise<string[]> {
  const { data, error } = await supabase
    .from('events')
    .select('statement_tag')
    .not('statement_tag', 'is', null);
  if (error || !data) return [];
  return [...new Set((data as { statement_tag: string | null }[]).map((r) => r.statement_tag).filter((t): t is string => !!t))];
}
