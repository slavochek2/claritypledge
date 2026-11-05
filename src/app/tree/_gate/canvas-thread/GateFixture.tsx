/**
 * P955 gate fixture (P1536): a canvas draft's thread as the owner sees it inside the workspace's panel, built from the REAL parts the
 * thread panel uses: the header (title per kind), the base version card of an update, the opener, the owner's rows and the mirror's
 * reply above the composer with its paperclip and Upload. The old tray (Create canvas, Update draft, progress, the draft card, the
 * closed strip) and the header "…" menu are gone with W0: Send is the update, and status lives in the Publish spot.
 * PERMANENT RENDER SUBSTRATE, never pruned. Obviously fake data only.
 * ?phase=empty | messages | update-empty | update-messages
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CanvasVersionCardData } from '@/app/data/canvas-draft-service';
import { CanvasThreadOpener } from '@/app/pages/chat/CanvasOpener';
import { CanvasThreadTitle } from '@/app/pages/chat/CanvasThreadHeader';
import { CanvasUploadButton } from '@/app/pages/chat/CanvasUploadButton';
import { CanvasVersionCard } from '@/app/pages/chat/CanvasVersionCard';
import { MirrorMark } from '@/app/pages/chat/chat-kit';
import { Composer } from '@/app/pages/chat/Composer';
import { ThreadHeader } from '@/app/pages/chat/ThreadHeader';

const draft = { baseVersionId: null, canvasName: null } as const;
const updateDraft = { baseVersionId: 'version-id-0001', canvasName: 'example_canvas' } as const;
const BASE_CARD: CanvasVersionCardData = { title: 'Example canvas', label: 'v2 · Jan 1, 2000', state: 'published', draft: false, href: '/p/example-user/canvas/example_canvas?v=example_v2', openHref: '/p/example-user/canvas/example_canvas?v=example_v2' };

/** Which draft each phase is, and whether the owner has written yet. */
const EMPTY = { draft, messages: false };
const PHASES: Record<string, { draft: typeof draft | typeof updateDraft; messages: boolean }> = {
  empty: EMPTY,
  messages: { draft, messages: true },
  'update-empty': { draft: updateDraft, messages: false },
  'update-messages': { draft: updateDraft, messages: true },
};

/** One row with the real message row's geometry: 8px margin, 8px padding, a 36px avatar column and a 10px gap, so its text starts where the real rows' text does. */
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

/** A few rows so the page reads as a thread: the owner's own words, then the mirror's reply. */
function FakeMessages() {
  return (
    <div>
      <FakeRow who="owner">I run a small bookkeeping service for cafe owners.</FakeRow>
      <FakeRow who="owner" compact>Here is my site: https://example.com</FakeRow>
      <FakeRow who="mirror">Your canvas is drafted. Look it over, then publish it.</FakeRow>
    </div>
  );
}

export function GateFixture() {
  const [params] = useSearchParams();
  const requested = params.get('phase') ?? 'empty';
  const phase = requested in PHASES ? requested : 'empty';
  const { draft: shown, messages } = PHASES[phase] ?? EMPTY;
  const update = shown.baseVersionId !== null;
  // Like the real list, the thread sits on its latest message.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [phase]);
  return (
    <div className="mx-auto flex h-[calc(100dvh-5rem)] max-w-md flex-col border-x bg-background">
      <nav className="flex shrink-0 flex-wrap gap-2 border-b p-2 text-xs">
        {Object.keys(PHASES).map((p) => (
          <a key={p} href={`/tree/_gate/canvas-thread?phase=${p}`} className="underline">
            {p}
          </a>
        ))}
      </nav>
      <ThreadHeader onClose={() => undefined}>
        <CanvasThreadTitle draft={shown} ownerSlug="example-user" />
      </ThreadHeader>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {update && (
          <FakeRow who="owner" testId="gate-base-card">
            <CanvasVersionCard data={BASE_CARD} />
          </FakeRow>
        )}
        {/* The onboarding of a canvas with no base version only (a draft cloned from one opens with its base card and nothing else). */}
        {!update && <CanvasThreadOpener title={null} />}
        {messages && <FakeMessages />}
      </div>
      <Composer
        draftKey="gate-canvas-thread"
        placeholder="Reply, or upload a file"
        onSend={() => undefined}
        onAttach={() => undefined}
        leading={<CanvasUploadButton busy={false} onPick={() => undefined} />}
      />
    </div>
  );
}

export default GateFixture;
