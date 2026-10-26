/**
 * @file letter-new-activity.ts
 * @description P1545: what counts as "new" for a sender on one delivery. Unread sender-side activity
 * (the recipient started or finished: an unread inbox item) and unread explain-backs both mark a
 * delivery new. One recipient finishing usually produces both, so they are not added: the larger wins.
 */
export function newCountForDelivery(unreadExplainBacks: number, hasUnreadActivity: boolean): number {
  return Math.max(unreadExplainBacks, hasUnreadActivity ? 1 : 0);
}

/**
 * P1545: has the recipient made progress the SENDER has not seen? Progress means started or finished; it is new when
 * the sender never looked (`sender_seen_at` null) or the latest progress is later than the last look. The recipient's own
 * `read_at` plays no part: once a recipient has opened the letter it is set, which used to hide their later progress.
 * Before the sender-seen migration is applied the reader returns no `last_progress_at`; the old rule (`read_at` null)
 * stands in, so an unmigrated database behaves as before.
 */
export function hasNewSenderProgress(d: {
  status: string;
  read_at?: string | null;
  sender_seen_at?: string | null;
  last_progress_at?: string | null;
}): boolean {
  if (d.status !== 'in_progress' && d.status !== 'completed') return false;
  if (d.last_progress_at === undefined) return !d.read_at;
  if (!d.last_progress_at) return false;
  if (!d.sender_seen_at) return true;
  return Date.parse(d.last_progress_at) > Date.parse(d.sender_seen_at);
}
