/**
 * P1536: the file being added to a canvas draft from this tab. One at a time. The upload button starts it; the workspace's Publish
 * spot and the send slot read "Updating…" while it goes (`busy`), and a refusal or a failure is said once, as a toast (the old tray
 * rows that said it are gone with W0).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sendCanvasWorkspaceMessage, uploadCanvasMaterial, type CanvasDraft, type CanvasDraftErrorCode, type CanvasRefusalCode } from '@/app/data/canvas-draft-service';
import { DRAFT_ERROR_TEXT, MAX_UPLOAD_BYTES } from './canvas-thread-copy';
import { createUnresolvedClientIds } from './unresolved-client-ids';

/** The client id of each file announcement whose outcome is not known (a lost response), by draft and file: the retry replays the same run. */
const unresolved = createUnresolvedClientIds();

export interface CanvasUploads {
  /** A file is being read now: the button waits. */
  busy: boolean;
  upload: (file: File | undefined) => Promise<void>;
}

/**
 * A file goes in two steps (spec section 2, Inputs): `canvas_workspace_send` announces it and makes the run, then the file is posted with that
 * run's id. `onSettled` re-reads the draft; it resolves once that read is in.
 */
/** [FOUNDER DECISION: wording] */
export const UPLOAD_WAIT_TEXT = 'The file did not go through. Wait a minute, then try again.';

/** What a file that was announced but not read says: the wait sentence for a post that never landed, the refusal's own sentence otherwise. */
export function uploadRefusalText(code: CanvasDraftErrorCode): string {
  return code === 'FAILED' ? UPLOAD_WAIT_TEXT : (DRAFT_ERROR_TEXT[code] ?? 'That did not go through. Try again.');
}

/** Posts the file; a failed post (the network) is tried once more after a short random pause, because the announced run is already waiting for it. */
export async function postFile(runId: string, file: File): Promise<Awaited<ReturnType<typeof uploadCanvasMaterial>>> {
  const attempt = async () => {
    try {
      return await uploadCanvasMaterial(runId, file);
    } catch {
      return { ok: false, code: 'FAILED' } as const;
    }
  };
  const first = await attempt();
  if (first.ok || first.code !== 'FAILED') return first;
  await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 400));
  return await attempt();
}

/** The error code a refused announcement of a file reads as (the sentences are DRAFT_ERROR_TEXT's). */
const refusedCode = (c: CanvasRefusalCode) => (c === 'busy' || c === 'busy_elsewhere' ? 'BUSY' : c === 'cap_reached' ? 'REVISION_CAP' : 'FAILED');

export function useCanvasUploads(draft: Pick<CanvasDraft, 'id' | 'canvasId' | 'revision'> | null, onSettled: () => Promise<void>): CanvasUploads {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const draftId = draft?.id ?? null;
  const canvasId = draft?.canvasId ?? null;
  const revision = draft?.revision ?? null;
  useEffect(() => setBusy(false), [draftId]);

  const upload = useCallback(
    async (file: File | undefined) => {
      if (!file || !draftId || inFlight.current) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(DRAFT_ERROR_TEXT.TOO_LARGE);
        return;
      }
      inFlight.current = true;
      setBusy(true);
      const key = `${draftId}|file:${file.name}:${file.size}`;
      try {
        const sent = await sendCanvasWorkspaceMessage({ canvasId, expectedDraftId: draftId, expectedRevision: revision, attachment: { kind: 'file', label: file.name }, clientId: unresolved.idFor(key) });
        unresolved.settle(key);
        if (!sent.ok) {
          // the screen is behind (stale_view) or a run is going: say so, and re-read so the next file carries the draft's current revision
          toast.error(DRAFT_ERROR_TEXT[refusedCode(sent.refused)] ?? 'That did not go through. Try again.');
          void onSettled().catch(() => undefined);
          return;
        }
        const r = await postFile(sent.runId, file);
        if (!r.ok) {
          // a post that failed twice leaves the announced run queued for a few minutes, so a new Send or file is refused as busy until it ends
          toast.error(uploadRefusalText(r.code));
        }
        await onSettled().catch(() => undefined);
      } catch {
        toast.error('That did not go through. Try again.');
        void onSettled().catch(() => undefined);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [draftId, canvasId, revision, onSettled],
  );

  return { busy, upload };
}
