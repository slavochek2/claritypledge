/**
 * @file letters-sender-seen.ts
 * @description P660/P1545: read marks on a delivery: the inbox read mark, the sender's own seen mark, and clearing everything new for the sender.
 * Re-exported from letters-service.ts, which is the path callers import and tests mock.
 */
import { supabase } from '@/lib/supabase';
import { throwDbError } from './db-error-logger';
import { getExplainBacksForDelivery, markExplainBackRead } from './letters-explain-backs';
import { log } from './letters-log';

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
 * P1545: the SENDER has looked at this delivery (sets letter_deliveries.sender_seen_at; sender-only). Separate from
 * the recipient's read mark, so a recipient opening the letter no longer hides their later progress from the sender.
 * Before the 20261026100000 migration is applied the function does not exist; the old shared mark stands in so an
 * unmigrated database behaves as before.
 */
export async function markDeliverySeenBySender(deliveryId: string): Promise<void> {
  log('markDeliverySeenBySender:', deliveryId);

  const { error } = await supabase.rpc('mark_delivery_seen_by_sender', { p_delivery_id: deliveryId });
  if (!error) return;
  if (error.code === 'PGRST202' || error.code === '42883') return markDeliveryRead(deliveryId);
  throwDbError('markDeliverySeenBySender', error, `Failed to mark as seen: ${error.message}`);
}

/**
 * P1545: clear everything "new" the sender has on one delivery: the sender's seen mark and the unread explain-backs.
 * Used when a sent letter's row is opened from the list; the results page does the same with the explain-backs it
 * already holds.
 */
export async function clearSenderNewForDelivery(deliveryId: string): Promise<void> {
  await markDeliverySeenBySender(deliveryId);
  const rows = await getExplainBacksForDelivery(deliveryId);
  await Promise.all(rows.filter((r) => !r.author_read_at).map((r) => markExplainBackRead(r.id)));
}
