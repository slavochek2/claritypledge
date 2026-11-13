/**
 * @file canvas-with-thread.tsx
 * @description P1536 D4/W1: the canvas page's route element. The canvas is home; the thread is a panel. On the owner's own canvas, the
 * WORKSPACE (`?ws=1`) puts the canvas and the draft's thread on one screen while the owner is EDITING (a draft is open, or a Clone is
 * pending): the panel on the right from 1280px (closed with ×, reopened with the Thread button, the choice kept locally), one at a time
 * below (a `Canvas | Thread` switch, local state, never a history entry; both stay mounted). A published view with nothing being edited
 * has no marker, panel, Thread button or switcher. The marker is read by the shared bottom-nav predicate. The thread is the open
 * draft's: it comes from the page's own owner read (an old `thread=` address is rewritten to `ws=1`). Publish has its one spot in the
 * bar (canvas-publish-spot); after it the page REPLACEs to the new version without the marker and a toast says so.
 * W8, 3c X4: the owner's ONE header (canvas-owner-bar, whose every row is canvas-header-model's table: name ✎, version, the (Draft) tag, Clone, Thread, Cancel, Discard, and the spot: Share, Publish or a status) is drawn here, above the page, for a draft,
 * a pending Clone and a published view alike; the page keeps only Compare and its status lines. Anyone else gets the reader header in the page.
 * Clone (W3) is the entry into a pending edit: it writes nothing, adds ws=1 to the published view, and the first Send makes the draft
 * (use-clone-canvas); × cancels it. Access is by ownership: anyone else, or an owner with no mirror chat, gets the plain canvas page. The page keeps one position in
 * the tree either way, so entering the workspace does not remount it.
 */
import { CanvasWorkspaceLayout } from '@/app/components/canvas/canvas-workspace-layout';
import { CanvasPage } from '@/app/pages/canvas-page';
import { ownerBarBack } from './canvas-workspace-back';
import { CloneDraftSheet } from './clone-draft-sheet';
import { WorkspacePreparationBanner } from './PreparationBanner';
import { RoundReturnBar, RoundReturnLive } from './RoundReturnBar';
import { EventShareDialog } from './EventShareDialog';
import { WorkspaceChat } from './workspace-chat';
import { WorkspaceOwnerBar } from './workspace-owner-bar';
import { WorkspaceProviders } from './workspace-providers';
import { useCanvasWorkspacePage } from './use-canvas-workspace-page';

export function CanvasWithThread() {
  const w = useCanvasWorkspacePage();
  const { handle, projectTag, mirror, active, held, panel, clone, rename, ownerBar, backTo, table, navState, publishing, wide, bump } = w;
  const { view, setView, panelOpen } = panel;
  // G6: only the before-event preparation keeps its banner (its step line); a canvas opened from the table has none, its header row carries the back.
  const bannerTo = backTo;
  const ownBack = ownerBarBack({ banner: !!bannerTo, returnBar: !!w.roundBar, table });
  const { spot, publishing: isPublishing, publish, shareOffer } = publishing;
  return (
    <WorkspaceProviders value={w.workspace} bus={w.bus}>
      <RoundReturnLive bar={w.roundBar} />
      <CanvasWorkspaceLayout
        active={active}
        roundBar={w.roundBar ? <RoundReturnBar {...w.roundBar} /> : null}
        banner={bannerTo ? <WorkspacePreparationBanner to={bannerTo} state={navState} canvasKey={`${handle}/${projectTag}`} /> : null}
        view={view}
        panelOpen={panelOpen}
        bar={ownerBar ? (
          <WorkspaceOwnerBar
            ready={held} handle={handle} projectTag={projectTag} rename={rename} onPick={w.pickVersion} onChanged={bump} onBack={ownBack.kind === 'banner' || ownBack.kind === 'returnBar' ? undefined : ownBack.kind === 'table' ? () => w.navigate(ownBack.to) : w.goBack}
            active={active} view={view} onView={setView} panelOpen={panelOpen} onOpenPanel={w.openPanel} spot={{ state: spot, publishing: isPublishing, onPublish: publish }}
            onCancelClone={clone.cancel} onGoToDraft={w.openExistingDraft}
          />
        ) : null}
        canvas={<CanvasPage />}
        chat={<WorkspaceChat mirror={active ? mirror : null} ready={held} projectTag={projectTag} canvasTitle={rename.title} focusable={wide ? panelOpen : view === 'chat'} onClose={w.closeThread} onRunActive={w.setRunActive} onDraftRead={w.spotRun.onDraftRead} onThreadAnswered={w.spotRun.onThreadAnswered} onOpened={w.openedDraft} onReload={bump} cloning={clone.pending} onStale={() => void clone.onStale()} />}
      />
      <EventShareDialog open={!!shareOffer.offer} busy={shareOffer.busy} error={shareOffer.error} onShare={() => void shareOffer.share()} onNotNow={shareOffer.notNow} />
      <CloneDraftSheet sheet={clone.sheet} onAdd={clone.addToDraft} onStartOver={clone.startOver} onClose={w.dismissSheet} />
    </WorkspaceProviders>
  );
}
