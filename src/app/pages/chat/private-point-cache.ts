/**
 * P1631: the private points this browser has drawn as chat cards. A private point is never forwarded (the server refuses it for everyone), so the message menu leaves Forward
 * out for a card known to be one. The card notes the point when it loads; the menu is built on open, after the card. The server refusal stays the real gate.
 */
const known = new Set<string>();

export function notePrivatePoint(pointId: string): void {
  known.add(pointId);
}

export function isKnownPrivatePoint(pointId: string | null | undefined): boolean {
  return !!pointId && known.has(pointId);
}
