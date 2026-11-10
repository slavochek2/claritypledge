/**
 * P1536: what the owner can do to a canvas draft from its thread panel: Send. A text message in an open draft's thread is sent
 * with canvas_workspace_send (message + queued run in one call); the draft is then re-read from the database. Send IS the update (W0):
 * the old tray's Create canvas / Update draft / Publish / Discard are gone. A refusal is said once, as a toast; `false` hands the text
 * back to the composer. `onSend` is null unless the canvas's flag is exactly true, the draft was read, and it is open.
 * `sending` is true from the moment `onSend` is called until it settles (the re-read is inside it, so a run the Send started is already going when it drops).
 *
 * `onVoice` (3c X9) is the round voice button's sender, under the same conditions. A voice note is committed with the draft's id and the revision read
 * AT THAT MOMENT (a ref, so a Retry after a refusal carries the revision the re-read found), and the run begins on the server when its transcript lands:
 * nothing here starts it. A refusal says nothing but keeps the clip for Retry (the stored clip is committed again, never uploaded again).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sendCanvasWorkspaceMessage, type CanvasRefusalCode } from '@/app/data/canvas-draft-service';
import { sendCanvasVoiceNote } from '@/app/data/canvas-voice-service';
import { VoiceNoteError } from '@/app/data/chat-voice-service';
import type { VoiceSender } from '@/hooks/use-voice-note';
import { DRAFT_ERROR_TEXT, STALE_VIEW_TEXT, startRefusedText } from './canvas-thread-copy';
import { decodeTagged } from './composer-tags';
import { createUnresolvedClientIds } from './unresolved-client-ids';
import type { CanvasThread } from './use-canvas-thread';

/** The client id of each Send whose outcome is not known (a lost response), by draft and words: the retry replays instead of duplicating. */
const unresolved = createUnresolvedClientIds();

/** What a refused Send says. [FOUNDER DECISION: busy_elsewhere and stale_view wording; S3 owns it] */
export function sendRefusedText(code: CanvasRefusalCode): string {
  if (code === 'busy' || code === 'busy_elsewhere') return DRAFT_ERROR_TEXT.BUSY ?? 'That did not go through. Try again.';
  if (code === 'cap_reached') return DRAFT_ERROR_TEXT.REVISION_CAP ?? 'That did not go through. Try again.';
  if (code === 'stale_view') return STALE_VIEW_TEXT; // P1653: a send that was behind says what the offers say
  return DRAFT_ERROR_TEXT.FAILED ?? 'That did not go through. Try again.';
}

export function useCanvasActions({ thread, available, onBusyElsewhere }: { thread: CanvasThread | null; available: boolean | null; onBusyElsewhere?: () => void }): { onSend: ((body: string) => Promise<boolean>) | null; onVoice: VoiceSender | null; sending: boolean } {
  const draftId = thread?.draft.id ?? null;
  const latest = useRef({ thread, onBusyElsewhere });
  latest.current = { thread, onBusyElsewhere };
  /** The draft whose Send is on its way: a Send of another draft (or none) does not make this one `sending`, so a draft change lets go by itself. */
  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const onVoice = useCallback<VoiceSender>(async (wav, attempt) => {
    const t = latest.current.thread;
    if (!t || t.draft.state !== 'open') throw new VoiceNoteError('forbidden', 403, 'canvas voice note: no open draft');
    const { draft, reload } = t;
    setSendingFor(draft.id);
    try {
      const r = await sendCanvasVoiceNote(draft.conversationId, wav, { canvasId: draft.canvasId, expectedDraftId: draft.id, expectedRevision: draft.revision, boxRefs: attempt?.boxRefs }, attempt?.resume);
      await reload().catch(() => undefined); // the note's message and run are in; a refusal means the screen is behind
      if (r.ok) return;
      if (r.refused === 'busy_elsewhere') latest.current.onBusyElsewhere?.(); // the send slot says it (§2)
      throw new VoiceNoteError('failed', 409, `canvas voice note refused: ${r.refused}`, r.receipt);
    } finally {
      if (alive.current) setSendingFor((cur) => (cur === draft.id ? null : cur));
    }
  }, []);
  if (!thread || available !== true || thread.draft.state !== 'open') return { onSend: null, onVoice: null, sending: false };
  const { draft, reload } = thread;
  const onSend = async (body: string): Promise<boolean> => {
    const key = `${draft.id}|${body}`; // the body as the composer made it: the same words with other tags are another message
    const { text, refs } = decodeTagged(body); // S4: tag tokens become "[Title]" in the words, and the boxes go as their own list
    setSendingFor(draft.id);
    try {
      const r = await sendCanvasWorkspaceMessage({ canvasId: draft.canvasId, expectedDraftId: draft.id, expectedRevision: draft.revision, body: text, ...(refs.length ? { boxRefs: refs } : {}), clientId: unresolved.idFor(key) });
      unresolved.settle(key); // an answer, a refusal included: the next Send of these words is a new message
      if (!r.ok && r.refused === 'busy_elsewhere' && onBusyElsewhere) onBusyElsewhere(); // the send slot says it (§2); no toast
      else if (!r.ok) toast.error(sendRefusedText(r.refused));
      else if (r.start && !r.start.ok) {
        const said = startRefusedText(r.start.code, thread.run?.inputKind);
        if (said) toast.error(said);
      }
      await reload(); // a refusal means the screen is behind: the next Send carries the revision read here
      return r.ok;
    } catch {
      toast.error(DRAFT_ERROR_TEXT.FAILED);
      return false;
    } finally {
      if (alive.current) setSendingFor((cur) => (cur === draft.id ? null : cur));
    }
  };
  return { onSend, onVoice, sending: sendingFor === draftId };
}
