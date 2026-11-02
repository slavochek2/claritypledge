/**
 * P955 gate fixture (P1536): the canvas page's header (Publish on a draft), draft note and boxes in each state a draft version can put the
 * page in. PERMANENT RENDER SUBSTRATE, never pruned. Obviously fake data only.
 * ?phase=draft | draft-empty | nothing-published-reader | nothing-published-owner | published-owner | published-reader
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CanvasCard } from '@/app/components/canvas/canvas-card';
import { CanvasGrid } from '@/app/components/canvas/canvas-grid';
import { CanvasHeader } from '@/app/components/canvas/canvas-header';
import { groupPointsByBox } from '@/lib/canvas-boxes';
import { hasNothingToShow, draftQuestions, isViewingDraft, type CanvasReady } from '@/app/components/canvas/canvas-page-data';
import { CanvasWorkspaceContext, type CanvasWorkspaceValue } from '@/app/components/canvas/canvas-workspace-context';
import { resetCanvasAvailability, seedCanvasAvailability } from '@/app/pages/chat/use-canvas-availability';
import type { PointWithUserPosition } from '@/app/types';

const NOW = '2000-01-01T00:00:00.000Z';
const POINT = {
  id: 'point-id-1234', statement: 'Example bet: owners of two cafes will pay for monthly books (fake data).', tags: [],
  systemTags: ['canvas:problem'], visibility: 'private', userPosition: undefined, totalPositions: 0, createdAt: NOW, updatedAt: NOW,
  positionCounts: { agree: 0, strongly_agree: 0, somewhat_agree: 0, unsure: 0, disagree: 0, strongly_disagree: 0, somewhat_disagree: 0 },
} as unknown as PointWithUserPosition;

const DRAFT = {
  id: 'draft-id-1234', version: 'canvas_dabc123', threadRootId: 'thread-root-id-1234', conversationId: 'conversation-id-1234',
  baseSeq: null, runCount: 1, revision: 1, changedBoxes: [] as string[],
  questions: { 'canvas:love': 'What do you keep doing even when it costs you? (fake question)', 'canvas:revenue': 'What does a customer pay, and for what? (fake question)' },
};
const DRAFT_VERSION = { name: 'canvas_dabc123', createdAt: NOW, seq: null, publishedAt: null, draft: true };
const V1 = { name: 'canvas_d111111', createdAt: NOW, seq: 1, publishedAt: NOW, draft: false };

const BASE: CanvasReady = {
  status: 'ready', ownerId: 'user-id-1234', ownerName: 'Test Owner',
  owner: { name: 'Test Owner', hasPledged: false },
  points: [POINT], stories: new Map(), positions: new Map(), visibility: 'private', isOwner: true, generalAccess: 'restricted',
  via: null, audience: [], addedStoryIds: [], version: 'canvas_d111111', versions: [V1], publishedNone: false, draft: null,
};

const PHASES: Record<string, Partial<CanvasReady>> = {
  draft: { version: DRAFT.version, versions: [DRAFT_VERSION], publishedNone: true, draft: DRAFT },
  'draft-empty': { points: [], version: DRAFT.version, versions: [DRAFT_VERSION], publishedNone: true, draft: { ...DRAFT, runCount: 0, questions: {} } },
  'nothing-published-reader': { points: [], isOwner: false, version: null, versions: [], publishedNone: true, via: { kind: 'person', id: 'user-id-5678', name: 'Test Owner', slug: null } },
  'nothing-published-owner': { points: [], version: null, versions: [], publishedNone: true },
  'published-owner': {},
  'published-reader': { isOwner: false, via: { kind: 'person', id: 'user-id-5678', name: 'Test Owner', slug: null } },
};

// Clone (W3) comes from the workspace around the page: a stand-in whose Clone does nothing, as the fixture never enters a workspace.
const WORKSPACE_STUB: CanvasWorkspaceValue = { active: false, reportReady: () => undefined, reloads: 0, showThread: () => undefined, clone: () => undefined, cloneSeq: null, ownerBar: false };

export function GateFixture() {
  const [params] = useSearchParams();
  // Canvas drafting is ON in this fixture only (so the owner's Clone pill renders); the answer is forgotten on leaving.
  useState(() => seedCanvasAvailability(true));
  useEffect(() => resetCanvasAvailability, []);
  const requested = params.get('phase') ?? 'draft';
  const phase = requested in PHASES ? requested : 'draft';
  const ready: CanvasReady = { ...BASE, ...PHASES[phase] };
  const boxes = groupPointsByBox(ready.points);
  return (
    <CanvasWorkspaceContext.Provider value={WORKSPACE_STUB}>
    <div className="flex flex-col px-4 pb-24 pt-3 lg:px-6 lg:pb-8">
      <nav style={{ display: 'flex', gap: '0.5rem', padding: '0.5rem', flexWrap: 'wrap' }}>
        {Object.keys(PHASES).map((p) => (
          <a key={p} href={`/tree/_gate/canvas-draft?phase=${p}`}>
            {p}
          </a>
        ))}
      </nav>
      <CanvasHeader
        ready={ready}
        failed={false}
        handle="test-owner"
        projectTag="canvas"
        ownerIsAgent={false}
        identityPending={false}
        compare={{ base: null, others: [], withPerson: null }}
        sharedLabel={null}
        onParams={() => undefined}
        onChanged={() => undefined}
      />
      {!hasNothingToShow(ready) && (
        <CanvasGrid
          boxes={boxes}
          questions={draftQuestions(ready)}
          onMore={() => undefined}
          renderCard={(point) => (
            <CanvasCard point={point} positions={isViewingDraft(ready) ? null : []} compare={null} selected={false} sharedLabel={null} onOpen={() => undefined} />
          )}
        />
      )}
    </div>
    </CanvasWorkspaceContext.Provider>
  );
}

export default GateFixture;
