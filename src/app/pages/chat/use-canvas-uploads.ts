/**
 * P1536: the files being added to a canvas draft from this tab. One at a time. The upload button starts them; the
 * pinned checklist shows them ("reading…", then the draft's own material row, or "couldn't read"). A file's row stays
 * "reading" until the draft's material has been read again (`onSettled` resolves), and after that the local entry stays
 * drawn as read until the material read actually carries the file (matched by the label the server answered and an id that
 * was not there before the upload went up; see canvas-items `fileRows`). So the row never goes missing between the local
 * entry and the database's own, even when the reload failed or came back without the file.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { sendCanvasWorkspaceMessage, uploadCanvasMaterial, type CanvasDraft, type CanvasMaterialItem, type CanvasRefusalCode } from '@/app/data/canvas-draft-service';
import { DRAFT_ERROR_TEXT, MAX_UPLOAD_BYTES } from './canvas-thread-copy';
import type { UploadItem } from './canvas-items';

export interface CanvasUploads {
  uploads: UploadItem[];
  /** A file is being read now: the button waits. */
  busy: boolean;
  upload: (file: File | undefined) => Promise<void>;
}

/**
 * A file goes in two steps (spec section 2, Inputs): `canvas_workspace_send` announces it and makes the run, then the file is posted with that
 * run's id. `onSettled`: re-reads the draft's material; resolves once that read is in. `material`: what the draft holds now (its file
 * ids are noted when an upload goes up, to tell the file it adds from the ones already there).
 */
/** [FOUNDER DECISION: wording] */
const UPLOAD_WAIT_TEXT = 'The file did not go through. Wait a minute, then try again.';

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

export function useCanvasUploads(draft: Pick<CanvasDraft, 'id' | 'canvasId' | 'revision'> | null, onSettled: () => Promise<void>, material: CanvasMaterialItem[]): CanvasUploads {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const inFlight = useRef(false);
  const count = useRef(0);
  const draftId = draft?.id ?? null;
  const canvasId = draft?.canvasId ?? null;
  const revision = draft?.revision ?? null;
  const held = useRef(material);
  held.current = material;
  useEffect(() => setUploads([]), [draftId]);

  const upload = useCallback(
    async (file: File | undefined) => {
      if (!file || !draftId || inFlight.current) return;
      const key = `upload-${(count.current += 1)}`;
      const settle = (patch: Partial<UploadItem>) => setUploads((all) => all.map((u) => (u.key === key ? { ...u, ...patch, at: Date.now() } : u)));
      // An earlier failure is dropped when the next file is tried.
      setUploads((all) => [...all.filter((u) => u.status !== 'failed'), { key, name: file.name, status: 'reading', at: Date.now() }]);
      if (file.size > MAX_UPLOAD_BYTES) {
        settle({ status: 'failed', code: 'TOO_LARGE' });
        toast.error(DRAFT_ERROR_TEXT.TOO_LARGE);
        return;
      }
      inFlight.current = true;
      const before = held.current.filter((m) => m.kind === 'file').map((m) => m.id);
      try {
        const sent = await sendCanvasWorkspaceMessage({ canvasId, expectedDraftId: draftId, expectedRevision: revision, attachment: { kind: 'file', label: file.name }, clientId: crypto.randomUUID() });
        if (!sent.ok) {
          // the screen is behind (stale_view) or a run is going: re-read, so the next file carries the draft's current revision
          settle({ status: 'failed', code: refusedCode(sent.refused) }); // the tray row says why; no second message in a toast
          void onSettled().catch(() => undefined);
          return;
        }
        const r = await postFile(sent.runId, file);
        if (r.ok) {
          // Hold the row as "reading" until the material that replaces it is in; both change in one render.
          await onSettled().catch(() => undefined);
          settle({ status: 'read', label: r.label || file.name, before });
        } else {
          settle({ status: 'failed', code: r.code });
          // a post that failed twice leaves the announced run queued for a few minutes, so a new Send or file is refused as busy until it ends
          toast.error(r.code === 'FAILED' ? UPLOAD_WAIT_TEXT : (DRAFT_ERROR_TEXT[r.code] ?? 'That did not go through. Try again.'));
          void onSettled().catch(() => undefined);
        }
      } catch {
        settle({ status: 'failed', code: 'FAILED' });
        toast.error('That did not go through. Try again.');
        void onSettled().catch(() => undefined);
      } finally {
        inFlight.current = false;
      }
    },
    [draftId, canvasId, revision, onSettled],
  );

  return { uploads, busy: uploads.some((u) => u.status === 'reading'), upload };
}
