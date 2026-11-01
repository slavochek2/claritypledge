/**
 * @file canvas-workspace-context.ts
 * @description P1536 D4: the owner's workspace (canvas and chat on one screen, `?ws=1`) tells the canvas page it is inside one,
 * and the page tells the workspace what it read (the Publish spot and the ← target depend on the owner's draft).
 */
import { createContext, useContext, useEffect, useRef } from 'react';
import type { CanvasReady } from './canvas-page-data';

/** The widths that hold canvas and chat side by side. At 1024px the shell's sidebar (248px) and the chat (440px) would leave the canvas about 330px. */
export const CANVAS_WORKSPACE_WIDE_QUERY = '(min-width: 1280px)';

export interface CanvasWorkspaceValue {
  /** The page is the left pane of a workspace: no Back of its own, no bottom-nav padding. */
  active: boolean;
  /** The page's latest read (null while loading or after an error), and the `?v=` it was read FOR (null: none named). */
  reportReady: (ready: CanvasReady | null, forVersion: string | null) => void;
  /** Rises when the chat asks the page to read again (its Retry); 0 until then. */
  reloads: number;
  /**
   * W1 (Add to chat, reply box-chips): bring the thread into view from a tap. Below 1280px it flips the switcher to Thread; from 1280px it
   * opens a closed panel; either way the composer takes focus INSIDE the call, so the tap handler that made it keeps iOS's keyboard.
   */
  showThread: () => void;
  /**
   * W3: Clone the version on screen. Null where the page is not the owner's workspace route (a reader's page, an owner with no mirror chat,
   * a gate fixture): then the page shows no Clone. Writes nothing; it only enters the pending state (ws=1, no draft).
   */
  clone: (() => void) | null;
  /** W3: the version number of the pending Clone ("New draft from v2"); null when nothing is pending. */
  cloneSeq: number | null;
}

const NONE: CanvasWorkspaceValue = { active: false, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: null, cloneSeq: null };

export const CanvasWorkspaceContext = createContext<CanvasWorkspaceValue>(NONE);

export const useCanvasWorkspace = (): CanvasWorkspaceValue => useContext(CanvasWorkspaceContext);

/** The canvas page hands its read to the workspace around it (a no-op outside one). */
export function useReportCanvasReady(ready: CanvasReady | null, forVersion: string | null): void {
  const { reportReady } = useContext(CanvasWorkspaceContext);
  useEffect(() => {
    reportReady(ready, forVersion);
  }, [ready, forVersion, reportReady]);
}

/** The page re-reads when the chat around it asks (a no-op outside a workspace, where `reloads` stays 0). */
export function useWorkspaceReload(refresh: () => void): void {
  const { reloads } = useContext(CanvasWorkspaceContext);
  // only a new ask re-reads: a page that mounts (or remounts) after a Retry does its own first read
  const seen = useRef(reloads);
  useEffect(() => {
    if (reloads === seen.current) return;
    seen.current = reloads;
    refresh();
  }, [reloads, refresh]);
}

/** The page's outer padding: the bottom nav's room is not needed inside the workspace (the bar and composer own the bottom). */
export const canvasPageClass = (inWorkspace: boolean): string =>
  inWorkspace ? 'flex flex-col px-4 pb-4 pt-3 lg:px-6' : 'flex flex-col px-4 pb-24 pt-3 lg:px-6 lg:pb-8';
