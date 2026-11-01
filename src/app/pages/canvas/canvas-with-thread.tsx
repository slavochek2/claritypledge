/**
 * @file canvas-with-thread.tsx
 * @description P1536 D4: the canvas page's route element. On the owner's own canvas, the WORKSPACE puts the canvas and the draft's
 * chat on one screen: side by side from 1280px, one at a time below (a `Canvas | Chat` switch; both stay mounted). It is marked
 * `?ws=1` in the address (the shared bottom-nav predicate reads it), and an owner looking at their own draft version is always in
 * it. The chat is the open draft's thread: the draft comes from the page's own owner read, so no `thread=` param is needed
 * (an old address that carries one is rewritten to `ws=1`). Publish has its one spot in the bar (canvas-publish-spot).
 * Anyone else, or an owner with no mirror chat, gets the plain canvas page. The page keeps one position in the tree either way,
 * so entering the workspace does not remount it.
 */
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
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
  const [view, setView] = useState<WorkspaceView>('canvas');
  const [runActive, setRunActive] = useState(false);
  const [reloads, setReloads] = useState(0);
  const workspace = useMemo<CanvasWorkspaceValue>(() => ({ active, reportReady: (ready, forVersion) => setReported(prev => ({ ready, forVersion, held: ready ? { ready, identity: identityRef.current } : prev.held })), reloads }), [active, reloads]);
  const { state: spot, publishing, publish } = useCanvasPublish(reported.ready, runActive);
  useWorkspaceMarker({ eligible, resolved, params, setParams, state: location.state, reported });
  // Below 1280px the chat takes focus only while it is the shown view.
  const wide = useMediaQuery(CANVAS_WORKSPACE_WIDE_QUERY);
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
    navigate(workspaceBackTarget({ state: location.state, handle, projectTag, published: !!reported.ready && !reported.ready.publishedNone }));
  }, [navigate, location.state, handle, projectTag, reported.ready]);

  return (
    <CanvasWorkspaceContext.Provider value={workspace}>
      <CanvasWorkspaceLayout
        active={active}
        view={view}
        bar={<CanvasWorkspaceBar onBack={goBack} view={view} onView={setView} spot={<CanvasPublishSpot state={spot} publishing={publishing} onPublish={publish} />} />}
        canvas={<CanvasPage />}
        chat={<WorkspaceChat mirror={active ? mirror : null} ready={held} projectTag={projectTag} focusable={wide || view === 'chat'} onClose={() => setView('canvas')} onRunActive={setRunActive} onOpened={openedDraft} onReload={() => setReloads(n => n + 1)} />}
      />
    </CanvasWorkspaceContext.Provider>
  );
}
