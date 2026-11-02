/**
 * P1592: stores one transcribed line and asks the database where it went.
 *
 * Split out of handler.ts. The insert failing is the only failure that is reported to the caller
 * (the line was NOT stored). Reading the destination afterwards is best-effort: the line is
 * already stored, so a failure there logs and yields `destination: null`, never a failed slice.
 */

/** The stored destination of a line, as transcribe_message_destination returns it. */
export interface SliceDestination {
  kind: 'round' | 'channel' | 'none';
  label: string | null;
}

export interface StoreLineDeps {
  insertMessage: (roomId: string, memberId: string, text: string) => Promise<unknown>;
  getDestination?: (messageId: string) => Promise<SliceDestination | null>;
}

export type StoredLine = { ok: true; destination: SliceDestination | null } | { ok: false };

export async function storeLine(deps: StoreLineDeps, roomId: string, memberId: string, text: string): Promise<StoredLine> {
  let id: unknown;
  try {
    id = await deps.insertMessage(roomId, memberId, text);
  } catch (err) {
    console.error('[transcribe-slice] insert failed:', err);
    return { ok: false };
  }
  if (typeof id !== 'string' || !deps.getDestination) return { ok: true, destination: null };
  try {
    return { ok: true, destination: (await deps.getDestination(id)) ?? null };
  } catch (err) {
    console.error('[transcribe-slice] destination read failed:', err);
    return { ok: true, destination: null };
  }
}
