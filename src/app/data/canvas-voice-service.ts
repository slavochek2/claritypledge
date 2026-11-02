/**
 * P1536 section 3c, X9: the client half of a voice note in a canvas thread.
 *
 * The clip goes up and is committed exactly as any voice note is (chat-voice-service: a signed PUT, then a commit that reads the stored
 * header), but the commit carries the canvas fields and the server answers with the canvas send's result: the draft (made by a first
 * note), its thread, the message and the queued run, or the database's refusal, with nothing written. The run begins on the SERVER when
 * the transcript lands, tab open or not, so nothing here starts it.
 *
 * A refusal keeps the stored clip's receipt: the owner's retry commits the SAME object (its upload id is the client id), so a lost
 * response or a retry after a stale view can never become a second note.
 */
import { canvasSentOf, refusalOf, type CanvasRefused, type CanvasSent } from './canvas-draft-calls';
import { commitVoiceClip, storeVoiceClip, type VoiceUploadReceipt } from './chat-voice-service';

export interface CanvasVoiceTarget {
  /** The canvas, or null for a new one. */
  canvasId?: string | null;
  /** A published version to open the draft from when none is open (a pending Clone). */
  fromVersionId?: string | null;
  /** The open draft the screen shows and the revision of it the owner last saw. */
  expectedDraftId?: string | null;
  expectedRevision?: number | null;
  /** Discard the open draft first, in the same transaction ("Start over from vN"). */
  replace?: boolean;
  /** The boxes the note is tagged with (Add to chat). */
  boxRefs?: string[] | null;
}

export type CanvasVoiceResult = { ok: true; sent: CanvasSent } | (CanvasRefused & { receipt: VoiceUploadReceipt });

/**
 * Sends a recorded WAV into a canvas thread. `conversationId` is the owner's mirror conversation (the draft's thread lives in it).
 * Throws a VoiceNoteError for an upload or commit failure (it carries `receipt` when the same stored clip can be committed again);
 * resolves with the refusal as a typed result.
 */
export async function sendCanvasVoiceNote(
  conversationId: string,
  wav: Blob,
  target: CanvasVoiceTarget,
  resume?: VoiceUploadReceipt,
): Promise<CanvasVoiceResult> {
  const receipt = await storeVoiceClip(conversationId, wav, { resume });
  const data = await commitVoiceClip(receipt, {
    canvas: {
      canvasId: target.canvasId ?? null, fromVersionId: target.fromVersionId ?? null, expectedDraftId: target.expectedDraftId ?? null,
      expectedRevision: target.expectedRevision ?? null, replace: target.replace === true, boxRefs: target.boxRefs?.length ? target.boxRefs : null,
    },
  }, 'canvas');
  const answer = data.canvas as Record<string, unknown>;
  const refused = refusalOf(answer);
  if (refused) return { ...refused, receipt };
  return { ok: true, sent: canvasSentOf(answer) };
}
