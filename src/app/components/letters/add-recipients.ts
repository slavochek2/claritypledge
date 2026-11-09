/**
 * @file add-recipients.ts
 * @description The add-recipient batch of LetterReceiverModal: one addRecipientToSealed call per row, each row's failure
 * kept apart from the rest. P1650: also collects the recipients whose letter card was not posted to chat (the letter was
 * added and sent regardless), so the confirmation can name them.
 */
import { addRecipientToSealed } from '@/app/data/letters-service';

export interface BuiltRecipient { email: string; name: string; profileId?: string }
export type SendResult = { id: string; email: string; success: true } | { id: string; email: string; success: false; error: string };

export async function sendAddRecipients(
  letterId: string,
  rows: { id: string }[],
  built: (BuiltRecipient | undefined)[],
): Promise<{ sendResults: SendResult[]; notInChat: { name: string }[] }> {
  const notInChat: { name: string }[] = [];
  const sendResults = await Promise.all(
    rows.map(async (row, i): Promise<SendResult> => {
      const b = built[i];
      if (!b) return { id: row.id, email: '', success: false, error: 'Failed to send' };
      try {
        const added = await addRecipientToSealed(letterId, b.profileId ? null : b.email, b.name, b.profileId);
        notInChat.push(...added.skipped);
        return { id: row.id, email: b.email || b.name, success: true };
      } catch (err) {
        return { id: row.id, email: b.email, success: false, error: err instanceof Error ? err.message : 'Failed to send' };
      }
    }),
  );
  return { sendResults, notInChat };
}
