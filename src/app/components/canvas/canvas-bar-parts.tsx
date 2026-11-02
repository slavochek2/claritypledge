/**
 * @file canvas-bar-parts.tsx
 * @description P1536 3c X4/X13: the pieces of the owner's bar (canvas-owner-bar), each drawing one thing the table (canvas-header-model) says: row 1 (← · name ✎ · [vN ▾] · tag),
 * the Canvas | Thread switcher, and the right side (the items, then the spot: the one fixed box that holds Share, Publish or a status).
 */
import type { ReactNode } from 'react';
import { ArrowLeft, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canvasPath } from '@/lib/canvas-boxes';
import { cn } from '@/lib/utils';
import { CanvasDraftTag } from './canvas-draft-tag';
import { CloneButton } from './canvas-clone-button';
import { GO_TO_DRAFT_LABEL, type HeaderItem, type HeaderRow } from './canvas-header-model';
import { CanvasNameEdit } from './canvas-name-edit';
import type { CanvasReady } from './canvas-page-data';
import { CANVAS_SECONDARY_PILL } from './canvas-pill-styles';
import { CanvasPublishSpot } from './canvas-publish-spot';
import { SPOT_BOX, type PublishSpotState } from './canvas-publish-spot-state';
import { CanvasShareControl } from './canvas-share-control';
import { CanvasVersionSlot } from './canvas-version-switcher';
import type { WorkspaceView } from './canvas-workspace-layout';

