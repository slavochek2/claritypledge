/**
 * @file letters-received.ts
 * @description P1545: letters delivered TO the person: the paged full list for Shared with you, its unread count, and the inbox row mapper getInboxItems shares.
 * Re-exported from letters-service.ts, which is the path callers import and tests mock.
 */
import type { InboxItem } from '@/app/types';
import { supabase } from '@/lib/supabase';
import { logDbError, throwDbError } from './db-error-logger';
import { requireAuth } from './letters-require-auth';
import { log } from './letters-log';

export function mapInboxRow(row: Record<string, unknown>): InboxItem {
  return {
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
  };
}

/** P1545: rows per get_received_letters_page call (the RPC clamps at 200). */
export const RECEIVED_LETTERS_PAGE_SIZE = 100;

/**
 * P1545: the walk stops after this many pages, so a pathological inbox cannot loop forever. 50 x 100 =
 * 5,000 letters delivered to one person, newest first; anything older is not listed.
 */
export const RECEIVED_LETTERS_MAX_PAGES = 50;

/**
 * P1545 (Codex finding): EVERY letter delivered to the person, newest first, for Shared with you.
 * get_inbox_items cannot serve this: it trims a MIXED list (letters to me + activity on my letters) to 20
 * rows server side, so received letters fell off behind sender activity. This pages
 * get_received_letters_page by (timestamp, delivery id) until a short page, up to RECEIVED_LETTERS_MAX_PAGES.
 * Throws on a failed page, like getInboxItems: a failed read is not an empty inbox.
 */
export async function getAllReceivedLetters(userId: string): Promise<InboxItem[]> {
  await requireAuth();
  log('getAllReceivedLetters:', userId);

  const items: InboxItem[] = [];
  let beforeTs: string | null = null;
  let beforeId: string | null = null;
  for (let page = 0; page < RECEIVED_LETTERS_MAX_PAGES; page++) {
    const { data, error } = await supabase.rpc('get_received_letters_page', {
      p_limit: RECEIVED_LETTERS_PAGE_SIZE,
      p_before_ts: beforeTs,
      p_before_id: beforeId,
    });
    if (error) {
      throwDbError('getAllReceivedLetters', error, `Failed to load received letters: ${error.message}`);
    }
    const rows = (data as Array<Record<string, unknown>>) ?? [];
    for (const row of rows) items.push(mapInboxRow(row));
    const last = rows[rows.length - 1];
    if (!last || rows.length < RECEIVED_LETTERS_PAGE_SIZE) break;
    beforeTs = last['timestamp'] as string;
    beforeId = last['delivery_id'] as string;
  }
  return items;
}

/**
 * P1545: unread letters SENT TO the person (the letter half of Artifacts > Shared with you).
 * Same rule as getUnreadLetterCount's first branch (self-sent deliveries excluded), without the
 * sender-side activity branches: activity on your own letters belongs to Yours and no longer counts.
 * Failures read as 0: this only feeds a badge.
 */
export async function getUnreadReceivedLetterCount(userId: string): Promise<number> {
  log('getUnreadReceivedLetterCount:', userId);
  const { data: ownLetters, error: errOwn } = await supabase
    .from('clarity_letters')
    .select('id')
    .eq('sender_id', userId);
  if (errOwn) {
    logDbError('getUnreadReceivedLetterCount.ownLetters', errOwn);
    return 0;
  }
  const ownLetterIds = ownLetters?.map(l => l.id) ?? [];
  let query = supabase
    .from('letter_deliveries')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_profile_id', userId)
    .is('read_at', null);
  if (ownLetterIds.length > 0) {
    query = query.not('letter_id', 'in', `(${ownLetterIds.join(',')})`);
  }
  const { count, error } = await query;
  if (error) {
    logDbError('getUnreadReceivedLetterCount.received', error);
    return 0;
  }
  return count ?? 0;
}
