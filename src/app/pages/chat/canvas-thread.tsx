/**
 * @file canvas-thread.tsx
 * @description P1536: what a canvas thread adds to an ordinary mirror thread, as pure parts the thread panel (and the P955
 * gate fixture) render from one `BarProps`:
 *  - CanvasThreadBar: the TRAY above the composer. A separate sheet, not chat: what the owner added (icon + label rows)
 *    and the one action (Create canvas / Create new version, or Update draft once a canvas exists), which drafts straight away. Hidden while
 *    there is nothing to show. While a run goes it is only a spinner and "Creating your canvas…". Published and discarded
 *    drafts get a plain status line instead.
 *  - CanvasDraftEnd: the draft card at the end of the thread once a canvas is made (Open is its primary, unless Update draft is offered, then that is; Publish is always secondary). Publish lives only there.
 *
 *  - Nothing shows while canvas drafting is off or unknown, so a person is never offered what cannot run.
 *  - The create action shows only once something was added (a read file, a link or a note) and while no run is going, in
 *    which case the progress shows instead (P955: no disabled primary, no dead control). The run's state is read from the database.
 *  - After Publish the thread takes no more changes: the owner's next message gets "This version is published. Start a new
 *    version?" with a button that starts a new thread with this version attached and the owner's request carried over.
 *  - One primary button at a time: Create until a canvas is made, then Open (on the card), or Update draft while it is offered.
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CanvasDraft, CanvasDraftRun } from '@/app/data/canvas-draft-service';
import { InlineError } from './chat-kit';
import { CanvasCreateBar } from './CanvasCreateBar';
import { CanvasDraftCard } from './CanvasDraftCard';
import { CanvasMaterialList, SPINNER } from './CanvasMaterialList';
import { actionOffered, isDone, isReading, updateOffered, type CanvasItemRow } from './canvas-items';
import { DRAFT_ERROR_TEXT, NEW_VERSION_LABEL, PUBLISHED_QUESTION, RUN_PROGRESS } from './canvas-thread-copy';
import type { CanvasThreadStatus } from './use-canvas-thread';

export type Busy = 'run' | 'publish' | 'discard' | null;

export interface BarProps {
  draft: CanvasDraft;
  run: CanvasDraftRun | null;
  running: boolean;
  /** The rows: what the owner added and whether each piece could be read. */
  items: CanvasItemRow[];
  /** Something was added after the newest finished run (a finished canvas can then be updated before it is published). */
  newInput?: boolean;
  /** The owner wrote in the thread after it was published. */
  askedAfterPublish: boolean;
  /** The composer has text: Send is the one primary now, so the tray's own action steps back to an outline (P955). */
  composing?: boolean;
  /** A request of this bar's own is in flight. */
  busy: Busy;
  /** A sentence about what just happened that the owner should read. */
  notice: string | null;
  onRun: () => void;
  onPublish: () => void;
  onStartNew: () => void;
  /** False when the newest run failed and no draft run ever finished: nothing is drafted yet, so Publish is not offered. */
  draftHasPoints?: boolean;
  /** Where "Open" goes (the canvas page on the draft version, carrying this thread), when it is known. */
  viewDraftPath?: string | null;
  /** The number the next published version of this canvas gets (the draft card's "v3 · Draft"), or null when unknown. */
  nextSeq?: number | null;
}

// A sheet of its own, not a lid on the composer: rounded and bordered all round, with a gap above the input.
const SHEET = 'mx-2 mb-2 shrink-0 space-y-2 rounded-xl border bg-muted px-3 py-2.5 shadow-sm lg:mx-3';
const STRIP = 'shrink-0 space-y-2 border-t bg-background px-3 py-2';

function RunNote({ run, hasDraft }: { run: CanvasDraftRun; hasDraft: boolean }) {
  // Only what is true of every failure: the mirror's reply (when there is one) says why. Visual QA: "did not finish" beside the
  // reply's "could not draft" read as two accounts of one failure. A dead run or the item limit posts no reply. With a draft
  // already on screen a failed Update leaves it as it was, so "no draft" would be wrong there.
  if (run.state === 'failed') {
    return <p role="status" className="text-sm text-muted-foreground">{hasDraft ? 'Your draft was not changed. Try again.' : 'No draft was made. Try again.'}</p>;
  }
  if (run.state === 'capped') return <p role="status" className="text-sm text-muted-foreground">{DRAFT_ERROR_TEXT.CAPPED}</p>;
  return null;
}

