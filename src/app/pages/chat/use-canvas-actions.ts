/**
 * P1536: what the owner can do to a canvas draft from its thread panel: Send. A text message in an open draft's thread is sent
 * with canvas_workspace_send (message + queued run in one call); the draft is then re-read from the database. Send IS the update (W0):
 * the old tray's Create canvas / Update draft / Publish / Discard are gone. A refusal is said once, as a toast; `false` hands the text
 * back to the composer. `onSend` is null unless the canvas's flag is exactly true, the draft was read, and it is open.
 */
import { toast } from 'sonner';
import { sendCanvasWorkspaceMessage, type CanvasRefusalCode } from '@/app/data/canvas-draft-service';
import { DRAFT_ERROR_TEXT } from './canvas-thread-copy';
import { createUnresolvedClientIds } from './unresolved-client-ids';
import type { CanvasThread } from './use-canvas-thread';

/** The client id of each Send whose outcome is not known (a lost response), by draft and words: the retry replays instead of duplicating. */
const unresolved = createUnresolvedClientIds();

/** What a refused Send says. [FOUNDER DECISION: busy_elsewhere and stale_view wording; S3 owns it] */
export function sendRefusedText(code: CanvasRefusalCode): string {
  if (code === 'busy' || code === 'busy_elsewhere') return DRAFT_ERROR_TEXT.BUSY ?? 'That did not go through. Try again.';
  if (code === 'cap_reached') return DRAFT_ERROR_TEXT.REVISION_CAP ?? 'That did not go through. Try again.';
  return DRAFT_ERROR_TEXT.FAILED ?? 'That did not go through. Try again.';
}

export function useCanvasActions({ thread, available }: { thread: CanvasThread | null; available: boolean | null }): { onSend: ((body: string) => Promise<boolean>) | null } {
  if (!thread || available !== true || thread.draft.state !== 'open') return { onSend: null };
  const { draft, reload } = thread;
  const onSend = async (body: string): Promise<boolean> => {
    const key = `${draft.id}|${body}`;
    try {
      const r = await sendCanvasWorkspaceMessage({ canvasId: draft.canvasId, expectedDraftId: draft.id, expectedRevision: draft.revision, body, clientId: unresolved.idFor(key) });
      unresolved.settle(key); // an answer, a refusal included: the next Send of these words is a new message
      if (!r.ok) toast.error(sendRefusedText(r.refused));
      else if (r.start && !r.start.ok && DRAFT_ERROR_TEXT[r.start.code]) toast.error(DRAFT_ERROR_TEXT[r.start.code]);
      await reload(); // a refusal means the screen is behind: the next Send carries the revision read here
      return r.ok;
    } catch {
      toast.error(DRAFT_ERROR_TEXT.FAILED);
      return false;
    }
  };
  return { onSend };
}
