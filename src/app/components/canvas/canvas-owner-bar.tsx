/**
 * @file canvas-owner-bar.tsx
 * @description P1536 W8: the owner's ONE canvas header, for a draft, a pending Clone and a published version alike. From 1280px, one line:
 * ← · name ✎ · [vN ▾] · state · Share · Clone (published) · Thread (panel closed; workspace only) · the Publish spot. Below 1280px, row 1: ←
 * · name ✎ (it truncates first) · [vN ▾] · state · the Publish spot; row 2: the Canvas | Thread switcher (workspace only) · Share ("Share" is
 * labelled down to 320px) · Clone. The Publish spot never moves or collapses (one fixed box in every state). No "Clarity Canvas" label.
 * Sticky under the shell's top bar. Inside the workspace box it is the box's first child (the panes take the rest); on a published view
 * with nothing being edited it sits above the page. Anyone but the owner gets the reader header (canvas-header) instead; this bar is
 * not drawn for them. Pure layout over the page's read: the real canvas and chat are not its business, so the P955 gate fixture renders it too.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canvasPath } from '@/lib/canvas-boxes';
import { cn } from '@/lib/utils';
import { CloneButton } from './canvas-clone-button';
import { CanvasNameEdit } from './canvas-name-edit';
import { isViewingDraft, type CanvasReady } from './canvas-page-data';
import { CANVAS_SECONDARY_PILL } from './canvas-pill-styles';
import { CanvasShareControl } from './canvas-share-control';
import { CanvasStateTag } from './canvas-state-tag';
import { CanvasVersionSlot } from './canvas-version-switcher';
import { useCanvasWorkspace } from './canvas-workspace-context';
import { STICKY_TOP, type WorkspaceView } from './canvas-workspace-layout';

/** The bar is two rows below 1280px (the second holds the switcher, Share and Clone) and one line from it. */
const BAR = 'z-30 flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b bg-background px-2 py-1 sm:px-3 xl:flex-nowrap';

/** The two views as tabs (the project's Tabs primitive; both panes stay mounted, so there is no TabsContent). The second is the thread. */
function ViewSwitch({ view, onView }: { view: WorkspaceView; onView: (v: WorkspaceView) => void }) {
  return (
    <Tabs value={view} onValueChange={v => onView(v === 'chat' ? 'chat' : 'canvas')} className="order-6 xl:hidden" data-testid="workspace-view-switch">
      <TabsList className="h-11 w-32 p-0.5">
        <TabsTrigger value="canvas" data-testid="workspace-view-canvas" className="h-10 min-h-10 flex-1 px-2">Canvas</TabsTrigger>
        <TabsTrigger value="chat" data-testid="workspace-view-chat" className="h-10 min-h-10 flex-1 px-2">Thread</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** From 1280px, while the panel is closed: the way back to it. */
function ThreadButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={cn(CANVAS_SECONDARY_PILL, 'hidden xl:inline-flex')} onClick={onOpen} data-testid="workspace-thread-button">
      <PanelRight className="h-4 w-4" aria-hidden />
      Thread
    </button>
  );
}

/** Share (the owner, once something is published) and Clone (a published version, only where the route hands Clone over). */
function BarActions({ ready, handle, projectTag, title, onChanged, panelOpen, onOpenPanel, active }: {
  ready: CanvasReady; handle: string | undefined; projectTag: string | null; title: string; onChanged: () => void;
  panelOpen: boolean; onOpenPanel?: () => void; active: boolean;
}) {
  const canShare = ready.isOwner && !!projectTag && !ready.publishedNone;
  const thread = active && !panelOpen && onOpenPanel ? <ThreadButton onOpen={onOpenPanel} /> : null;
  return (
    // Row 2 below 1280px has ONE height whether or not the switcher (44px) is on it: Share and Clone are 40px pills, so the row holds the switcher's height.
    <div className="order-7 ml-auto flex min-w-0 items-center gap-1.5 max-xl:min-h-11 xl:order-10" data-testid="canvas-bar-actions">
      {canShare && (
        <CanvasShareControl
          name={projectTag}
          displayTitle={title}
          visibility={ready.visibility}
          generalAccess={ready.generalAccess}
          link={`${window.location.origin}${canvasPath(handle ?? '', projectTag)}`}
          entries={ready.audience}
          onChanged={onChanged}
        />
      )}
      {!isViewingDraft(ready) && <CloneButton ready={ready} />}
      {thread}
    </div>
  );
}

