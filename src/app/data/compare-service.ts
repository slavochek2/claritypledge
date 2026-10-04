/**
 * @file compare-service.ts
 * @description P1337: reads behind the compare view — a tag's statements, two people's
 * positions on them, and the tags the two share. Positions on public points are readable by
 * anyone (RLS "Positions visible by point visibility"), so these are plain selects.
 */

import { supabase } from '@/lib/supabase';
import { throwDbError } from './db-error-logger';
import type { PositionKey } from '@/lib/compare-positions';

const TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,49}$/;
const VERSION_TAG = /^v\d+$/;
/** `.in()` goes in the URL, so id lists are chunked. */
const IN_CHUNK = 200;
/** PostgREST's default page size; a user can hold more positions than this. */
const PAGE = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Public points carrying `tag` (user or system tag), oldest first. Invalid tag → []. */
export async function getTagStatements(tag: string): Promise<{ id: string; statement: string }[]> {
  if (!TAG_PATTERN.test(tag)) return [];

  const { data, error } = await supabase
    .from('points')
    .select('id, statement')
    .eq('visibility', 'public')
    .or(`tags.cs.{${tag}},system_tags.cs.{${tag}}`)
    .order('created_at', { ascending: true });

  if (error) throwDbError('getTagStatements', error, 'Could not load statements');
  return (data ?? []).map(row => ({ id: row.id, statement: row.statement }));
}

/** userId → (pointId → position). Empty inputs return an empty map without a query. */
export async function getPositionsFor(
  userIds: string[],
  pointIds: string[],
): Promise<Map<string, Map<string, PositionKey>>> {
  const result = new Map<string, Map<string, PositionKey>>();
  if (userIds.length === 0 || pointIds.length === 0) return result;

  const pages = await Promise.all(
    chunk(pointIds, IN_CHUNK).map(ids =>
      supabase
        .from('point_positions')
        .select('user_id, point_id, position')
        .in('user_id', userIds)
        .in('point_id', ids),
    ),
  );

  for (const { data, error } of pages) {
    if (error) throwDbError('getPositionsFor', error, 'Could not load positions');
    for (const row of data ?? []) {
      let perUser = result.get(row.user_id);
      if (!perUser) {
        perUser = new Map();
        result.set(row.user_id, perUser);
      }
      perUser.set(row.point_id, row.position as PositionKey);
    }
  }
  return result;
}

/** Every point id the user holds a position on, paged past the 1000-row default. */
async function getPositionedPointIds(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('point_positions')
      .select('point_id')
      .eq('user_id', userId)
      .order('point_id')
      .range(from, from + PAGE - 1);
    if (error) throwDbError('getSharedTags positions', error, 'Could not load shared tags');
    for (const row of data ?? []) ids.add(row.point_id);
    if (!data || data.length < PAGE) return ids;
  }
}

/** Tags on these public points, with how many carry each. Version tags (v1, v2…) are not a set
 * anyone compares on. Most first, then A-Z. */
async function tagCounts(pointIds: string[], context: string): Promise<{ tag: string; count: number }[]> {
  if (pointIds.length === 0) return [];
  const pages = await Promise.all(
    chunk(pointIds, IN_CHUNK).map(ids =>
      supabase.from('points').select('tags, system_tags').in('id', ids).eq('visibility', 'public'),
    ),
  );

  const counts = new Map<string, number>();
  for (const { data, error } of pages) {
    if (error) throwDbError(context, error, 'Could not load tags');
    for (const row of data ?? []) {
      // A tag held in both columns still counts once for this point.
      const tags = new Set([...(row.tags ?? []), ...(row.system_tags ?? [])]);
      for (const tag of tags) {
        if (VERSION_TAG.test(tag)) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((x, y) => y.count - x.count || x.tag.localeCompare(y.tag));
}

/** Tags on the public points both people hold a position on, most shared first. */
export async function getSharedTags(a: string, b: string): Promise<{ tag: string; count: number }[]> {
  const [aIds, bIds] = await Promise.all([getPositionedPointIds(a), getPositionedPointIds(b)]);
  return tagCounts([...aIds].filter(id => bIds.has(id)), 'getSharedTags points');
}

/** Tags on the public points one person holds a position on — the compare view's fallback when
 * two people share nothing yet, so it can still show where the other person stands. */
export async function getAnsweredTags(userId: string): Promise<{ tag: string; count: number }[]> {
  return tagCounts([...(await getPositionedPointIds(userId))], 'getAnsweredTags points');
}
