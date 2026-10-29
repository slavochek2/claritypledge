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
import { uploadCanvasMaterial, type CanvasMaterialItem } from '@/app/data/canvas-draft-service';
import { DRAFT_ERROR_TEXT, MAX_UPLOAD_BYTES } from './canvas-thread-copy';
import type { UploadItem } from './canvas-items';

export interface CanvasUploads {
  uploads: UploadItem[];
  /** A file is being read now: the button waits. */
  busy: boolean;
  upload: (file: File | undefined) => Promise<void>;
}

/**
 * `onSettled`: re-reads the draft's material; resolves once that read is in. `material`: what the draft holds now (its file
 * ids are noted when an upload goes up, to tell the file it adds from the ones already there).
 */
export function useCanvasUploads(draftId: string | null, onSettled: () => Promise<void>, material: CanvasMaterialItem[]): CanvasUploads {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const inFlight = useRef(false);
  const count = useRef(0);
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
        const r = await uploadCanvasMaterial(draftId, file);
        if (r.ok) {
          // Hold the row as "reading" until the material that replaces it is in; both change in one render.
          await onSettled().catch(() => undefined);
          settle({ status: 'read', label: r.label, before });
        } else {
          settle({ status: 'failed', code: r.code });
          toast.error(DRAFT_ERROR_TEXT[r.code] ?? 'That did not go through. Try again.');
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
    [draftId, onSettled],
  );

  return { uploads, busy: uploads.some((u) => u.status === 'reading'), upload };
}
