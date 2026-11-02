/**
 * @file canvas-offer-copy.ts
 * @description P1536 S5 (J7 to J10): the words of an offer row, in one place. The spec quotes "Make it about this", "Start a canvas" (J8's row labels), "Agencies canvas started · Open"
 * (J7) and "Send the material again to start this canvas." (D16); the rest is built as written here.
 * [FOUNDER DECISION F1: the row labels. Defaults, built as written: J8's row is `<Group>  [Make it about this] [Start a canvas]  ×`, one wording for every group, so no article
 * ("a" or "an") is ever chosen for a model-written name.]
 */
import { DRAFT_ERROR_TEXT, SEND_SLOT_ELSEWHERE, SEND_SLOT_UPDATING } from './canvas-thread-copy';

export const OFFER_MAKE_LABEL = 'Make it about this';
export const OFFER_START_LABEL = 'Start a canvas';
export const OFFER_OPEN_LABEL = 'Open';
export const OFFER_UPDATING_LABEL = SEND_SLOT_UPDATING;
export const OFFER_ELSEWHERE_LABEL = SEND_SLOT_ELSEWHERE;
export const OFFER_SWITCHING_LABEL = 'Switching…';
export const OFFER_STARTING_LABEL = 'Starting…';
/** D16: after the kept material expired, each open offer's buttons are replaced by this. */
export const OFFER_EXPIRED_LINE = 'Send the material again to start this canvas.';
export const OFFER_LOAD_FAILED_TEXT = 'The other canvases did not load.';
export const OFFER_RETRY_LABEL = 'Try again';
/** Two tabs, or a read that is behind: this tap named an offer or a revision that is not the draft's any more. */
export const OFFER_STALE_TEXT = 'This draft changed since you last looked. Check it, then try again.';
export const OFFER_UNAVAILABLE_TEXT = 'That canvas can no longer be started from here.';

export const offerStartedLine = (group: string): string => `${group} canvas started`;
export const offerDismissLabel = (group: string): string => `Dismiss ${group}`;

/** The sentence for a refusal of switch, start or dismiss; null when the screen only needs to re-read (the row says what changed). */
export function offerRefusedText(code: string): string | null {
  if (code === 'busy' || code === 'busy_elsewhere') return DRAFT_ERROR_TEXT.BUSY ?? null;
  if (code === 'cap_reached') return DRAFT_ERROR_TEXT.REVISION_CAP ?? null;
  if (code === 'stale_view') return OFFER_STALE_TEXT;
  if (code === 'not_offered') return OFFER_UNAVAILABLE_TEXT;
  return null; // expired: the row now reads "Send the material again…"
}
