/**
 * P955 gate fixture (P1536): a canvas thread as the owner sees it, built from the REAL parts the thread panel uses: the
 * header (title per kind, the "…" menu), the base version card of an update, the opener, the owner's rows, the mirror's
 * reply, the draft card at the end, the tray (rows, create action, progress, published line) above the composer with
 * its paperclip and Upload. PERMANENT RENDER SUBSTRATE, never pruned. Obviously fake data only.
 * ?phase=empty | reading | upload-failed | ready | links | running | drafted | revising | failed | failed-no-items | failed-nothing-drafted |
 *         published | asked | discarded | update-empty | update | update-running | update-drafted | update-revising
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { CanvasDraftEnd, CanvasThreadBar, type BarProps } from '@/app/pages/chat/canvas-thread';
import { CanvasThreadOpener } from '@/app/pages/chat/CanvasOpener';
import { CanvasDraftMenu, CanvasThreadTitle } from '@/app/pages/chat/CanvasThreadHeader';
import { CanvasUploadButton } from '@/app/pages/chat/CanvasUploadButton';
import { CanvasVersionCard } from '@/app/pages/chat/CanvasVersionCard';
import { MirrorMark } from '@/app/pages/chat/chat-kit';
import { Composer } from '@/app/pages/chat/Composer';
import { ThreadHeader } from '@/app/pages/chat/ThreadHeader';
import { canDiscardDraft, openerIsPrimary, type CanvasItemRow } from '@/app/pages/chat/canvas-items';

const NOW = '2000-01-01T00:00:00.000Z';
const draft = { id: 'draft-id-1234', versionId: 'version-id-1234', canvasId: 'canvas-id-1234', baseVersionId: null, conversationId: 'conversation-id-1234', threadRootId: 'thread-root-id-1234', state: 'open', runCount: 0, closedAt: null, canvasName: null, versionName: null } as const;
const updateDraft = { ...draft, baseVersionId: 'version-id-0001', canvasName: 'example_canvas', versionName: 'example_canvas_d1a2b3' } as const;
const run = { id: 'run-id-1234', kind: 'draft', state: 'running', errorCode: null, createdAt: NOW, startedAt: NOW } as const;
const BASE_CARD: CanvasVersionCardData = { title: 'Example canvas', label: 'v2 · Jan 1, 2000', draft: false, href: '/p/example-user/canvas/example_canvas?v=example_v2' };

const FILE: CanvasItemRow = { key: 'f1', kind: 'file', label: 'example-offer.pdf', status: 'read' };
const NOTES: CanvasItemRow = { key: 'notes', kind: 'notes', label: '2 notes', status: 'pending' };
const LINK: CanvasItemRow = { key: 'l1', kind: 'link', label: 'example.com', status: 'pending' };
const ITEMS = [FILE, LINK, NOTES];

const BASE: BarProps = {
  draft, run: null, running: false, items: [], newInput: false, askedAfterPublish: false, busy: null, notice: null,
  onRun: () => undefined, onPublish: () => undefined, onStartNew: () => undefined,
};

const DONE = { nextSeq: 1, draft: { ...draft, runCount: 1, canvasName: 'example_canvas' }, viewDraftPath: '/tree/_gate/canvas-thread?phase=drafted' };
const UPDATE_DONE = { nextSeq: 3, draft: { ...updateDraft, runCount: 1 }, viewDraftPath: '/tree/_gate/canvas-thread?phase=update-drafted' };

const PHASES: Record<string, Partial<BarProps>> = {
  empty: {},
  reading: { items: [{ key: 'u1', kind: 'file', label: 'example-deck.pdf', status: 'reading' }] },
  'upload-failed': { items: [{ key: 'u2', kind: 'file', label: 'example-scan.pdf', status: 'failed', reason: 'no text found in it' }] },
  ready: { items: ITEMS },
  links: { items: [FILE, { ...LINK, status: 'read' }, { key: 'l2', kind: 'link', label: 'example.org', status: 'failed', reason: 'the page did not open' }, NOTES], run: { ...run, state: 'done' } },
  running: { items: ITEMS, running: true, run: { ...run } },
  drafted: { items: ITEMS, ...DONE },
  revising: { items: ITEMS, newInput: true, ...DONE },
  failed: { items: ITEMS, run: { ...run, state: 'failed' } },
  'failed-no-items': { draft: { ...draft, runCount: 1 }, run: { ...run, state: 'failed' }, draftHasPoints: false },
  'failed-nothing-drafted': { items: ITEMS, draft: { ...draft, runCount: 1 }, run: { ...run, state: 'failed' }, draftHasPoints: false },
  published: { draft: { ...draft, state: 'published', runCount: 1 } },
  asked: { draft: { ...draft, state: 'published', runCount: 1 }, askedAfterPublish: true },
  discarded: { draft: { ...draft, state: 'discarded' } },
  'update-empty': { draft: updateDraft },
  update: { items: ITEMS, draft: updateDraft },
  'update-running': { items: ITEMS, draft: updateDraft, running: true, run: { ...run } },
  'update-drafted': { items: ITEMS, ...UPDATE_DONE },
  'update-revising': { items: ITEMS, newInput: true, ...UPDATE_DONE },
};

/** The phases in which a canvas was made, so the mirror's reply is in the thread above the draft card. */
const MADE = ['drafted', 'revising', 'update-drafted', 'update-revising'];

