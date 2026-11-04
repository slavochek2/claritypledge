/**
 * P955 gate fixture (P1536 S3, S6.5, W7, W8, 3c X4): the canvas workspace's frame (the owner's bar with ←, name ✎, version, the (Draft) tag, the table's
 * items, the Canvas | Thread switch and the spot, the two panes) built from the REAL parts the route element uses: CanvasOwnerBar,
 * CanvasWorkspaceLayout, CanvasPublishSpot, CanvasHeader (the in-page rest of the header), CanvasGrid, CanvasCard, the opener and the real Composer. The canvas and the chat history are fake. A 3.5rem
 * strip stands in for the shell's top bar, so the frame sits where it sits in the app. PERMANENT RENDER SUBSTRATE, never pruned.
 * Obviously fake data only.
 * ?phase=canvas | chat-composing (opens on Chat, with text typed in) | busy | published (a published version picked from the open draft: Thread, Share)
 *   | nothing-to-publish (a draft with a base and no difference: the status in the spot) | published-header (a published view with nothing being
 *   edited: the owner's bar above the page, no workspace: Clone, Share) | panel-closed (the thread panel closed: Canvas on screen)
 *   | new-canvas (an empty new canvas on Thread: the opener's Copy prompt) | pending-clone (a Clone pending: (New draft), Cancel, the status)
 *   | j4-sheet (the J4 sheet over a published version with another draft open) | mixed-reply (a mixed pack's reply and its offer rows, J7 to J9, in the open draft's thread)
 *   | j10-reply (a published draft's thread in the chat's own panel: offer rows with Start, the closed line; no workspace, no composer). Those three come from ThreadStates.tsx.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasHeader } from '@/app/components/canvas/canvas-header';
import { CanvasOwnerBar } from '@/app/components/canvas/canvas-owner-bar';
import { CANVAS_SECONDARY_PILL } from '@/app/components/canvas/canvas-pill-styles';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { CanvasThreadOpener } from '@/app/pages/chat/CanvasOpener';
import type { CanvasPerson, CanvasReady } from '@/app/components/canvas/canvas-page-data';
import type { PublishSpotState } from '@/app/components/canvas/canvas-publish-spot-state';
import { CanvasWorkspaceLayout, type WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';
import { DiscardDraftButton } from '@/app/pages/canvas/discard-draft-button';
import { stashDraft } from '@/app/pages/chat/chat-hooks';
import { ClosedPublishedThread, J4Sheet, MixedReply } from './ThreadStates';
import { Composer } from '@/app/pages/chat/Composer';
import { resetCanvasAvailability, seedCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { groupPointsByBox } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';

const NOW = '2000-01-01T00:00:00.000Z';
// P1613: someone to compare with (obviously fake). The bar's table shows Compare only on a published version, so the draft and pending phases prove it absent.
const SAM: CanvasPerson = { id: 'gate-sam', name: 'Sam Example', hasPledged: false, count: 3 };

const point = (id: string, box: string, statement: string) => ({
  id, statement, tags: [], systemTags: [box], visibility: 'private', userPosition: undefined, totalPositions: 0, createdAt: NOW, updatedAt: NOW,
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
}) as unknown as PointWithUserPosition;

const POINTS = [
  point('point-id-1', 'canvas:problem', 'Example bet: owners of two cafes lose a day a month to their books (fake data).'),
  point('point-id-2', 'canvas:solution', 'Example bet: a monthly bookkeeping service for small cafes (fake data).'),
  point('point-id-3', 'canvas:revenue', 'Example bet: a cafe pays a fixed monthly fee (fake data).'),
];

type OnScreen = 'draft' | 'published' | 'pending';
type Screen = 'j4' | 'mixed' | 'closed' | null;
interface Phase { screen: Screen; spot: PublishSpotState; changed: string[] | undefined; view: WorkspaceView; typed: boolean; onScreen: OnScreen; active: boolean; panelOpen: boolean; empty: boolean; draftOpen: boolean; baseSeq: number | null }
const DRAFT: Phase = { screen: null, spot: { kind: 'publish' }, changed: ['canvas:problem'], view: 'canvas', typed: false, onScreen: 'draft', active: true, panelOpen: true, empty: false, draftOpen: true, baseSeq: 1 };
const PHASES: Record<string, Phase> = {
  canvas: DRAFT,
  'chat-composing': { ...DRAFT, view: 'chat', typed: true },
  busy: { ...DRAFT, spot: { kind: 'updating' } },
  published: { ...DRAFT, spot: { kind: 'nothing' }, changed: undefined, onScreen: 'published' },
  'nothing-to-publish': { ...DRAFT, spot: { kind: 'nothing' }, changed: [] },
  'published-header': { ...DRAFT, spot: { kind: 'nothing' }, changed: undefined, onScreen: 'published', active: false, draftOpen: false },
  'panel-closed': { ...DRAFT, panelOpen: false },
  'new-canvas': { ...DRAFT, spot: { kind: 'nothing' }, changed: [], view: 'chat', empty: true, baseSeq: null },
  'pending-clone': { ...DRAFT, spot: { kind: 'nothing' }, changed: undefined, view: 'chat', onScreen: 'pending', draftOpen: false },
  'j4-sheet': { ...DRAFT, screen: 'j4', spot: { kind: 'nothing' }, changed: undefined, onScreen: 'published', active: false },
  'mixed-reply': { ...DRAFT, screen: 'mixed', view: 'chat' },
  'j10-reply': { ...DRAFT, screen: 'closed' },
};

const V1 = { name: 'canvas_d111111', createdAt: NOW, seq: 1, publishedAt: NOW, draft: false };
const DRAFT_VERSION = { name: 'canvas_dabc123', createdAt: NOW, seq: null, publishedAt: null, draft: true };
const draftBlock = (baseSeq: number | null, changed: string[]) => ({ id: 'draft-id-1234', version: 'canvas_dabc123', threadRootId: 'thread-root-id-1234', conversationId: 'conversation-id-1234', baseSeq, runCount: 1, revision: 1, questions: {}, changedBoxes: changed });
const readyFor = (c: Phase): CanvasReady => ({
  status: 'ready', ownerId: 'user-id-1234', ownerName: 'Test Owner', owner: { name: 'Test Owner', hasPledged: false }, points: c.empty ? [] : POINTS, stories: new Map(), positions: new Map(),
  canvasId: 'canvas-id-1234', title: null,
  visibility: 'private', isOwner: true, generalAccess: 'restricted', via: null, audience: [], addedStoryIds: [], publishedNone: c.baseSeq === null && c.onScreen === 'draft',
  ...(c.onScreen === 'draft'
    ? { version: DRAFT_VERSION.name, versions: c.baseSeq === null ? [DRAFT_VERSION] : [DRAFT_VERSION, V1], draft: draftBlock(c.baseSeq, c.changed ?? []) }
    : { version: V1.name, versions: c.draftOpen ? [DRAFT_VERSION, V1] : [V1], draft: c.draftOpen ? draftBlock(1, ['canvas:problem']) : null }),
});

/** A thread's worth of fake messages, so the chat pane has a history above the real composer. */
function FakeThread() {
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm" data-testid="gate-thread">
      <p className="rounded-lg bg-muted p-2">I run a small bookkeeping service for cafe owners (fake data).</p>
      <p className="rounded-lg border p-2">Draft ready: 3 of 9 boxes (fake reply).</p>
    </div>
  );
}

