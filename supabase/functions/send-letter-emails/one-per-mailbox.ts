/**
 * P1691: which deliveries of a letter to mail now — one mail per address per letter.
 *
 * A letter may hold several deliveries whose addresses differ only in letter case or outer
 * spaces (the address is stored as typed). They reach one mailbox, so it is mailed once: a
 * delivery is held back when another delivery of the same letter to the same address has been
 * notified, or comes earlier in this batch. A held delivery is left un-notified, never stamped:
 * it is looked at again on a later request and is mailed only if the mailbox still has not been.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllPages } from '../_shared/read-all-pages.ts';

export interface DeliveryRow {
  id: string;
  receiver_email: string | null;
  receiver_name: string | null;
  invitation_token: string | null;
  created_at: string | null;
}

function sameMailbox(address: string): string {
  return address.trim().toLowerCase();
}

/**
 * Addresses of this letter that already have a notified delivery, read to the end. One read
 * returns at most a page, and the server may return fewer rows than asked, so the next read
 * starts after the rows actually received and only an empty read ends it. Null when they could
 * not all be read.
 */
async function notifiedMailboxes(supabase: SupabaseClient, letterId: string): Promise<Set<string> | null> {
  const rows = await readAllPages<{ id: string; receiver_email: string | null }>((after, size) => {
    const query = supabase
      .from('letter_deliveries')
      .select('id, receiver_email')
      .eq('letter_id', letterId)
      .not('receiver_email', 'is', null)
      .not('notified_at', 'is', null)
      .order('id');
    return (after === null ? query : query.gt('id', after)).range(0, size - 1);
  }, (row) => row.id);
  if (!rows) {
    console.error('send-letter-emails: could not read all the notified deliveries');
    return null;
  }
  return new Set(rows.flatMap((row) => (row.receiver_email ? [sameMailbox(row.receiver_email)] : [])));
}

/**
 * The un-notified deliveries with an address, read to the end: held-back duplicates stay
 * un-notified, so a one-page read could fill up with them and never reach a new recipient.
 */
function unnotifiedDeliveries(supabase: SupabaseClient, letterId: string): Promise<DeliveryRow[] | null> {
  return readAllPages<DeliveryRow>((after, size) => {
    const query = supabase
      .from('letter_deliveries')
      .select('id, receiver_email, receiver_name, invitation_token, created_at')
      .eq('letter_id', letterId)
      .not('receiver_email', 'is', null)
      .is('notified_at', null)
      .order('id');
    return (after === null ? query : query.gt('id', after)).range(0, size - 1);
  }, (row) => row.id);
}

/** The deliveries to mail now: the earliest un-notified one per mailbox not yet notified. */
function onePerMailbox(unnotified: DeliveryRow[], alreadyNotified: Set<string>): DeliveryRow[] {
  const taken = new Set(alreadyNotified);
  const earliestFirst = [...unnotified].sort((a, b) =>
    (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id)
  );
  return earliestFirst.filter((d) => {
    if (!d.receiver_email) return true; // nothing to compare; the send step skips it as before
    const mailbox = sameMailbox(d.receiver_email);
    if (taken.has(mailbox)) return false;
    taken.add(mailbox);
    return true;
  });
}

/**
 * The deliveries of a letter to mail on this request; empty when there is nothing to send.
 *
 * Reads the deliveries with an address that have NOT been notified yet (P884: that filter is
 * what makes repeat invokes — add-recipient, double-click seal, network retry — email only new
 * deliveries), then keeps one per mailbox. The notified set is read AFTER that list: a claim
 * made by a concurrent request in between then shows up in it and holds the other spelling
 * back, where the opposite order could mail both.
 *
 * Throws when either list cannot be read in full, so that nothing is mailed and nothing is
 * claimed; the caller's own failure handling answers with its generic error.
 */
export async function deliveriesToMail(supabase: SupabaseClient, letterId: string): Promise<DeliveryRow[]> {
  const deliveries = await unnotifiedDeliveries(supabase, letterId);
  if (!deliveries) throw new Error('the un-notified deliveries of this letter could not be read');
  if (deliveries.length === 0) return [];

  const alreadyNotified = await notifiedMailboxes(supabase, letterId);
  if (!alreadyNotified) throw new Error('the notified deliveries of this letter could not be read');

  const toMail = onePerMailbox(deliveries, alreadyNotified);
  if (toMail.length < deliveries.length) {
    console.warn('send-letter-emails: deliveries held back, mailbox already covered:', deliveries.length - toMail.length);
  }
  return toMail;
}