/** The two views as tabs (the project's Tabs primitive; both panes stay mounted, so there is no TabsContent). The second is the thread. X13: the active side wears the app's selected look (the blue outline and tint of the Artifacts filter pill), so the header keeps one filled button. */
export function ViewSwitch({ view, onView }: { view: WorkspaceView; onView: (v: WorkspaceView) => void }) {
  const side = 'h-10 min-h-10 flex-1 border border-transparent px-1 min-[360px]:px-1.5 data-[state=active]:border-blue-600 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 data-[state=active]:shadow-none';
  return (
    <Tabs value={view} onValueChange={v => onView(v === 'chat' ? 'chat' : 'canvas')} className="order-6 xl:hidden" data-testid="workspace-view-switch">
      <TabsList className="h-11 w-32 p-0.5 max-[359px]:w-[7.5rem]">
        <TabsTrigger value="canvas" data-testid="workspace-view-canvas" className={side}>Canvas</TabsTrigger>
        <TabsTrigger value="chat" data-testid="workspace-view-chat" className={side}>Thread</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

/** From 1280px, while the panel is closed: the way back to it. */
function ThreadButton({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className={CANVAS_SECONDARY_PILL} onClick={onOpen} data-testid="workspace-thread-button">
      <PanelRight className="h-4 w-4" aria-hidden />
      Thread
    </button>
  );
}

/** One fixed box in every state (the table's last item), so nothing beside it moves. Share fills it on a published version. */
function ShareSpot({ ready, handle, projectTag, title, onChanged }: { ready: CanvasReady; handle: string | undefined; projectTag: string | null; title: string; onChanged: () => void }) {
  return (
    <div className={SPOT_BOX} data-testid="publish-spot" data-state="share">
      {projectTag && !ready.publishedNone && (
        <CanvasShareControl
          main
          name={projectTag}
          displayTitle={title}
          visibility={ready.visibility}
          generalAccess={ready.generalAccess}
          link={`${window.location.origin}${canvasPath(handle ?? '', projectTag)}`}
          entries={ready.audience}
          onChanged={onChanged}
        />
      )}
    </div>
  );
}


/** Row 1: below 1280px its own non-wrapping row (the positioned parent of the rename input), from 1280px it dissolves into the one line. The tag never gives way (X6); the name does. */
export function BarRow1({ ready, row, title, canRename, onRename, onPick, onBack, children }: {
  ready: CanvasReady | null; row: HeaderRow | null; title: string; canRename: boolean; onRename: (next: string) => void; onPick: (version: string) => void; onBack: () => void; children?: ReactNode;
}) {
  return (
    <div className="order-none flex min-w-0 basis-full items-center gap-x-1.5 max-xl:relative max-sm:gap-x-1 xl:contents" data-testid="workspace-bar-row1">
      <Button type="button" variant="ghost" className="order-none h-11 w-10 shrink-0 p-0 max-sm:w-8" aria-label="Go back" onClick={onBack} data-testid="workspace-back">
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Button>
      {/* The name gives way first, but never below a few letters and an ellipsis (a lone letter is not a name). */}
      <div className="order-1 flex min-w-[4.5rem] max-[359px]:min-w-[2.75rem] flex-1 items-center sm:min-w-[6rem] xl:min-w-0 xl:max-w-[26rem] xl:flex-none" data-testid="canvas-name">
        {ready ? <CanvasNameEdit title={title} canEdit={canRename} onSave={onRename} /> : <Skeleton className="h-5 w-24" />}
      </div>
      {ready && row && <div className="order-2 flex shrink-0 items-center"><CanvasVersionSlot ready={ready} show={row.picker} onPick={onPick} /></div>}
      {row?.tag && (
        <div className="order-3 flex shrink-0 items-center" data-testid="canvas-state">
          <CanvasDraftTag>{row.tag === 'new-draft' ? 'New draft' : undefined}</CanvasDraftTag>
        </div>
      )}
      {children}
    </div>
  );
}

/** What each table item is, as a node: Clone and Thread are the bar's own, Cancel and Discard come from the route. */
export interface BarSlots { onOpenPanel?: () => void; onGoToDraft?: () => void; cancel?: ReactNode; discard?: ReactNode }

function itemNode(item: HeaderItem, ready: CanvasReady | null, slots: BarSlots): ReactNode {
  switch (item) {
    case 'clone': return ready && <CloneButton ready={ready} />;
    case 'thread': return slots.onOpenPanel && <ThreadButton onOpen={slots.onOpenPanel} />;
    case 'go-to-draft': return slots.onGoToDraft && (
      <button type="button" className={CANVAS_SECONDARY_PILL} onClick={slots.onGoToDraft} data-testid="workspace-go-to-draft-bar">{GO_TO_DRAFT_LABEL}</button>
    );
    case 'cancel': return slots.cancel;
    case 'discard': return slots.discard;
  }
}

/** The spot: Share on a published version, a skeleton while the page reads, nothing when the table says none, else Publish or the status. */
function BarSpot({ ready, row, handle, projectTag, title, onChanged, spotState, publishing, onPublish }: {
  ready: CanvasReady | null; row: HeaderRow | null; handle: string | undefined; projectTag: string | null; title: string; onChanged: () => void; spotState: PublishSpotState; publishing: boolean; onPublish: () => void;
}) {
  if (!ready) return <CanvasPublishSpot state={{ kind: 'loading' }} onPublish={onPublish} />;
  if (row?.spot === 'share') return <ShareSpot ready={ready} handle={handle} projectTag={projectTag} title={title} onChanged={onChanged} />;
  if (row?.spot === 'none') return null;
  return <CanvasPublishSpot state={spotState} publishing={publishing} onPublish={onPublish} />;
}

/** The right side, left to right: the table's items, then the spot (the last child: furthest right). Below 1280px, row 2 has ONE height whether or not the switcher is on it. */
export function BarActions({ oneRow, row, ready, slots, ...spot }: {
  oneRow: boolean; row: HeaderRow | null; ready: CanvasReady | null; slots: BarSlots;
  handle: string | undefined; projectTag: string | null; title: string; onChanged: () => void; spotState: PublishSpotState; publishing: boolean; onPublish: () => void;
}) {
  const items = (row?.items ?? []).map(item => <span key={item} className="flex shrink-0 items-center">{itemNode(item, ready, slots)}</span>);
  if (row?.spot === 'none') return null;
  return (
    <div className={cn('order-7 ml-auto flex min-w-0 items-center gap-1.5 xl:order-10', !oneRow && 'max-xl:min-h-11')} data-testid="canvas-bar-actions">
      {items}
      <BarSpot ready={ready} row={row} {...spot} />
    </div>
  );
}
