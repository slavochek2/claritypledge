/**
 * P1536: what a thread panel draws for a canvas draft, handed over as pieces to place so the panel itself stays plain: the
 * header's title, the message list's top and hidden root, the first read's state, and the composer's Upload button.
 * Everything is empty (undefined or null) for an ordinary thread, and while canvas drafting is off or unknown.
 */
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import type { ChatMessage } from '@/app/data/chat-service';
import { CanvasThreadReadState } from './CanvasReadState';
import { DRAFT_ERROR_TEXT } from './canvas-thread-copy';
import { canvasRetryTrailing } from './canvas-retry-trailing';
import { CanvasThreadOpener } from './CanvasOpener';
import { CanvasThreadTitle } from './CanvasThreadHeader';
import { CanvasUploadButton } from './CanvasUploadButton';
import { findPublishReply } from './canvas-publish-reply';
import { PublishReplyOpen } from './PublishReplyOpen';
import { useCanvasPane } from './use-canvas-pane';
import type { CanvasThreadStatus } from './use-canvas-thread';

/**
 * W0: "Send is the update". In a canvas thread whose draft is not readable yet (still reading, the read failed, drafting not confirmed) a Send must not
 * fall through to the chat's own send: the text would post as a plain message and start no run, with no error. It is held instead: refused at once (the
 * composer keeps the text), with the read's own state (loading, or the failure with Retry) on screen. Drafting KNOWN to be off stays a readable thread
 * with the chat's own composer, as before; a thread whose draft is closed likewise.
 */
function sendHeld(canvasRoot: boolean, canvasOn: boolean | null, canvas: { draft: CanvasDraft } | null): boolean {
  return canvasRoot && canvasOn !== false && !(canvas && canvas.draft.state !== 'open');
}
const holdSend = async (): Promise<boolean> => {
  toast.error(DRAFT_ERROR_TEXT.FAILED);
  return false;
};

export function useCanvasParts(args: { canvasRoot: boolean; rootId: string; messages: ChatMessage[]; userId: string; ownerSlug: string | null | undefined; mirrorTitle: string | null | undefined;
  /** W8: the canvas's shown name (the owner's rename); absent: the title of its tag. */
  canvasTitle?: string;
  /** W4: the root's canvas version, outside the canvas workspace only (its Publish reply carries "Open canvas"; the workspace's panel has no Open). */
  openCanvasFrom?: string | null }): {
  headerTitle: ReactNode;
  list: { lead: ReactNode; leadAfterId: string | null; hideId: string | null };
  /** The first read's state (loading, failed) under the list; nothing otherwise. */
  readState: ReactNode;
  leading: ReactNode;
  /** A failed newest run's Try again, under the owner message it belongs to (null otherwise). */
  trailing: { afterId: string; node: ReactNode } | null;
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
    headerTitle: live ? <CanvasThreadTitle draft={live.draft} ownerSlug={args.ownerSlug} title={args.canvasTitle} /> : null,
    list: {
      lead: live ? <CanvasThreadOpener title={args.mirrorTitle} /> : undefined,
      // An update's root is the base version: its card comes first, then the opener (a new canvas has no card, the opener is first).
      leadAfterId: live?.draft.baseVersionId ? args.rootId : null,
      // A new canvas has no card at the top (its root only carries the draft's own version); an update's root is the base version.
      hideId: args.canvasRoot && canvasOn !== false && !canvas?.draft.baseVersionId ? args.rootId : null,
    },
    // The read's own state (loading, failed with Retry) shows whenever drafting is not KNOWN to be off: a Send is held against it (below).
    readState: canvasOn !== false ? <CanvasThreadReadState status={pane.read.status} onRetry={pane.read.retry} /> : null,
    /** The composer's Upload button, while the draft takes files. */
    leading: live?.draft.state === 'open' ? <CanvasUploadButton busy={uploader.busy} onPick={(f) => void uploader.upload(f)} /> : undefined,
    trailing: canvasRetryTrailing(live, args) ?? publishReplyOpen(args),
    /** A run is going, or a file is being added (D15: Publish waits): the workspace's Publish spot reads "Updating…" meanwhile. */
    runActive: !!live && (live.running || uploader.busy),
    /** Sends a text message into the open draft (message + run in one call); null: the chat's own send is used. */
    send: pane.onSend ?? (sendHeld(args.canvasRoot, canvasOn, canvas) ? holdSend : null),
    address: { canvasOn, status: pane.read.status, draft: canvas?.draft ?? null },
  };
}

/** W4: "Open canvas" under the Publish reply of a canvas thread shown outside the workspace. */
function publishReplyOpen(args: { canvasRoot: boolean; messages: ChatMessage[]; userId: string; openCanvasFrom?: string | null }): { afterId: string; node: ReactNode } | null {
  const reply = args.canvasRoot && args.openCanvasFrom ? findPublishReply(args.messages) : null;
  return reply && args.openCanvasFrom ? { afterId: reply.id, node: <PublishReplyOpen versionId={args.openCanvasFrom} viewerId={args.userId} /> } : null;
}
