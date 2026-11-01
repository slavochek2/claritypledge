/**
 * @file canvas-workspace-layout.tsx
 * @description P1536 D4/W1: the workspace's frame. ONE box as tall as the screen under the shell's top bar (`sticky top-14`, 100dvh minus
 * 3.5rem), split into the owner's bar (canvas-owner-bar: ←, name, version, state, Share, Clone, the Canvas | Thread switch below 1280px, the
 * Thread button from 1280px while the panel is closed, the Publish spot) and the
 * panes under it, which take exactly what is left (`flex-1 min-h-0`). Nothing is positioned from outside, so the panes start at the
 * bar's real bottom wherever the page above puts the box. From 1280px the panes sit side by side with a divider. Below, one shows at a
 * time: BOTH stay mounted and laid out, the other is `invisible`, `inert` and `aria-hidden` (no focus, no tab stop, no screen reader),
 * so scroll position, the caret and unsent text survive a switch (`display:none` would drop a scroller's position). From 1280px a
 * CLOSED panel (W1: closed with ×, reopened with the Thread button) is kept the same way: laid out at its full size, out of the flow,
 * invisible and inert. Pure layout: the real canvas and chat are handed in as nodes, so the P955 gate fixture renders this same frame
 * around fake panes.
 */
import type { ReactNode } from 'react';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { cn } from '@/lib/utils';
import { CANVAS_WORKSPACE_WIDE_QUERY } from './canvas-workspace-context';

export type WorkspaceView = 'canvas' | 'chat';

/** The shell's top bar is 3.5rem: the workspace box is the rest of the screen. */
export const WORKSPACE_BOX = 'sticky top-14 flex h-[calc(100dvh-3.5rem)] flex-col';

/** Which pane is out of reach, and the classes that keep the other one stacked or out of the flow. Pure, so the layout reads as markup. */
function panesOf(wide: boolean, view: WorkspaceView, panelOpen: boolean) {
  // Below 1280px the panes are stacked in one box; the one not shown stays laid out (scroll kept) but cannot be reached.
  const stacked = 'max-xl:absolute max-xl:inset-0';
  const away = 'max-xl:invisible max-xl:pointer-events-none';
  // A closed panel from 1280px keeps its size and place in the tree (scroll, caret, unsent text) but takes no room and cannot be reached.
  const closedWide = 'xl:absolute xl:inset-y-0 xl:right-0 xl:invisible xl:pointer-events-none';
  return {
    canvasAway: !wide && view === 'chat',
    chatAway: wide ? !panelOpen : view === 'canvas',
    canvasClass: cn('h-full min-w-0 overflow-y-auto xl:flex-1', stacked, view === 'chat' && away),
    chatClass: cn('flex h-full min-w-0 flex-col xl:w-[440px] xl:flex-none xl:border-l', stacked, view === 'canvas' && away, !panelOpen && closedWide),
  };
}

/**
 * `bar` is drawn whether or not the workspace is on (W8: the owner's header is the same bar on a published view): inside the box it is the box's first
 * child, outside it sits above the page and sticks under the shell's top bar. Null for anyone but the owner (they get the reader header in the page).
 */
export function CanvasWorkspaceLayout({ active, bar, canvas, chat, view, panelOpen = true }: { active: boolean; bar: ReactNode | null; canvas: ReactNode; chat: ReactNode; view: WorkspaceView; panelOpen?: boolean }) {
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
  const panes = panesOf(wide, view, panelOpen);
  // The same elements in the same places whether or not the workspace is on, so the canvas page is never remounted by it.
  return (
    <div className={active ? WORKSPACE_BOX : undefined} data-testid={active ? 'canvas-workspace' : undefined}>
      {bar}
      <div className={active ? 'relative min-h-0 flex-1 xl:flex' : undefined}>
        <div
          className={active ? panes.canvasClass : undefined}
          data-testid={active ? 'workspace-canvas-pane' : undefined}
          data-active={active ? view === 'canvas' : undefined}
          inert={active && panes.canvasAway ? true : undefined}
          aria-hidden={active && panes.canvasAway ? true : undefined}
        >
          {canvas}
        </div>
        {active ? (
          <div
            className={panes.chatClass}
            data-testid="workspace-chat-pane"
            data-active={view === 'chat'}
            inert={panes.chatAway ? true : undefined}
            aria-hidden={panes.chatAway ? true : undefined}
          >
            {chat}
          </div>
        ) : null}
      </div>
    </div>
  );
}