export function CanvasOwnerBar({ ready, handle, projectTag, title, canRename, onRename, onPick, onChanged, onBack, active, view, onView, panelOpen = true, onOpenPanel, spot }: {
  /** null while the page is reading */
  ready: CanvasReady | null;
  handle: string | undefined;
  projectTag: string | null;
  /** The name shown (the owner's rename, else the name's canvasTitle) */
  title: string;
  canRename: boolean;
  onRename: (next: string) => void;
  /** a version was picked in the menu */
  onPick: (version: string) => void;
  /** a share, unshare or access change was confirmed: read the canvas again */
  onChanged: () => void;
  onBack: () => void;
  /** The workspace (`?ws=1`) is on: the switcher below 1280px and the Thread button from it exist. */
  active: boolean;
  view: WorkspaceView;
  onView: (v: WorkspaceView) => void;
  /** From 1280px: the thread panel is open. While it is closed the bar offers the Thread button. */
  panelOpen?: boolean;
  onOpenPanel?: () => void;
  spot: ReactNode;
}) {
  const { cloneSeq } = useCanvasWorkspace();
  const viewingDraft = !!ready && isViewingDraft(ready);
  return (
    <div className={cn(BAR, !active && STICKY_TOP)} data-testid="workspace-bar" data-owner-bar="">
      {/* Row 1 is its own non-wrapping row below 1280px (the Publish spot can never be pushed to a second line: W8), and dissolves into the one line from 1280px. It is the positioned parent of the rename input, which lies over it below 1280px (canvas-name-edit); below 640px the back button and the gap tighten. */}
      <div className="order-none flex min-w-0 basis-full items-center gap-x-1.5 max-xl:relative max-sm:gap-x-1 xl:contents" data-testid="workspace-bar-row1">
        <Button type="button" variant="ghost" className="order-none h-11 w-10 shrink-0 p-0 max-sm:w-8" aria-label="Go back" onClick={onBack} data-testid="workspace-back">
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </Button>
        {/* The name gives way first, but never below a few letters and an ellipsis (a lone letter is not a name). "Draft" never gives way (W4: the state is always named); a pending Clone's longer tag does. */}
        <div className="order-1 flex min-w-[4.5rem] max-[359px]:min-w-[2.75rem] flex-1 items-center sm:min-w-[6rem] xl:min-w-0 xl:max-w-[26rem] xl:flex-none" data-testid="canvas-name">
          {ready ? <CanvasNameEdit title={title} canEdit={canRename} onSave={onRename} /> : <Skeleton className="h-5 w-24" />}
        </div>
        {ready && <div className="order-2 flex shrink-0 items-center"><CanvasVersionSlot ready={ready} viewingDraft={viewingDraft} pendingSeq={cloneSeq} onPick={onPick} /></div>}
        {ready && <div className={cn('order-3 flex items-center', viewingDraft ? 'shrink-0' : 'min-w-0 shrink')}><CanvasStateTag ready={ready} cloneSeq={cloneSeq} /></div>}
        <div className="order-4 shrink-0 xl:order-last">{spot}</div>
      </div>
      {active && <ViewSwitch view={view} onView={onView} />}
      {ready && <BarActions ready={ready} handle={handle} projectTag={projectTag} title={title} onChanged={onChanged} panelOpen={panelOpen} onOpenPanel={onOpenPanel} active={active} />}
    </div>
  );
}
