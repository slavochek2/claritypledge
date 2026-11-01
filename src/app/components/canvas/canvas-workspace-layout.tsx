/**
 * @file canvas-workspace-layout.tsx
 * @description P1536 D4: the workspace's frame. ONE box as tall as the screen under the shell's top bar (`sticky top-14`, 100dvh minus
 * 3.5rem), split into a bar (←, the Canvas | Chat switch below 1280px, the Publish spot: one fixed height at every width) and the
 * panes under it, which take exactly what is left (`flex-1 min-h-0`). Nothing is positioned from outside, so the panes start at the
 * bar's real bottom wherever the page above puts the box. From 1280px the panes sit side by side with a divider. Below, one shows at a
 * time: BOTH stay mounted and laid out, the other is `invisible`, `inert` and `aria-hidden` (no focus, no tab stop, no screen reader),
 * so scroll position, the caret and unsent text survive a switch (`display:none` would drop a scroller's position). Pure layout: the
 * real canvas and chat are handed in as nodes, so the P955 gate fixture renders this same frame around fake panes.
 */
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { cn } from '@/lib/utils';
import { CANVAS_WORKSPACE_WIDE_QUERY } from './canvas-workspace-context';

export type WorkspaceView = 'canvas' | 'chat';

/** The shell's top bar is 3.5rem: the workspace box is the rest of the screen. */
export const WORKSPACE_BOX = 'sticky top-14 flex h-[calc(100dvh-3.5rem)] flex-col';
/** One bar height at every width. */
export const WORKSPACE_BAR = 'flex h-12 shrink-0 items-center gap-1.5 border-b bg-background px-2 sm:px-3';

/** The two views as tabs (the project's Tabs primitive; both panes stay mounted, so there is no TabsContent). */
function ViewSwitch({ view, onView }: { view: WorkspaceView; onView: (v: WorkspaceView) => void }) {
  return (
    <Tabs value={view} onValueChange={v => onView(v === 'chat' ? 'chat' : 'canvas')} className="xl:hidden" data-testid="workspace-view-switch">
      <TabsList className="h-11 w-32 p-0.5">
        <TabsTrigger value="canvas" data-testid="workspace-view-canvas" className="h-10 min-h-10 flex-1 px-2">Canvas</TabsTrigger>
        <TabsTrigger value="chat" data-testid="workspace-view-chat" className="h-10 min-h-10 flex-1 px-2">Chat</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

export function CanvasWorkspaceBar({ onBack, view, onView, spot }: { onBack: () => void; view: WorkspaceView; onView: (v: WorkspaceView) => void; spot: ReactNode }) {
  return (
    <div className={WORKSPACE_BAR} data-testid="workspace-bar">
      <Button type="button" variant="ghost" className="h-11 w-10 shrink-0 p-0" aria-label="Go back" onClick={onBack} data-testid="workspace-back">
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Button>
      <ViewSwitch view={view} onView={onView} />
      <div className="ml-auto shrink-0">{spot}</div>
    </div>
  );
}

export function CanvasWorkspaceLayout({ active, bar, canvas, chat, view }: { active: boolean; bar: ReactNode; canvas: ReactNode; chat: ReactNode; view: WorkspaceView }) {
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
  // Below 1280px the panes are stacked in one box; the one not shown stays laid out (scroll kept) but cannot be reached.
  const stacked = 'max-xl:absolute max-xl:inset-0';
  const away = 'max-xl:invisible max-xl:pointer-events-none';
  const canvasAway = !wide && view === 'chat';
  const chatAway = !wide && view === 'canvas';
  // The same elements in the same places whether or not the workspace is on, so the canvas page is never remounted by it.
  return (
    <div className={active ? WORKSPACE_BOX : undefined} data-testid={active ? 'canvas-workspace' : undefined}>
      {active ? bar : null}
      <div className={active ? 'relative min-h-0 flex-1 xl:flex' : undefined}>
        <div
          className={active ? cn('h-full min-w-0 overflow-y-auto xl:flex-1', stacked, view === 'chat' && away) : undefined}
          data-testid={active ? 'workspace-canvas-pane' : undefined}
          data-active={active ? view === 'canvas' : undefined}
          inert={active && canvasAway ? true : undefined}
          aria-hidden={active && canvasAway ? true : undefined}
        >
          {canvas}
        </div>
        {active ? (
          <div
            className={cn('flex h-full min-w-0 flex-col xl:w-[440px] xl:flex-none xl:border-l', stacked, view === 'canvas' && away)}
            data-testid="workspace-chat-pane"
            data-active={view === 'chat'}
            inert={chatAway ? true : undefined}
            aria-hidden={chatAway ? true : undefined}
          >
            {chat}
          </div>
        ) : null}
      </div>
    </div>
  );
}
