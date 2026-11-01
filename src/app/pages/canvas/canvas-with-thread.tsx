/**
 * @file canvas-with-thread.tsx
 * @description P1536 D4/W1: the canvas page's route element. The canvas is home; the thread is a panel. On the owner's own canvas, the
 * WORKSPACE (`?ws=1`) puts the canvas and the draft's thread on one screen while the owner is EDITING (a draft is open, or a Clone is
 * pending): the panel on the right from 1280px (closed with ×, reopened with the Thread button, the choice kept locally), one at a time
 * below (a `Canvas | Thread` switch, local state, never a history entry; both stay mounted). A published view with nothing being edited
 * has no marker, panel, Thread button or switcher. The marker is read by the shared bottom-nav predicate. The thread is the open
 * draft's: it comes from the page's own owner read (an old `thread=` address is rewritten to `ws=1`). Publish has its one spot in the
 * bar (canvas-publish-spot); after it the page REPLACEs to the new version without the marker and a toast says so.
 * Access is by ownership: anyone else, or an owner with no mirror chat, gets the plain canvas page. The page keeps one position in
 * the tree either way, so entering the workspace does not remount it.
 */
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { useMediaQuery } from '@/app/pages/chat/chat-hooks';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth';
import { CanvasPublishSpot } from '@/app/components/canvas/canvas-publish-spot';
import { CanvasWorkspaceBar, CanvasWorkspaceLayout, type WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';
import { CANVAS_WORKSPACE_WIDE_QUERY, CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { useCanvasPublish } from '@/app/components/canvas/use-canvas-publish';
import { CanvasPage } from '@/app/pages/canvas-page';
import { ChatContext } from '@/app/pages/chat/chat-state';
import { normalizeProjectTag } from '@/lib/canvas-boxes';
import { CANVAS_WORKSPACE_PARAM } from '@/app/components/layout/bottom-nav-routes';
import { workspaceBackTarget } from './canvas-workspace-back';
import { useWorkspaceMarker } from './use-workspace-marker';
import { useFollowDraft } from './use-follow-draft';
import { WorkspaceChat } from './workspace-chat';

export function CanvasWithThread() {
  const { handle, projectTag: rawTag } = useParams<{ handle: string; projectTag: string }>();
  const projectTag = normalizeProjectTag(rawTag);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, sessionChecked, isLoading } = useAuth();
  const chat = useContext(ChatContext);
  const mirror = chat?.chats.find(c => c.kind === 'mirror') ?? null;
  // Eligibility is a fact once auth and the chat list have answered (a loading list is not "no mirror chat").
  const resolved = sessionChecked && !isLoading && (!chat || chat.status !== 'loading');
  const eligible = !!user?.slug && !!handle && handle.toLowerCase() === user.slug.toLowerCase() && !!mirror;
  const active = eligible && (params.get(CANVAS_WORKSPACE_PARAM) === '1' || params.has('thread'));

  // `held`: the last read that had content, FOR the owner+canvas it was read at. The chat keeps its thread through the page's reloads
  // (a version change, a re-read), so it is not remounted; but a read of another canvas never shows under this address.
  const identity = `${(handle ?? '').toLowerCase()}/${projectTag ?? ''}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const [reported, setReported] = useState<{ ready: CanvasReady | null; forVersion: string | null; held: { ready: CanvasReady; identity: string } | null }>({ ready: null, forVersion: null, held: null });
  const held = reported.held && reported.held.identity === identity ? reported.held.ready : null;
  // New canvas (and only it) opens on the Thread tab below 1280px; everything else opens on Canvas (W1).
  const [view, setView] = useState<WorkspaceView>(() => ((location.state as { tab?: unknown } | null)?.tab === 'thread' ? 'chat' : 'canvas'));
  // From 1280px: whether the panel is open. Local UI state, not in the address; closing keeps the pane mounted (unsent text, scroll).
  const [panelOpen, setPanelOpen] = useState(true);
  const [runActive, setRunActive] = useState(false);
  const [reloads, setReloads] = useState(0);
  // The draft just published from here: until the page has read again, the read on screen still shows it open.
  const [closedDraftId, setClosedDraftId] = useState<string | null>(null);
  // Below 1280px the chat takes focus only while it is the shown view.
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
  const showThread = useCallback(() => {
    flushSync(() => {
      setView('chat');
      setPanelOpen(true);
    });
    // Inside the tap handler's own call stack, so a phone's keyboard opens.
    document.querySelector<HTMLElement>('[data-testid="workspace-chat-pane"] textarea, [data-testid="workspace-chat-pane"] [role="textbox"]')?.focus();
  }, []);
  const workspace = useMemo<CanvasWorkspaceValue>(() => ({ active, reportReady: (ready, forVersion) => setReported(prev => ({ ready, forVersion, held: ready ? { ready, identity: identityRef.current } : prev.held })), reloads, showThread }), [active, reloads, showThread]);
  // After Publish: REPLACE to the new version (the draft's own version row is the one published), no marker, so the panel closes; the toast says it.
  const published = useCallback(({ seq, versionName }: { seq: number; versionName: string }) => {
    setClosedDraftId(reported.ready?.draft?.id ?? null);
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('v', versionName);
      next.delete(CANVAS_WORKSPACE_PARAM);
      next.delete('thread');
      return next;
    }, { replace: true, state: location.state });
    toast.success(`Published v${seq}.`);
  }, [reported.ready, setParams, location.state]);
  const { state: spot, publishing, publish } = useCanvasPublish(reported.ready, runActive, published);
  useWorkspaceMarker({ eligible, resolved, params, setParams, state: location.state, reported, closedDraftId });
  const openedDraft = useCallback((versionName: string) => {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('v', versionName);
      next.set(CANVAS_WORKSPACE_PARAM, '1');
      return next;
    }, { replace: true, state: location.state });
  }, [setParams, location.state]);

  useFollowDraft(runActive, reported.ready, openedDraft);

  const goBack = useCallback(() => {
    navigate(workspaceBackTarget({ state: location.state }));
  }, [navigate, location.state]);
  // × on the panel: from 1280px it closes the panel; below, it returns to the canvas tab.
  const closeThread = useCallback(() => {
    if (wide) setPanelOpen(false);
    else setView('canvas');
  }, [wide]);

  return (
    <CanvasWorkspaceContext.Provider value={workspace}>
      <CanvasWorkspaceLayout
        active={active}
        view={view}
        panelOpen={panelOpen}
        bar={<CanvasWorkspaceBar onBack={goBack} view={view} onView={setView} panelOpen={panelOpen} onOpenPanel={() => setPanelOpen(true)} spot={<CanvasPublishSpot state={spot} publishing={publishing} onPublish={publish} />} />}
        canvas={<CanvasPage />}
        chat={<WorkspaceChat mirror={active ? mirror : null} ready={held} projectTag={projectTag} focusable={(wide && panelOpen) || (!wide && view === 'chat')} onClose={closeThread} onRunActive={setRunActive} onOpened={openedDraft} onReload={() => setReloads(n => n + 1)} />}
      />
    </CanvasWorkspaceContext.Provider>
  );
}
