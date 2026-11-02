/**
 * @file use-add-to-chat.ts
 * @description P1536 D5 / J2 / J3 / J4: the workspace's two taps from the canvas into the thread.
 *  - `addToChat(tag)`: the owner's tap on a box. On a draft, or a pending Clone, the thread is brought into view and the tag goes in the composer inside the tap. On a
 *    PUBLISHED version with nothing being edited it writes nothing: it runs the same `clone()` decision as the Clone button (none: pending; same base: opens
 *    that draft; another base with a message: the J4 sheet; untouched: pending), and the tag waits on the bus until the thread it was meant for is on screen
 *    (a pending Clone's or the open draft's, never the other base's draft while the sheet is up). Dismissing the sheet drops it (the caller clears the bus).
 *  - `showBox(tag)`: a reply chip. Below 1280 it switches to Canvas; the box scrolls to the middle and rings for two seconds.
 * Both flip the switcher below 1280 and open a closed panel from 1280, with focus inside the call (use-workspace-panel's `showThread`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { highlightBox } from '@/app/components/canvas/canvas-box-highlight';
import { isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import type { WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';
import { createComposerTagBus } from '@/app/pages/chat/composer-tag-bus';
import type { ClonePending } from './use-clone-canvas';

export function useAddToChat(
  /** The page's read for the version in the address; null while it loads. */
  ready: CanvasReady | null,
  /** The viewer is the canvas's owner with the owner's header: only then are Add to chat and the chips offered. */
  owner: boolean,
  /** The Clone state: its decision (null: the viewer cannot clone here, so cannot add to chat either), whether one is pending, and closing the J4 sheet with no answer. */
  cloneState: { clone: (() => void) | null; pending: ClonePending | null; dismissSheet: () => void },
  panel: { showThread: () => void; setView: (v: WorkspaceView) => void; setPanelOpen: (open: boolean) => void },
) {
  const { clone, dismissSheet } = cloneState;
  const pending = !!cloneState.pending;
  const { showThread, setView, setPanelOpen } = panel;
  // "The thread the tags were meant for is on screen": a pending Clone's, or the draft's. A published view with only another base's draft behind it is neither.
  const landed = !!ready && (pending || isViewingDraft(ready));
  const now = useRef({ landed, ready, clone, pending, setView, setPanelOpen });
  now.current = { landed, ready, clone, pending, setView, setPanelOpen };
  const bus = useMemo(() => {
    const b = createComposerTagBus();
    // A tag that lands without a tap to show it (the draft opened, the sheet's answer taken) brings the thread into view.
    b.configure(() => now.current.landed, () => { now.current.setView('chat'); now.current.setPanelOpen(true); });
    return b;
  }, []);
  // Whatever waited (the draft opened, the sheet's answer taken) is taken once the thread it was meant for is the one on screen.
  useEffect(() => bus.flush(false), [bus, landed]);

  // A tap before the page's first read lands (the boxes draw while it loads) waits for it: whether the version is published or a draft decides what the tap does.
  const [early, setEarly] = useState(false);
  const decide = useCallback((sync: boolean) => {
    const { ready: r, clone: cloneNow, pending: isPending } = now.current;
    const published = !!r && !isViewingDraft(r) && !r.publishedNone;
    if (published && !isPending && cloneNow) return cloneNow();
    // a draft or a pending Clone: bring the thread into view, then the tag goes in (inside this same tap when there is one)
    if (sync) showThread();
    else {
      now.current.setView('chat');
      now.current.setPanelOpen(true);
    }
    bus.flush(sync);
  }, [bus, showThread]);
  const addToChat = useCallback((tag: string) => {
    bus.hold(tag);
    if (now.current.ready) decide(true);
    else setEarly(true);
  }, [bus, decide]);
  const loaded = !!ready;
  useEffect(() => {
    if (!early || !loaded) return;
    setEarly(false);
    decide(false);
  }, [early, loaded, decide]);

  const showBox = useCallback((tag: string) => {
    flushSync(() => now.current.setView('canvas'));
    highlightBox(tag);
  }, []);
  /** The sheet closed with no answer: the tag it was asked for is dropped with it. */
  const dismiss = useCallback(() => { bus.clear(); dismissSheet(); }, [bus, dismissSheet]);
  const tap = useMemo(() => ({ addToChat: owner && clone ? addToChat : null, showBox: owner ? showBox : null }), [owner, clone, addToChat, showBox]);
  return { bus, tap, dismissSheet: dismiss };
}
