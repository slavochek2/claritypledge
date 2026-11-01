/**
 * P1536: what a thread panel draws for a canvas draft, handed over as pieces to place so the panel itself stays plain: the
 * header's title, the message list's top and hidden root, the first read's state, and the composer's Upload button.
 * Everything is empty (undefined or null) for an ordinary thread, and while canvas drafting is off or unknown.
 */
import type { ReactNode } from 'react';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import type { ChatMessage } from '@/app/data/chat-service';
import { CanvasThreadReadState } from './CanvasReadState';
import { CanvasThreadOpener } from './CanvasOpener';
import { CanvasThreadTitle } from './CanvasThreadHeader';
import { CanvasUploadButton } from './CanvasUploadButton';
import { useCanvasPane } from './use-canvas-pane';
import type { CanvasThreadStatus } from './use-canvas-thread';

export function useCanvasParts(args: { canvasRoot: boolean; rootId: string; messages: ChatMessage[]; userId: string; ownerSlug: string | null | undefined; mirrorTitle: string | null | undefined }): {
  headerTitle: ReactNode;
  list: { lead: ReactNode; leadAfterId: string | null; hideId: string | null };
  /** The first read's state (loading, failed) under the list; nothing otherwise. */
  readState: ReactNode;
  leading: ReactNode;
  runActive: boolean;
  send: ((body: string) => Promise<boolean>) | null;
  /** What the retired-address redirect needs: drafting on/off/unknown, the first read's status, and the draft it found. */
  address: { canvasOn: boolean | null; status: CanvasThreadStatus; draft: CanvasDraft | null };
} {
  const pane = useCanvasPane(args);
  const { canvas, canvasOn, uploader } = pane;
  const live = canvasOn === true ? canvas : null;
  return {
    /** The header's title for a canvas thread; null: the ordinary "Thread" title. */
    headerTitle: live ? <CanvasThreadTitle draft={live.draft} ownerSlug={args.ownerSlug} /> : null,
    list: {
      lead: live ? <CanvasThreadOpener title={args.mirrorTitle} /> : undefined,
      // An update's root is the base version: its card comes first, then the opener (a new canvas has no card, the opener is first).
      leadAfterId: live?.draft.baseVersionId ? args.rootId : null,
      // A new canvas has no card at the top (its root only carries the draft's own version); an update's root is the base version.
      hideId: args.canvasRoot && canvasOn !== false && !canvas?.draft.baseVersionId ? args.rootId : null,
    },
    readState: canvasOn === true ? <CanvasThreadReadState status={pane.read.status} onRetry={pane.read.retry} /> : null,
    /** The composer's Upload button, while the draft takes files. */
    leading: live?.draft.state === 'open' ? <CanvasUploadButton busy={uploader.busy} onPick={(f) => void uploader.upload(f)} /> : undefined,
    /** A run is going, or a file is being added (D15: Publish waits): the workspace's Publish spot reads "Updating…" meanwhile. */
    runActive: !!live && (live.running || uploader.busy),
    /** Sends a text message into the open draft (message + run in one call); null: the chat's own send is used. */
    send: pane.onSend,
    address: { canvasOn, status: pane.read.status, draft: canvas?.draft ?? null },
  };
}
