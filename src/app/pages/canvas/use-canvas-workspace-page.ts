import { useCallback, useMemo, useState } from 'react';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CANVAS_WORKSPACE_WIDE_QUERY, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { useWorkspaceAccess } from './use-workspace-access';
import { useWorkspaceMarker } from './use-workspace-marker';
import { useCloneCanvas } from './use-clone-canvas';
import { useCloneIntent } from './use-clone-intent';
import { withoutCloneIntent } from '@/lib/canvas-hrefs';
import { useCloseThread, useWorkspacePanel } from './use-workspace-panel';
import { useCanvasRename } from './use-canvas-rename';
import { useWorkspacePublish } from './use-workspace-publish';
import { useSpotRun } from './use-canvas-catches-up';
import { useFollowDraft } from './use-follow-draft';
import { useBareWorkspaceDraft } from './use-bare-workspace-draft';
import { useWorkspaceNav } from './use-workspace-nav';
import { useReportedCanvas, useThreadOnPending } from './use-reported-canvas';
import { useAddToChat } from './use-add-to-chat';
import { useHandDraft } from '@/app/pages/chat/use-hand-draft';
import { scopedReady, useTableCanvasForViewer } from './use-table-canvas';

/** W8: once the canvas read has answered, it decides; before that, the signed-in owner of a canvas with a mirror chat gets the bar. */
function showsOwnerBar(answered: { isOwner: boolean } | null | undefined, eligible: boolean): boolean {
  return answered ? answered.isOwner : eligible;
}

type WorkspaceValueArgs = Pick<CanvasWorkspaceValue, 'active' | 'reportReady' | 'reloads' | 'showThread' | 'ownerBar' | 'tableCounterpart'> & {
  tap: ReturnType<typeof useAddToChat>['tap'];
  clone: ReturnType<typeof useCloneCanvas>;
  resolved: boolean;
  spotRunActive: boolean;
  tableBack: string | undefined;
  projectTag: Parameters<typeof useHandDraft>[1];
  openedDraft: Parameters<typeof useHandDraft>[2];
};

/** The workspace context value. Round 2: a pending Clone's first hand write makes the draft through the same opener, and the page moves to it as after the first message. */
function useWorkspaceValue(a: WorkspaceValueArgs): CanvasWorkspaceValue {
  const { active, reportReady, reloads, showThread, tap, clone, resolved, ownerBar, spotRunActive, tableBack, tableCounterpart, projectTag, openedDraft } = a;
  const ensureDraft = useHandDraft(clone.pending, projectTag, openedDraft);
  return useMemo<CanvasWorkspaceValue>(() => ({ active, reportReady, reloads, showThread, ...tap, clone: clone.clone, cloneUnknown: !resolved, cloneSeq: clone.pending?.seq ?? null, cloning: !!clone.pending, ownerBar, runActive: spotRunActive, tableBack, tableCounterpart, ensureDraft }), [ensureDraft, tableCounterpart, active, reportReady, reloads, showThread, tap, clone.clone, resolved, clone.pending, ownerBar, spotRunActive, tableBack]);
}

/** Access, the page's own read, the panel, navigation and the Clone: everything the later hooks and the render build on. */
function useWorkspaceBase() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const access = useWorkspaceAccess(params);
  const { handle, projectTag, resolved, workspace: workspaceOk, active } = access;
  const { reported, held, reportReady } = useReportedCanvas(handle, projectTag);
  // 3c X3: every hook below writes navigation state; none of them may write a Clone intent back once it is consumed (use-clone-intent).
  const navState = withoutCloneIntent(location.state);
  const panel = useWorkspacePanel(location.state);
  const { setView, setPanelOpen } = panel;
  const [runActive, setRunActive] = useState(false);
  const [reloads, setReloads] = useState(0);
  // Below 1280px the chat takes focus only while it is the shown view.
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
  // W1: entering an edit (a draft shown, a Clone) brings the panel with it: it may have been closed on a draft before.
  const openPanel = useCallback(() => setPanelOpen(true), [setPanelOpen]);
  const nav = useWorkspaceNav({ setParams, state: navState, openPanel, setView, navigate, isDraft: v => !!held?.versions.some(x => x.name === v && x.draft) });
  // The page's read counts for Clone only when it was made for the `?v=` now in the address.
  const freshReady = reported.forVersion === params.get('v') ? reported.ready : null;
  const clone = useCloneCanvas({ eligible: workspaceOk, active, ready: freshReady, setParams, state: navState, openDraft: nav.openExistingDraft, reload: () => setReloads(n => n + 1), onEnter: openPanel });
  useCloneIntent({ state: location.state, resolved, ready: freshReady, clone: clone.clone, setParams });
  // 3c X13: a pending Clone (the Clone tap, a reload of its address, Start over from the J4 sheet, Add to chat) opens on Thread, because typing is next.
  useThreadOnPending(clone.pending?.version ?? null, setView);
  const spotRun = useSpotRun(runActive, reported.ready, active);
  const bump = useCallback(() => setReloads(n => n + 1), []);
  return { params, setParams, navigate, access, reported, held, reportReady, navState, panel, runActive, setRunActive, reloads, bump, wide, openPanel, nav, clone, spotRun };
}