/** One row with the real message row's geometry: 8px margin, 8px padding, a 36px avatar column and a 10px gap, so its text starts where the draft card does. */
function FakeRow({ who, compact = false, testId = 'gate-row', children }: { who: 'owner' | 'mirror'; compact?: boolean; testId?: string; children: ReactNode }) {
  return (
    <div className={`mx-2 flex gap-2.5 px-2 ${compact ? 'py-0.5' : 'pb-1.5 pt-2.5'}`} data-testid={testId}>
      <div className="w-9 shrink-0">
        {!compact && (who === 'mirror' ? <MirrorMark size="md" /> : <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-700">E</span>)}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && <p className="text-[15px] font-semibold leading-6 text-foreground">{who === 'mirror' ? 'Mirror' : 'Example Owner'}</p>}
        <div className="text-[15px] leading-[22px] text-foreground">{children}</div>
      </div>
    </div>
  );
}

/** A few rows so the page reads as a thread: the owner's own words, then (once a canvas is made) the mirror's reply. */
function FakeMessages({ phase, items }: { phase: string; items: number }) {
  if (items === 0) return null;
  return (
    <div>
      <FakeRow who="owner">I run a small bookkeeping service for cafe owners.</FakeRow>
      <FakeRow who="owner" compact>Here is my site: https://example.com</FakeRow>
      {MADE.includes(phase) && <FakeRow who="mirror">Your canvas is drafted. Look it over, then publish it.</FakeRow>}
    </div>
  );
}

export function GateFixture() {
  const [params] = useSearchParams();
  const requested = params.get('phase') ?? 'empty';
  const phase = requested in PHASES ? requested : 'empty';
  // The real composer reports whether Send shows, and the real parts step their action back to an outline while it does.
  const [composing, setComposing] = useState(false);
  const bar: BarProps = { ...BASE, ...PHASES[phase], composing };
  const update = bar.draft.baseVersionId !== null;
  // Like the real list, the thread sits on its latest message (and stays there as the tray under it changes).
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [phase, composing]);
  return (
    <div className="mx-auto flex h-[calc(100dvh-5rem)] max-w-md flex-col border-x bg-background">
      <nav className="flex shrink-0 flex-wrap gap-2 border-b p-2 text-xs">
        {Object.keys(PHASES).map((p) => (
          <a key={p} href={`/tree/_gate/canvas-thread?phase=${p}`} className="underline">
            {p}
          </a>
        ))}
      </nav>
      <ThreadHeader onClose={() => undefined} menu={canDiscardDraft(bar) ? <CanvasDraftMenu onDiscard={() => undefined} /> : undefined}>
        <CanvasThreadTitle draft={bar.draft} ownerSlug="example-user" />
      </ThreadHeader>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {update && (
          <FakeRow who="owner" testId="gate-base-card">
            <CanvasVersionCard data={BASE_CARD} />
          </FakeRow>
        )}
        <CanvasThreadOpener title={null} primary={openerIsPrimary(bar, composing)} />
        <FakeMessages phase={phase} items={bar.items.length} />
        <CanvasDraftEnd {...bar} />
      </div>
      <CanvasThreadBar {...bar} />
      <Composer
        draftKey="gate-canvas-thread"
        placeholder="Reply in thread"
        onSend={() => undefined}
        onAttach={() => undefined}
        onSendableChange={setComposing}
        leading={<CanvasUploadButton busy={phase === 'reading'} onPick={() => undefined} />}
      />
    </div>
  );
}

export default GateFixture;
