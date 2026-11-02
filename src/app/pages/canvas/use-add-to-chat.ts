/**
 * @file use-add-to-chat.ts
 * @description P1536 D5 / J2 / J3 / J4: the workspace's two taps from the canvas into the thread.
 *  - `addToChat(tag)`: the owner's tap on a box. On a draft, or a pending Clone, the thread is brought into view and the tag goes in the composer inside the tap. On a
 *    PUBLISHED version with nothing being edited it writes nothing: it runs the same `clone()` decision as the Clone button (none: pending; same base: opens
 *    that draft; another base with a message: the J4 sheet; untouched: pending), and the tag waits on the bus until the thread it was meant for is on screen
 *    (a pending Clone's or the open draft's, never the other base's draft while the sheet is up). Dismissing the sheet drops it (the caller clears the bus).
 *  - `showBox(tag)`: a reply chip. Below 1280 it switches to Canvas; the box scrolls to the middle and rings for two seconds.
 * Both flip the switcher below 1280 and open a closed panel from 1280, with focus inside the call (use-workspace-panel's `showThread`).
 * A read that still shows the draft just published as open decides nothing (`closedDraftId`): the tap waits for the read after it, or it would go to a thread that is no longer there.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { highlightBox } from '@/app/components/canvas/canvas-box-highlight';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import type { WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';
import { createComposerTagBus } from '@/app/pages/chat/composer-tag-bus';
import type { ReportedCanvas } from './use-reported-canvas';
import type { ClonePending } from './use-clone-canvas';

// [FOUNDER DECISION: said when a tapped box could not be added to the chat because the page never finished reading.]
export const TAG_DROPPED_TEXT = 'Could not add that box to the chat. Tap Add to chat again.';

/**
 * What the tap knows about the version on screen: the page's fresh read for the address, else the last read of THAT SAME version (a re-read in flight, or a failed
 * one, leaves the fresh one null; a draft or a pending Clone is decided from the old read, and Clone itself, which needs the fresh one, waits for it).
 */
function knownRead(reported: ReportedCanvas, held: CanvasReady | null, version: string | null): CanvasReady | null {
  const fresh = reported.forVersion === version ? reported.ready : null;
  return fresh ?? (held && (version === null || held.version === version) ? held : null);
}

export function useAddToChat(
  reported: ReportedCanvas,
  /** The last read for this canvas, kept through re-reads. */
  held: CanvasReady | null,
  /** The `?v=` in the address. */
  version: string | null,
  /** The viewer is the canvas's owner with the owner's header: only then are Add to chat and the chips offered. */
  owner: boolean,
  /** The Clone state: its decision (null: the viewer cannot clone here, so cannot add to chat either), whether one is pending, the J4 sheet, and closing it with no answer. */
  cloneState: { clone: (() => void) | null; pending: ClonePending | null; sheet: unknown; dismissSheet: () => void },
  panel: { showThread: () => void; setView: (v: WorkspaceView) => void; setPanelOpen: (open: boolean) => void },
  /** The draft just published from this page: until the page has read again, the read on screen still shows it open. */
  closedDraftId: string | null = null,
) {
  const { clone, dismissSheet } = cloneState;
  const pending = !!cloneState.pending;
  const { showThread, setView, setPanelOpen } = panel;
  const current = (r: CanvasReady | null): CanvasReady | null => (r?.draft && r.draft.id === closedDraftId ? null : r);
  const fresh = current(reported.forVersion === version ? reported.ready : null);
  const known = current(knownRead(reported, held, version));
  // "The thread the tags were meant for is on screen": a pending Clone's, or the draft's. A published view with only another base's draft behind it is neither.
  const landed = !!known && (pending || isViewingDraft(known));
  const now = useRef({ landed, known, fresh, clone, pending, sheetOpen: !!cloneState.sheet, setView, setPanelOpen });
  now.current = { landed, known, fresh, clone, pending, sheetOpen: !!cloneState.sheet, setView, setPanelOpen };
  const bus = useMemo(() => {
    const b = createComposerTagBus();
    // A tag that lands without a tap to show it (the draft opened, the sheet's answer taken) brings the thread into view; one that waited too long is said, not lost silently.
    b.configure(() => now.current.landed, () => { now.current.setView('chat'); now.current.setPanelOpen(true); }, () => {
      if (now.current.sheetOpen) return true; // the owner is still being asked: it waits for the answer
      toast.error(TAG_DROPPED_TEXT);
      return false;
    });
    return b;
  }, []);
  // Whatever waited (the draft opened, the sheet's answer taken) is taken once the thread it was meant for is the one on screen.
  useEffect(() => bus.flush(false), [bus, landed]);
  // Leaving the workspace disposes what is held: no timer outlives it, so no sentence about a tap is said on another page, and an open sheet cannot keep one re-arming.
  useEffect(() => () => bus.clear(), [bus]);

  /** What a tap does once the version is known; false: not yet (the read it needs is out). */
  const decide = useCallback((sync: boolean): boolean => {
    const { known: r, fresh: f, clone: cloneNow, pending: isPending } = now.current;
    if (!r) return false;
    if (!isViewingDraft(r) && !r.publishedNone && !isPending) {
      if (!f || !cloneNow) return false; // Clone's decision needs the read for this very address
      // Nothing is written: Clone only enters the pending state, whose composer exists after the address (`ws=1`) has changed. The router applies a location change in a React
      // transition, which a flushSync in the tap does not reach (measured in a real browser: the focus is still on the page when the handler returns), so the composer
      // cannot be in the handler here; the tag lands, and the field is focused, as soon as it is mounted (the bus's late landing).
      cloneNow();
      return true;
    }
    // a draft or a pending Clone: bring the thread into view, then the tag goes in (inside this same tap when there is one)
    if (sync) showThread();
    else {
      now.current.setView('chat');
      now.current.setPanelOpen(true);
    }
    bus.flush(sync);
    return true;
  }, [bus, showThread]);
  // A tap that has to wait for the read (the boxes draw while the page loads or re-reads) is decided when it arrives, unless its tag was dropped meanwhile.
  const [early, setEarly] = useState(false);
  const addToChat = useCallback((tag: string) => {
    bus.hold(tag);
    if (!decide(true)) setEarly(true);
  }, [bus, decide]);
  const actionable = !!known && (isViewingDraft(known) || pending || known.publishedNone || !!fresh);
  useEffect(() => {
    if (!early || !actionable) return;
    setEarly(false);
    if (bus.size() > 0) decide(false);
  }, [early, actionable, bus, decide]);

  const showBox = useCallback((tag: string) => {
    flushSync(() => now.current.setView('canvas'));
    highlightBox(tag);
  }, []);
  /** The sheet closed with no answer: the tag it was asked for is dropped with it. */
  const dismiss = useCallback(() => { bus.clear(); dismissSheet(); }, [bus, dismissSheet]);
  const tap = useMemo(() => ({ addToChat: owner && clone ? addToChat : null, showBox: owner ? showBox : null }), [owner, clone, addToChat, showBox]);
  return { bus, tap, dismissSheet: dismiss };
}
