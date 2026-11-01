/**
 * P1536: what a thread panel draws for a canvas draft, handed over as pieces to place so the panel itself stays plain: the
 * header's title and "…" menu, the message list's top, tail and hidden root, the tray, and the composer's Upload button.
 * Everything is empty (undefined or null) for an ordinary thread, and while canvas drafting is off or unknown.
 */
import type { ReactNode } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import { CanvasDraftEnd, CanvasThreadBar, CanvasThreadReadState } from './canvas-thread';
import { CanvasThreadOpener } from './CanvasOpener';
import { CanvasDraftMenu, CanvasThreadTitle } from './CanvasThreadHeader';
import { CanvasUploadButton } from './CanvasUploadButton';
import { useCanvasPane } from './use-canvas-pane';

type Pane = ReturnType<typeof useCanvasPane>;

/** The tray under the list: the first read's state (loading, failed), then the tray itself, then a dialog the tray may open. */
function trayOf(p: Pane): ReactNode {
  return (
    <>
      {p.canvasOn === true && <CanvasThreadReadState status={p.read.status} onRetry={p.read.retry} />}
      {p.bar && <CanvasThreadBar {...p.bar} />}
      {p.dialog}
    </>
  );
}

export function useCanvasParts(args: { canvasRoot: boolean; rootId: string; messages: ChatMessage[]; userId: string; ownerSlug: string | null | undefined; mirrorTitle: string | null | undefined; hideDraftCard?: boolean }) {
  const pane = useCanvasPane(args);
  const { canvas, canvasOn, bar, uploader, onDiscard } = pane;
  const live = canvasOn === true ? canvas : null;
  return {
    /** The header's title for a canvas thread; null: the ordinary "Thread" title. */
    headerTitle: live ? <CanvasThreadTitle draft={live.draft} ownerSlug={args.ownerSlug} /> : null,
    headerMenu: onDiscard ? <CanvasDraftMenu onDiscard={onDiscard} /> : undefined,
    list: {
      lead: live ? <CanvasThreadOpener title={args.mirrorTitle} /> : undefined,
      // An update's root is the base version: its card comes first, then the opener (a new canvas has no card, the opener is first).
      leadAfterId: live?.draft.baseVersionId ? args.rootId : null,
      tail: bar && !args.hideDraftCard ? <CanvasDraftEnd {...bar} /> : undefined,
      // A new canvas has no card at the top (its root only carries the draft's own version); an update's root is the base version.
      hideId: args.canvasRoot && canvasOn !== false && !canvas?.draft.baseVersionId ? args.rootId : null,
    },
    tray: trayOf(pane),
    /** The composer's Upload button, while the draft takes files. */
    leading: live?.draft.state === 'open' ? <CanvasUploadButton busy={uploader.busy} onPick={(f) => void uploader.upload(f)} /> : undefined,
    /** A run is going, this tray's own request, or a file is being added (D15: Publish waits): the workspace's Publish spot reads "Updating…" meanwhile. */
    runActive: !!live && (live.running || !!bar?.busy || uploader.busy),
    /** Sends a text message into the open draft (message + run in one call); null: the chat's own send is used. */
    send: live ? pane.onSend : null,
  };
}
