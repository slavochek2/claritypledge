/**
 * @file canvas-with-thread.tsx
 * @description P1536 D4/W1: the canvas page's route element. The canvas is home; the thread is a panel. On the owner's own canvas, the
 * WORKSPACE (`?ws=1`) puts the canvas and the draft's thread on one screen while the owner is EDITING (a draft is open, or a Clone is
 * pending): the panel on the right from 1280px (closed with ×, reopened with the Thread button, the choice kept locally), one at a time
 * below (a `Canvas | Thread` switch, local state, never a history entry; both stay mounted). A published view with nothing being edited
 * has no marker, panel, Thread button or switcher. The marker is read by the shared bottom-nav predicate. The thread is the open
 * draft's: it comes from the page's own owner read (an old `thread=` address is rewritten to `ws=1`). Publish has its one spot in the
 * bar (canvas-publish-spot); after it the page REPLACEs to the new version without the marker and a toast says so.
 * W8: the owner's ONE header (canvas-owner-bar: name ✎, version, state, Share, Clone, the Publish spot) is drawn here, above the page, for a draft,
 * a pending Clone and a published view alike; the page keeps only Compare and its status lines. Anyone else gets the reader header in the page.
 * Clone (W3) is the entry into a pending edit: it writes nothing, adds ws=1 to the published view, and the first Send makes the draft
 * (use-clone-canvas); × cancels it. Access is by ownership: anyone else, or an owner with no mirror chat, gets the plain canvas page. The page keeps one position in
 * the tree either way, so entering the workspace does not remount it.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CanvasPublishSpot } from '@/app/components/canvas/canvas-publish-spot';
import { CanvasOwnerBar } from '@/app/components/canvas/canvas-owner-bar';
import { CanvasWorkspaceLayout } from '@/app/components/canvas/canvas-workspace-layout';
import { CANVAS_WORKSPACE_WIDE_QUERY, CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CanvasPage } from '@/app/pages/canvas-page';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';
import { workspaceBackTarget } from './canvas-workspace-back';
import { useWorkspaceAccess } from './use-workspace-access';
import { useWorkspaceMarker } from './use-workspace-marker';
import { CloneDraftSheet } from './clone-draft-sheet';
import { useCloneCanvas } from './use-clone-canvas';
import { useWorkspacePanel } from './use-workspace-panel';
import { useCanvasRename } from './use-canvas-rename';
import { useWorkspacePublish } from './use-workspace-publish';
import { useSettledRun } from './use-settled-run';
import { useFollowDraft } from './use-follow-draft';
import { useBareWorkspaceDraft } from './use-bare-workspace-draft';
import { WorkspaceChat } from './workspace-chat';

export function CanvasWithThread() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { handle, projectTag, mirror, resolved, eligible, active } = useWorkspaceAccess(params);

  // `held`: the last read that had content, FOR the owner+canvas it was read at. The chat keeps its thread through the page's reloads
  // (a version change, a re-read), so it is not remounted; but a read of another canvas never shows under this address.
  const identity = `${(handle ?? '').toLowerCase()}/${projectTag ?? ''}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [reported, setReported] = useState<{ ready: CanvasReady | null; forVersion: string | null; held: { ready: CanvasReady; identity: string } | null }>({ ready: null, forVersion: null, held: null });
  const held = reported.held && reported.held.identity === identity ? reported.held.ready : null;
  const { view, setView, panelOpen, setPanelOpen, showThread } = useWorkspacePanel(location.state);
  const [runActive, setRunActive] = useState(false);
  const [reloads, setReloads] = useState(0);
  // Below 1280px the chat takes focus only while it is the shown view.
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
  // W1: entering an edit (a draft shown, a Clone) brings the panel with it: it may have been closed on a draft before.
  const openPanel = useCallback(() => setPanelOpen(true), [setPanelOpen]);
  const openedDraft = useCallback((versionName: string) => {
    openPanel();
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('v', versionName);
      next.set(CANVAS_WORKSPACE_PARAM, '1');
      return next;
    }, { replace: true, state: location.state });
  }, [setParams, location.state, openPanel]);

  // The page's read counts for Clone only when it was made for the `?v=` now in the address.
  const freshReady = reported.forVersion === params.get('v') ? reported.ready : null;
  const clone = useCloneCanvas({ eligible, active, ready: freshReady, setParams, state: location.state, openDraft: openedDraft, reload: () => setReloads(n => n + 1), onEnter: openPanel });
  const pendingSeq = clone.pending ? clone.pending.seq : null;
  // §2: "Updating…" lasts until the page has read what the run changed (the run ends in the thread before the page re-reads its points).
  const spotRunActive = useSettledRun(runActive, reported.ready);
  const { closedDraftId, spot, publishing, publish } = useWorkspacePublish({ ready: reported.ready, runActive: spotRunActive, pendingClone: !!clone.pending, setParams, state: location.state });
  // W8: the owner's header is the bar above the page: for the signed-in owner of a canvas with a mirror chat from the first render (so nothing shifts when
  // the read lands), and for any owner once the page has read the canvas. Once the read HAS answered, it decides: a page that is not the viewer's own
  // never shows owner controls. Everyone else keeps the reader header in the page.
  const answered = reported.ready ?? held;
  const ownerBar = answered ? answered.isOwner : eligible;
  const threadShown = wide ? panelOpen : view === 'chat';
  const workspace = useMemo<CanvasWorkspaceValue>(() => ({ active, reportReady: (ready, forVersion) => setReported(prev => ({ ready, forVersion, held: ready ? { ready, identity: identityRef.current } : prev.held })), reloads, showThread, clone: clone.clone, cloneUnknown: !resolved, cloneSeq: pendingSeq, ownerBar }), [active, reloads, showThread, clone.clone, resolved, pendingSeq, ownerBar]);
  // The bar shows the last read FOR this canvas (`held`), so name, version and state do not blink away while the page re-reads another version.
  const rename = useCanvasRename(held, projectTag);
  const pickVersion = useCallback((version: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('v', version);
      next.delete('point');
      next.delete('box');
      return next;
    }, { state: location.state });
  }, [setParams, location.state]);
  useWorkspaceMarker({ eligible, resolved, params, setParams, state: location.state, reported, closedDraftId });
  // `?ws=1` with no version and a draft open IS the workspace on that draft (W0).
  useBareWorkspaceDraft({ eligible, params, reported, pendingClone: !!clone.pending, openDraft: openedDraft });
  // A pending Clone over another base's draft must not be dragged onto that draft by its own first Send.
  useFollowDraft(runActive, clone.pending ? null : reported.ready, openedDraft);

  const goBack = useCallback(() => {
    navigate(workspaceBackTarget({ state: location.state }));
  }, [navigate, location.state]);
  // × on the panel: from 1280px it closes the panel; below, it returns to the canvas tab.
  // In a pending Clone it cancels instead (W3): back to the published view, nothing was written.
  const { pending: cloning, cancel: cancelClone } = clone;
  const closeThread = useCallback(() => {
    if (cloning) cancelClone();
    else if (wide) setPanelOpen(false);
    else setView('canvas');
  }, [wide, cloning, cancelClone, setPanelOpen, setView]);

  return (
    <CanvasWorkspaceContext.Provider value={workspace}>
      <CanvasWorkspaceLayout
        active={active}
        view={view}
        panelOpen={panelOpen}
        bar={ownerBar ? (
          <CanvasOwnerBar
            ready={held} handle={handle} projectTag={projectTag} title={rename.title} canRename={rename.canRename} onRename={rename.save}
            onPick={pickVersion} onChanged={() => setReloads(n => n + 1)} onBack={goBack} active={active} view={view} onView={setView}
            panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)}
            spot={<CanvasPublishSpot state={spot} publishing={publishing} onPublish={publish} />}
          />
        ) : null}
        canvas={<CanvasPage />}
        chat={<WorkspaceChat mirror={active ? mirror : null} ready={held} projectTag={projectTag} canvasTitle={rename.title} focusable={threadShown} onClose={closeThread} onRunActive={setRunActive} onOpened={openedDraft} onReload={() => setReloads(n => n + 1)} cloning={clone.pending} onStale={() => void clone.onStale()} />}
      />
      <CloneDraftSheet sheet={clone.sheet} onAdd={clone.addToDraft} onStartOver={clone.startOver} onClose={clone.dismissSheet} />
    </CanvasWorkspaceContext.Provider>
  );
}
