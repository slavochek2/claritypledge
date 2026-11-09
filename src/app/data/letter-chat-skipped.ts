/**
 * @file letter-chat-skipped.ts
 * @description P1650: what the seal and add-recipient functions report about chat. A delivery the sender creates
 * posts a letter card in the recipient's 1:1; when that post is skipped (block, daily limit, a failure in chat)
 * the letter is still sealed and sent, and the recipient appears in `skipped` so the sender can be told.
 */

/** A recipient whose letter card was not posted to chat. `name` is the label the sender typed, else the profile name. */
export interface LetterSkipped {
  delivery_id: string;
  /** shown as-is: a typed name, a typed email or a profile name */
  name: string;
}

/** The result of sealLetter: the RPC's own keys ride along, `skipped` is P1650's. */
export interface SealResult {
  success: boolean;
  error?: string;
  skipped?: LetterSkipped[];
}

/** The result of adding a recipient to a sealed letter. */
export interface AddedRecipient {
  deliveryId: string;
  skipped: LetterSkipped[];
}

/** Reads add_recipient_to_sealed_letter's jsonb `{ delivery_id, skipped }`. */
export function readAddedRecipient(data: unknown): AddedRecipient {
  const raw = (data ?? {}) as { delivery_id?: string; skipped?: LetterSkipped[] };
  return { deliveryId: String(raw.delivery_id ?? ''), skipped: Array.isArray(raw.skipped) ? raw.skipped : [] };
}

/**
 * [FOUNDER DECISION: wording around the skipped names] "Not sent to chat: Ana, Ben." Empty when nothing was skipped.
 * Appended to a send confirmation.
 */
export function notSentToChatText(skipped: readonly { name: string }[] | undefined): string {
  if (!skipped || skipped.length === 0) return '';
  return `Not sent to chat: ${skipped.map(s => s.name).join(', ')}.`;
}

/** A confirmation message with the not-sent line after it, when there is one. */
export function withNotInChat(message: string, skipped: readonly { name: string }[] | undefined): string {
  const note = notSentToChatText(skipped);
  if (!note) return message;
  return `${message}${/[.!?]$/.test(message) ? '' : '.'} ${note}`;
}
