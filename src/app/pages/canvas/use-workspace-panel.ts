/**
 * @file use-workspace-panel.ts
 * @description P1536 W1: the workspace's local view state. Below 1280px which of Canvas | Thread shows (a new canvas opens on Thread,
 * everything else on Canvas); from 1280px whether the panel is open (closing keeps the pane mounted: unsent text, scroll). Neither is in the
 * address. `showThread` brings the thread into view from a tap (Add to chat, a reply chip) and focuses the composer INSIDE the call, so a
 * phone's keyboard opens.
 */
import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import type { WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';

export function useWorkspacePanel(locationState: unknown): {
  view: WorkspaceView;
  setView: (v: WorkspaceView) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  showThread: () => void;
} {
  const [view, setView] = useState<WorkspaceView>(() => ((locationState as { tab?: unknown } | null)?.tab === 'thread' ? 'chat' : 'canvas'));
  const [panelOpen, setPanelOpen] = useState(true);
  const showThread = useCallback(() => {
    flushSync(() => {
      setView('chat');
      setPanelOpen(true);
    });
    document.querySelector<HTMLElement>('[data-testid="workspace-chat-pane"] textarea, [data-testid="workspace-chat-pane"] [role="textbox"]')?.focus();
  }, []);
  return { view, setView, panelOpen, setPanelOpen, showThread };
}

/**
 * × on the panel: from 1280px it closes the panel; below, it returns to the canvas tab. In a pending Clone it cancels instead (W3): back to the published
 * view, nothing was written.
 */
export function useCloseThread(wide: boolean, cloning: boolean, cancelClone: () => void, setPanelOpen: (open: boolean) => void, setView: (v: WorkspaceView) => void): () => void {
  return useCallback(() => {
    if (cloning) cancelClone();
    else if (wide) setPanelOpen(false);
    else setView('canvas');
  }, [wide, cloning, cancelClone, setPanelOpen, setView]);
}