/** What a run in progress says: a spinner and the step. Nothing else (the owner can always leave; it keeps going). */
function Progress({ busy, run, running }: { busy: Busy; run: CanvasDraftRun | null; running: boolean }) {
  const text = busy === 'publish' ? 'Publishing…' : busy === 'discard' ? 'Discarding…' : RUN_PROGRESS[run && running ? run.kind : 'draft'];
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-foreground" data-testid="canvas-progress">
      <Loader2 className={`h-4 w-4 shrink-0 ${SPINNER}`} aria-hidden="true" />
      {text}
    </div>
  );
}

/** What stands in for the tray while the first read is out, or failed. Nothing shows while canvas drafting is off. */
export function CanvasThreadReadState({ status, onRetry }: { status: CanvasThreadStatus; onRetry: () => void }) {
  if (status === 'loading') {
    return (
      // P1586: a section waits as a <Skeleton> in the tray's own footprint; the words are for screen readers only.
      <div role="status" aria-busy="true" className="shrink-0 border-t px-3 py-3" data-testid="canvas-loading">
        <Skeleton className="h-5 w-2/3" />
        <span className="sr-only">Loading your draft</span>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="shrink-0 border-t">
        <InlineError what="this draft" onRetry={onRetry} compact />
      </div>
    );
  }
  return null;
}

function Notice({ text }: { text: string }) {
  return (
    <p role="alert" className="text-sm text-muted-foreground" data-testid="canvas-notice">
      {text}
    </p>
  );
}

/** The sheet of an open draft at rest: the rows and their create action. Null when there is nothing to show. */
function OpenTray(p: BarProps) {
  const { draft, run, items, composing = false, notice, onRun } = p;
  const done = isDone(p);
  // A file being read or refused this session is always shown: the rows are the only progress an upload has.
  const uploading = items.some((i) => i.kind === 'file' && i.status !== 'read');
  const reading = isReading(p);
  const canRun = (!done || !!p.newInput) && !reading;
  const rows = items.length > 0 && (canRun || uploading || reading);
  const runNote = run && (run.state === 'failed' || run.state === 'capped') ? run : null;
  if (!rows && !runNote && !notice) return null;
  return (
    <div className={SHEET} data-testid="canvas-bar">
      {runNote && <RunNote run={runNote} hasDraft={done} />}
      {rows && <CanvasMaterialList rows={items} />}
      {actionOffered(p) && <CanvasCreateBar hasBase={draft.baseVersionId !== null} revising={done} composing={composing} onRun={onRun} />}
      {notice && <Notice text={notice} />}
    </div>
  );
}

/** A closed draft: one quiet line (and, for a published one the owner wrote after, the way to a new version). */
function ClosedStrip({ draft, askedAfterPublish, composing, notice, onStartNew }: BarProps) {
  return (
    <div className={STRIP} data-testid="canvas-bar">
      {draft.state === 'discarded' ? (
        <p className="text-sm text-muted-foreground">This draft was discarded.</p>
      ) : askedAfterPublish ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="min-w-0 flex-1 text-sm text-foreground">{PUBLISHED_QUESTION}</p>
          <Button variant={composing ? 'outline' : 'default'} className="min-h-11" onClick={onStartNew}>
            {NEW_VERSION_LABEL}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">This version is published.</p>
      )}
      {notice && <Notice text={notice} />}
    </div>
  );
}

/** The tray itself: pure, so the P955 gate fixture can render every state of it. */
export function CanvasThreadBar(props: BarProps) {
  if (props.draft.state !== 'open') return <ClosedStrip {...props} />;
  if (props.running || props.busy) {
    return (
      <div className={SHEET} data-testid="canvas-bar">
        <Progress busy={props.busy} run={props.run} running={props.running} />
        {props.notice && <Notice text={props.notice} />}
      </div>
    );
  }
  return <OpenTray {...props} />;
}

/** The draft card at the end of the thread: shown for an open, finished draft while no run or request is going. */
export function CanvasDraftEnd(props: BarProps) {
  if (props.draft.state !== 'open' || props.running || props.busy || !isDone(props)) return null;
  return <CanvasDraftCard canvasName={props.draft.canvasName} openPath={props.viewDraftPath ?? null} nextSeq={props.nextSeq ?? null} composing={props.composing} updating={updateOffered(props)} onPublish={props.onPublish} />;
}
