/**
 * P1536: what a thread panel draws for a canvas draft, handed over as pieces to place so the panel itself stays plain: the
 * header's title, the message list's top and hidden root, the first read's state, and the composer's Upload button.
 * Everything is empty (undefined or null) for an ordinary thread, and while canvas drafting is off or unknown.
 */
import type { ReactNode } from 'react';
import type { CanvasDraft } from '@/app/data/canvas-draft-service';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import type { VoiceSender } from '@/hooks/use-voice-note';
import { CanvasThreadReadState } from './CanvasReadState';
import { CanvasCapNotice } from './CanvasCapNotice';
import { sendSlotOf, type CanvasWorkspaceProps } from './canvas-send-slot';
import { canvasRetryTrailing } from './canvas-retry-trailing';
import { canvasUndoAfter, newestMirrorMessageId } from './canvas-undo-after';
import { useCanvasUndo } from './use-canvas-undo';
import { canvasListParts } from './canvas-list-parts';
import { CanvasThreadTitle } from './CanvasThreadHeader';
import { UploadSpot } from './CanvasUploadButton';
import { findPublishReply } from './canvas-publish-reply';
import { PublishReplyOpen } from './PublishReplyOpen';
import { CanvasClosedLine } from './CanvasClosedLine';
import { useCanvasPane } from './use-canvas-pane';
import { sendOfRoute, sendRouteOf, useHeldSend } from './use-held-send';
import type { CanvasThread, CanvasThreadStatus } from './use-canvas-thread';

export interface CanvasPartsArgs { canvasRoot: boolean; /** The thread's first read is out and its root is unknown: a Send waits for it, never posted as a plain message blind. */ rootPending?: boolean;
  /** The chat's own send: where a waiting Send goes when its thread turns out to be plain. */
  sendPlain: (body: string) => unknown; /** The canvas workspace's own props for the thread it hosts (also: a canvas draft's thread from the first render). */ workspace?: CanvasWorkspaceProps; rootId: string; messages: ChatMessage[]; userId: string; ownerSlug: string | null | undefined; mirror: ChatSummary;
  /** W8: the canvas's shown name (the owner's rename); absent: the title of its tag. */
  canvasTitle?: string;
  /** W4: the root's canvas version, outside the canvas workspace only (its Publish reply carries "Open canvas", and a closed thread says what became of it; the workspace's panel has neither). */
  openCanvasFrom?: string | null }

export interface CanvasParts {
  headerTitle: ReactNode;
  list: { lead: ReactNode; leadAfterId: string | null; hideId: string | null };
  /** The first read's state (loading, failed) under the list; nothing otherwise. */
  readState: ReactNode;
  leading: ReactNode;
  /** A failed newest run's Try again, under the owner message it belongs to (null otherwise). */
  trailing: { afterId: string; node: ReactNode } | null;
  /** D7: Undo (or its waiting status) under the newest applied run's reply, and "Undone" under the owner messages it undid, by message id. */
  after: Record<string, ReactNode>;
  runActive: boolean;
  /** D15: why the next Send must wait (its status for the send slot), or undefined. */
  waiting: string | undefined;
  /** §2: the open draft has had its 30 updates: this sentence takes the composer's place (null otherwise). */
  capNotice: ReactNode;
  /** 3c X11: a CLOSED draft's thread read outside the workspace: the line that takes the composer's place (null otherwise). */
  closedLine: ReactNode;
  send: ((body: string) => Promise<boolean>) | null;
  /** X9: the round voice button's sender while the open draft takes notes (null otherwise). */
  voice: VoiceSender | null;
  /** What the retired-address redirect needs: drafting on/off/unknown, the first read's status, and the draft it found. */
  address: { canvasOn: boolean | null; status: CanvasThreadStatus; draft: CanvasDraft | null };
}

