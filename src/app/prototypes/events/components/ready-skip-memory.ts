/**
 * @file ready-skip-memory.ts
 * @description P1718 R4: "this person passed on Ready for this event", remembered on this device so the room's
 * gate does not send them back to Ready on every re-entry that evening. Nothing is saved to the server: a skip
 * stores no readiness value (no fabricated answers), so the gate cannot learn it from the room row.
 *
 * Keyed per person AND per event (spec review): an event-only key would apply one person's skip to the next
 * person who signs in on the same phone. Same shape as use-group-chat-opened.ts's per-viewer keys. Every access
 * is wrapped: with storage blocked the person simply sees Ready again, never an error.
 */

const readySkippedKey = (profileId: string, eventId: string) => `cp:room-ready-skipped:${profileId}:${eventId}`;

export function rememberReadySkipped(profileId: string | null | undefined, eventId: string | null | undefined): void {
  if (!profileId || !eventId) return;
  try { localStorage.setItem(readySkippedKey(profileId, eventId), '1'); } catch { /* storage blocked: Ready shows again */ }
}

/** A saved answer replaces an earlier skip (review round 2), so the device never says "skipped" about an answered Ready. */
export function forgetReadySkipped(profileId: string | null | undefined, eventId: string | null | undefined): void {
  if (!profileId || !eventId) return;
  try { localStorage.removeItem(readySkippedKey(profileId, eventId)); } catch { /* storage blocked: nothing was stored */ }
}

export function readySkipped(profileId: string | null | undefined, eventId: string | null | undefined): boolean {
  if (!profileId || !eventId) return false;
  try { return localStorage.getItem(readySkippedKey(profileId, eventId)) === '1'; } catch { return false; }
}
