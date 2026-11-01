/**
 * P955 gate fixture (P1536 S3, S6.5): the canvas workspace's frame (the bar with ←, the Canvas | Chat switch and the Publish spot, the
 * two panes) built from the REAL parts the route element uses: CanvasWorkspaceBar, CanvasWorkspaceLayout, CanvasPublishSpot,
 * CanvasHeader (title and byline), CanvasGrid, CanvasCard and the real Composer. The canvas and the chat history are fake. A 3.5rem
 * strip stands in for the shell's top bar, so the frame sits where it sits in the app. PERMANENT RENDER SUBSTRATE, never pruned.
 * Obviously fake data only.
 * ?phase=canvas | chat-composing (opens on Chat, with text typed in) | busy | published (no Changed marks) | no-changes (none either)
 * Not yet here (their screens are built by S4 and S5): the J4 sheet, the mixed reply and the J10 publish reply.
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasHeader } from '@/app/components/canvas/canvas-header';
import type { CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CanvasPublishSpot } from '@/app/components/canvas/canvas-publish-spot';
import type { PublishSpotState } from '@/app/components/canvas/canvas-publish-spot-state';
import { CanvasWorkspaceBar, CanvasWorkspaceLayout, type WorkspaceView } from '@/app/components/canvas/canvas-workspace-layout';
import { ChatContext, type ChatContextValue } from '@/app/pages/chat/chat-state';
import { stashDraft } from '@/app/pages/chat/chat-hooks';
import { Composer } from '@/app/pages/chat/Composer';
import { resetCanvasAvailability, seedCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import { groupPointsByBox } from '@/lib/canvas-boxes';
import type { PointWithUserPosition } from '@/app/types';

const NOW = '2000-01-01T00:00:00.000Z';
const point = (id: string, box: string, statement: string) => ({
  id, statement, tags: [], systemTags: [box], visibility: 'private', userPosition: undefined, totalPositions: 0, createdAt: NOW, updatedAt: NOW,
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
}) as unknown as PointWithUserPosition;

const POINTS = [
  point('point-id-1', 'canvas:problem', 'Example bet: owners of two cafes lose a day a month to their books (fake data).'),
  point('point-id-2', 'canvas:solution', 'Example bet: a monthly bookkeeping service for small cafes (fake data).'),
  point('point-id-3', 'canvas:revenue', 'Example bet: a cafe pays a fixed monthly fee (fake data).'),
];

interface Phase { spot: PublishSpotState; changed: string[] | undefined; view: WorkspaceView; typed: boolean; published: boolean }
const DRAFT = { spot: { kind: 'publish' } as PublishSpotState, changed: ['canvas:problem'], view: 'canvas' as WorkspaceView, typed: false, published: false };
const PHASES: Record<string, Phase> = {
  canvas: DRAFT,
  'chat-composing': { ...DRAFT, view: 'chat', typed: true },
  busy: { ...DRAFT, spot: { kind: 'updating' } },
  published: { ...DRAFT, spot: { kind: 'published', seq: 3 }, changed: undefined, published: true },
  'no-changes': { ...DRAFT, spot: { kind: 'no-changes' }, changed: [] },
};

const V1 = { name: 'canvas_d111111', createdAt: NOW, seq: 1, publishedAt: NOW, draft: false };
const DRAFT_VERSION = { name: 'canvas_dabc123', createdAt: NOW, seq: null, publishedAt: null, draft: true };
const DRAFT_BLOCK = { id: 'draft-id-1234', version: 'canvas_dabc123', threadRootId: 'thread-root-id-1234', conversationId: 'conversation-id-1234', baseSeq: 1, runCount: 1, revision: 1, questions: {}, changedBoxes: ['canvas:problem'] };
const readyFor = (published: boolean): CanvasReady => ({
  status: 'ready', ownerId: 'user-id-1234', ownerName: 'Test Owner', owner: { name: 'Test Owner', hasPledged: false }, points: POINTS, stories: new Map(), positions: new Map(),
  visibility: 'private', isOwner: true, generalAccess: 'restricted', via: null, audience: [], addedStoryIds: [], publishedNone: false,
  ...(published ? { version: V1.name, versions: [V1], draft: null } : { version: DRAFT_VERSION.name, versions: [DRAFT_VERSION, V1], draft: DRAFT_BLOCK }),
});
// The owner's "New version" pill needs the chat: a stand-in with nothing in it.
const CHAT_STUB = { refresh: async () => [] } as unknown as ChatContextValue;

/** A thread's worth of fake messages, so the chat pane has a history above the real composer. */
function FakeThread() {
  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 text-sm" data-testid="gate-thread">
      <p className="rounded-lg bg-muted p-2">I run a small bookkeeping service for cafe owners (fake data).</p>
      <p className="rounded-lg border p-2">Draft ready: 3 of 9 boxes (fake reply).</p>
    </div>
  );
}

export function GateFixture() {
  const [params] = useSearchParams();
  const requested = params.get('phase') ?? 'canvas';
  const phase = requested in PHASES ? requested : 'canvas';
  const config = PHASES[phase] ?? DRAFT;
  const draftKey = `gate-canvas-workspace-${phase}`;
  const [view, setView] = useState<WorkspaceView>(config.view);
  // Canvas drafting is ON in this fixture only (the owner's "New version" pill on a published canvas); forgotten on leaving.
  useState(() => {
    seedCanvasAvailability(true);
    if (config.typed) stashDraft(draftKey, 'Make the problem sharper for cafes (fake text)');
  });
  useEffect(() => resetCanvasAvailability, []);
  const ready = readyFor(config.published);
  const boxes = groupPointsByBox(POINTS);
  return (
    <ChatContext.Provider value={CHAT_STUB}>
      <div className="mx-auto max-w-[1440px]">
        <nav className="flex h-14 flex-wrap items-center gap-2 border-b px-2 text-xs" data-testid="gate-shell-stand-in">
          {Object.keys(PHASES).map(p => (
            <a key={p} href={`/tree/_gate/canvas-workspace?phase=${p}`} className="underline">{p}</a>
          ))}
        </nav>
        <CanvasWorkspaceLayout
          active
          view={view}
          bar={<CanvasWorkspaceBar onBack={() => undefined} view={view} onView={setView} spot={<CanvasPublishSpot state={config.spot} onPublish={() => undefined} />} />}
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
              <FakeThread />
              <Composer draftKey={draftKey} placeholder="Reply in thread" onSend={() => undefined} />
            </>
          }
        />
      </div>
    </ChatContext.Provider>
  );
}

export default GateFixture;