export function useCanvasParts(args: CanvasPartsArgs): CanvasParts {
  const pane = useCanvasPane(args);
  const { canvas, canvasOn, uploader } = pane;
  const live = canvasOn === true ? canvas : null;
  const undo = useCanvasUndo(live);
  // W0: "Send is the update". A Send before the thread's answer is known waits and then goes the way the answer says (use-held-send), never refused.
  const route = sendRouteOf({ onSend: pane.onSend, rootPending: !!args.rootPending, canvasRoot: args.canvasRoot, canvasOn, canvas, readStatus: pane.read.status });
  const held = useHeldSend(route, args.sendPlain);
  const slot = sendSlotOf({ live, uploading: uploader.busy, elsewhere: pane.elsewhere, holdFirstRead: args.workspace?.holdFirstRead, readStatus: pane.read.status, sendWaiting: sendWaitingOf(pane.sending, held.pending, args.canvasRoot) });
  return {
    /** The header's title for a canvas thread; null: the ordinary "Thread" title. */
    headerTitle: live ? <CanvasThreadTitle draft={live.draft} ownerSlug={args.ownerSlug} title={args.canvasTitle} /> : null,
    list: canvasListParts({ canvasRoot: args.canvasRoot, rootId: args.rootId, workspace: args.workspace, mirror: args.mirror, canvas, canvasOn }),
    // The read's own state (loading, failed with Retry) shows whenever drafting is not KNOWN to be off: a Send is held against it (below).
    readState: canvasOn !== false ? <CanvasThreadReadState status={pane.read.status} onRetry={pane.read.retry} /> : null,
    /** The composer's Upload button, while the draft takes files. */
    leading: live?.draft.state === 'open' ? <UploadSpot waiting={!!slot.waiting} busy={uploader.busy} onPick={(f) => void uploader.upload(f)} /> : undefined,
    trailing: canvasRetryTrailing(live, args) ?? publishReplyOpen(args),
    after: canvasUndoAfter(undo, undo.failed ? newestMirrorMessageId(args.messages, args.userId, args.rootId) : null),
    closedLine: closedThreadLine(live, args),
    /** A run is going, or a file is being added (D15: Publish waits): the workspace's Publish spot reads "Updating…" meanwhile. */
    runActive: slot.active,
    waiting: slot.waiting,
    capNotice: slot.atCap ? <CanvasCapNotice canPublish={!!args.workspace?.canPublish} startOver={args.workspace?.startOver} /> : null,
    /** Sends a text message into the open draft (message + run in one call); null: the chat's own send is used. */
    send: sendOfRoute(route, held.hold, held.pending),
    voice: pane.onVoice,
    address: { canvasOn, status: pane.read.status, draft: canvas?.draft ?? null },
  };
}

/** A Send of this thread is on its way, or one waits for the thread's answer (only a canvas thread's Sends wait on it). */
function sendWaitingOf(sending: boolean, heldPending: boolean, canvasRoot: boolean): boolean {
  return sending || (heldPending && canvasRoot);
}

/** W4: "Open canvas" under the Publish reply of a canvas thread shown outside the workspace. */
function publishReplyOpen(args: { canvasRoot: boolean; rootId: string; messages: ChatMessage[]; userId: string; openCanvasFrom?: string | null }): { afterId: string; node: ReactNode } | null {
  const reply = args.canvasRoot && args.openCanvasFrom ? findPublishReply(args.messages) : null;
  return reply && args.openCanvasFrom ? { afterId: reply.id, node: <PublishReplyOpen rootId={args.rootId} versionId={args.openCanvasFrom} viewerId={args.userId} /> } : null;
}

/** 3c X11: the line that takes a CLOSED draft's composer in the mirror chat's own thread panel (never inside the workspace, which has no `openCanvasFrom`). */
function closedThreadLine(live: CanvasThread | null, args: { rootId: string; userId: string; openCanvasFrom?: string | null }): ReactNode {
  if (!live || live.draft.state === 'open' || !args.openCanvasFrom) return null;
  return <CanvasClosedLine rootId={args.rootId} versionId={args.openCanvasFrom} viewerId={args.userId} draftState={live.draft.state} />;
}
