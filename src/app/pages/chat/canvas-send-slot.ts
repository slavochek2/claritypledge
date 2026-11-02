/**
 * @file canvas-send-slot.ts
 * @description P1536 §2 "Composer send slot" and D15, as one pure function: what a canvas thread's send slot says, from the draft's run, an upload in
 * flight, a `busy_elsewhere` refusal and the first read after a first Send. `active` is what the Publish spot also reads ("Updating…").
 */
import type { ReactNode } from 'react';
import { REVISION_CAP_RUNS, SEND_SLOT_ELSEWHERE, SEND_SLOT_UPDATING } from './canvas-thread-copy';
import type { CanvasThread, CanvasThreadStatus } from './use-canvas-thread';

/** What the canvas workspace tells the thread panel it hosts (its presence also says: this is a canvas draft's thread from the first render). */
export interface CanvasWorkspaceProps {
  /** A first Send just made this draft: until its thread's first read has answered, the run state is unknown and reads as "going". */
  holdFirstRead?: boolean;
  /** At the cap: whether the draft has something to publish (then the sentence says Publish). */
  canPublish?: boolean;
  /** At the cap with nothing to publish: the workspace's Start over. */
  startOver?: ReactNode;
  /** 3c X8: the version number this draft was started from (null: a new canvas). A draft with a base opens with the mirror agent's line. */
  baseSeq?: number | null;
  /** The thread read its open draft at this revision, its newest run a finished draft run (the canvas page beside it must not stay behind it). */
  onDraftRead?: (draftId: string, revision: number) => void;
  /** The thread's first read has answered (whatever it said): reported in a layout effect, in the commit that shows it. */
  onThreadAnswered?: (rootId: string) => void;
}

export interface SendSlot {
  /** The status that replaces Send (and Upload) while the next Send must wait; undefined: the slot is free. */
  waiting: string | undefined;
  /** The open draft has had its 30 updates: the composer gives way to the cap sentence. */
  atCap: boolean;
  /** A run is going, a file is being added, or the first read after a first Send is out: Publish waits too. */
  active: boolean;
}

export function sendSlotOf(args: { live: CanvasThread | null; uploading: boolean; elsewhere: boolean; holdFirstRead?: boolean; readStatus: CanvasThreadStatus;
  /** The thread read a run going, whether or not drafting's availability has answered yet: Publish waits for a run the thread knows about (`live` waits for availability too). */
  runGoing?: boolean;
  /** A Send of this canvas thread is waiting for the thread's answer, or is on its way and not yet re-read: the slot reads Updating… and Publish waits. */
  sendWaiting?: boolean }): SendSlot {
  const { live, uploading, elsewhere, holdFirstRead, readStatus, runGoing, sendWaiting } = args;
  const busy = !!live && (live.running || uploading);
  const held = !!holdFirstRead && readStatus === 'loading';
  return {
    waiting: busy || sendWaiting ? SEND_SLOT_UPDATING : elsewhere ? SEND_SLOT_ELSEWHERE : undefined,
    atCap: !!live && live.draft.state === 'open' && live.draft.runCount >= REVISION_CAP_RUNS,
    active: busy || held || !!runGoing || !!sendWaiting,
  };
}
