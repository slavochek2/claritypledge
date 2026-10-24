/**
 * @file letter-new-activity.ts
 * @description P1545: what counts as "new" for a sender on one delivery. Unread sender-side activity
 * (the recipient started or finished: an unread inbox item) and unread explain-backs both mark a
 * delivery new. One recipient finishing usually produces both, so they are not added: the larger wins.
 */
export function newCountForDelivery(unreadExplainBacks: number, hasUnreadActivity: boolean): number {
  return Math.max(unreadExplainBacks, hasUnreadActivity ? 1 : 0);
}