function PhaseNav() {
  return (
    <nav className="flex h-14 flex-wrap items-center gap-2 border-b px-2 text-xs" data-testid="gate-shell-stand-in">
      {Object.keys(PHASES).map(p => (
        <a key={p} href={`/tree/_gate/canvas-workspace?phase=${p}`} className="underline">{p}</a>
      ))}
    </nav>
  );
}

export function GateFixture() {
  const [params] = useSearchParams();
  const requested = params.get('phase') ?? 'canvas';
  const phase = requested in PHASES ? requested : 'canvas';
  const config = PHASES[phase] ?? DRAFT;
  const draftKey = `gate-canvas-workspace-${phase}`;
  const [view, setView] = useState<WorkspaceView>(config.view);
  const [withId, setWithId] = useState<string | null>(null);
  // Canvas drafting is ON in this fixture only (the page's availability question); forgotten on leaving.
  useState(() => {
    seedCanvasAvailability(true);
    if (config.typed) stashDraft(draftKey, 'Make the problem sharper for cafes (fake text)');
  });
  useEffect(() => resetCanvasAvailability, []);
  const ready = readyFor(config);
  const boxes = groupPointsByBox(config.empty ? [] : POINTS);
  if (config.screen === 'closed') {
    return (
      <div className="mx-auto max-w-[1440px]">
        <PhaseNav />
        <ClosedPublishedThread />
      </div>
    );
  }
  // The route element's context, as the owner's page sees it: the bar is the header (ownerBar) and Clone is handed over. Copy prompt is the
  // secondary pill everywhere (3c X9), so the context carries nothing about it.
  const workspace: CanvasWorkspaceValue = {
    active: config.active, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: () => undefined, cloneSeq: config.onScreen === 'pending' ? 1 : null, ownerBar: true,
  };
  return (
    <CanvasWorkspaceContext.Provider value={workspace}>
      <div className="mx-auto max-w-[1440px]">
        <PhaseNav />
        <CanvasWorkspaceLayout
          active={config.active}
          view={view}
          panelOpen={config.panelOpen}
          bar={
            <CanvasOwnerBar
              ready={ready} handle="test-owner" projectTag="example_canvas" title="Example canvas" canRename onRename={() => undefined} onPick={() => undefined}
              onChanged={() => undefined} onBack={() => undefined} active={config.active} view={view} onView={setView} panelOpen={config.panelOpen}
              onOpenPanel={() => undefined} spotState={config.spot} onPublish={() => undefined} onGoToDraft={() => undefined}
              discard={<DiscardDraftButton ready={ready} ownerSlug="test-owner" canvasName="example_canvas" />}
              compare={{ base: { name: 'You', hasPledged: false }, others: [SAM], withPerson: withId ? SAM : null, onCompare: setWithId }}
              cancel={<button type="button" className={CANVAS_SECONDARY_PILL} data-testid="canvas-cancel-clone">Cancel</button>}
            />
          }
          canvas={
            <div className="px-4 pb-4 pt-3 lg:px-6">
              <CanvasHeader
                ready={ready}
                failed={false}
                handle="test-owner"
                projectTag="example_canvas"
                ownerIsAgent={false}
                identityPending={false}
                compare={{ base: null, others: [], withPerson: null }}
                sharedLabel={null}
                onParams={() => undefined}
                onChanged={() => undefined}
              />
              <CanvasGrid
                boxes={boxes}
                renderCard={p => <CanvasCard key={p.id} point={p} positions={null} compare={null} selected={false} sharedLabel={null} onOpen={() => undefined} />}
                onMore={() => undefined}
                changed={config.changed}
              />
            </div>
          }
          chat={
            <>
              {config.empty ? <div className="min-h-0 flex-1 overflow-y-auto"><CanvasThreadOpener title={null} /></div> : config.screen === 'mixed' ? <MixedReply /> : <FakeThread />}
              <Composer draftKey={draftKey} placeholder="Reply in thread" onSend={() => undefined} />
            </>
          }
        />
        {config.screen === 'j4' && <J4Sheet />}
      </div>
    </CanvasWorkspaceContext.Provider>
  );
}

export default GateFixture;