/** Everything the canvas route element renders from: the base, the owner's bar, publish, Add to chat, rename and the effects that keep the address in step. */
export function useCanvasWorkspacePage() {
  const b = useWorkspaceBase();
  const { params, setParams, navigate, access, reported, held, reportReady, navState, panel, runActive, reloads, wide, openPanel, nav, clone, spotRun } = b;
  const { projectTag, resolved, eligible, workspace: workspaceOk, active } = access;
  const { spotRunActive, threadUnknown } = spotRun;
  // P1529: only the owner is preparing this canvas, so the banner and the jump after Publish need ownerBar too (hence it is read before them).
  // W8: the owner's header is the bar above the page: for the signed-in owner of a canvas with a mirror chat from the first render (so nothing shifts when
  // the read lands), and for any owner once the page has read the canvas. Once the read HAS answered, it decides: a page that is not the viewer's own
  // never shows owner controls. Everyone else keeps the reader header in the page.
  const ownerBar = showsOwnerBar(reported.ready ?? held, eligible);
  // `returnTo` is the event preparation this canvas was started from; the banner says so and Publish returns there.
  const publishing = useWorkspacePublish({ ready: threadUnknown ? null : reported.ready, runActive: spotRunActive, pendingClone: !!clone.pending, setParams, state: navState, owner: ownerBar });
  const { closedDraftId, returnTo: backTo, table } = publishing;
  // S4: Add to chat (owner only: the tap exists only where Clone does) and the reply chips; the composer takes the tags from the bus.
  const add = useAddToChat(reported, held, params.get('v'), ownerBar, clone, panel, closedDraftId);
  // P1529: a canvas opened from the table opens in Compare with the table's counterpart, and follows the host's rounds back to the table.
  const { counterpart, roundBar } = useTableCanvasForViewer({ table, ready: scopedReady(reported.ready, held), editing: ownerBar && (active || !!held?.draft), params, setParams, canvasKey: `${access.handle}/${projectTag}`, state: navState });
  const workspace = useWorkspaceValue({ active, reportReady, reloads, showThread: panel.showThread, tap: add.tap, clone, resolved, ownerBar, spotRunActive, tableBack: !backTo ? table?.to : undefined, tableCounterpart: counterpart, projectTag, openedDraft: nav.openedDraft });
  // The bar shows the last read FOR this canvas (`held`), so name, version and state do not blink away while the page re-reads another version.
  const rename = useCanvasRename(held, projectTag);
  useWorkspaceMarker({ eligible: workspaceOk, resolved, params, setParams, state: navState, reported, closedDraftId });
  // `?ws=1` with no version and a draft open IS the workspace on that draft (W0).
  useBareWorkspaceDraft({ eligible: workspaceOk, params, reported, pendingClone: !!clone.pending, openDraft: nav.openExistingDraft });
  // A pending Clone over another base's draft must not be dragged onto that draft by its own first Send.
  useFollowDraft(runActive, clone.pending ? null : reported.ready, nav.openedDraft);
  const closeThread = useCloseThread(wide, !!clone.pending, clone.cancel, panel.setPanelOpen, panel.setView);
  return { ...b, ...access, roundBar, workspace, bus: add.bus, dismissSheet: add.dismissSheet, rename, ownerBar, publishing, closeThread, openPanel, backTo, table, goBack: nav.goBack, pickVersion: nav.pickVersion, openExistingDraft: nav.openExistingDraft, openedDraft: nav.openedDraft, navigate };
}
