/**
 * P1631: the card a Publish just posted, handed from the reveal to the one message list that opens on it. The reveal opens the chat on the new card
 * (?m=) while the chat may not hold it yet: it arrives by the reveal's re-read or by Realtime, never by paging back, since it is newer than everything
 * loaded. The list whose target it is claims it (taking it out of here, so no other list can), waits for it, and never reports it as missing.
 * A card no list claims is dropped after PUBLISHED_WAIT_MS; the claiming list stops waiting after the same time.
 */
export const PUBLISHED_WAIT_MS = 30_000;

const noted = new Map<string, number>(); // message id -> when the reveal noted it

function dropExpired(now: number): void {
  for (const [id, at] of noted) if (now - at > PUBLISHED_WAIT_MS) noted.delete(id);
}

export function notePublishedCard(messageId: string): void {
  const now = Date.now();
  dropExpired(now);
  noted.set(messageId, now);
}

/** True once, for the list that opens on a card the reveal noted within the wait; the note is gone afterwards. */
export function claimPublishedCard(messageId: string): boolean {
  dropExpired(Date.now());
  return noted.delete(messageId);
}
