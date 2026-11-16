/**
 * @file MastermindUpdateTask.tsx
 * @description P1529 §6 (D6, D23, reversed 2026-11-11; redesigned UAT 2026-11-11): the card the Clarity Canvas owner sees BETWEEN rounds
 * (and on the Feedback tab once the evening ends), one per round they owned. ONE message per state: the transcript is on its way; the round
 * is in (primary "Create next version": makes a draft; the owner stays in the room); making it (from the tap on); ready (P1686: the draft's changes, then Publish and Open full draft, NextVersionChanges); published (with "Open it"); and, only for a real failure, "Could not make your next version" with a secondary Try again. Publish on this card appears only under the draft's changes (never blind, decisions.md 2026-11-13 [product]); the workspace's Publish returns to the room.
 * Never shown during a running round (the card decides that). Stances are never asked for here (D7).
 */
import { OpenYourCanvas } from './OpenYourCanvas';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ARTIFACTS_CANVASES_DRAFTS, plainCanvasState, tablePublishReturnState } from '@/lib/canvas-hrefs';
import { NextVersionChanges } from './NextVersionChanges';
import { useNextVersionChanges } from './use-next-version-changes';
import type { OwnerUpdate } from './use-mastermind-round';
import {
  publishedLine, taskTitle, TASK_FAILED, TASK_MAKE_BODY, TASK_WORKING, wordsMissing, wordsPreparing, WORDS_NOT_UNDERSTOOD, type TaskFace,
} from './mastermind-round-helpers';

const PRIMARY = 'min-h-12 px-8 text-base';
const LINK = 'inline-flex min-h-10 items-center text-sm font-medium text-blue-600 underline';
const CENTRED = 'mt-3 flex flex-col items-center';

export function MastermindUpdateTask({
  face,
  owner,
  roundName,
  partner,
  tweakHref,
  openHref = null,
  canvasHref = null,
  heading = null,
  linkState,
  ownerId = null,
  onMake,
}: {
  face: TaskFace;
  owner: OwnerUpdate;
  /** The round's label (roundLabel). */
  roundName: string;
  /** The partner's first name at the round's table, or null. */
  partner: string | null;
  /** The owner's draft workspace, or null while it is not known. */
  tweakHref: string | null;
  /** The owner's canvas page, for "Open it" once the next version is published. */
  openHref?: string | null;
  /** The owner's canvas page for "Open your canvas" under the primary, on every face that does not already link it (null: none). */
  canvasHref?: string | null;
  /** After the evening ends the card carries its heading ("The evening is over") itself: one card, not an empty one above it. */
  heading?: string | null;
  /** Router state that makes the canvas page offer "Back to your table". */
  linkState: unknown;
  /** P1686: the signed-in owner's id, for reading the draft's changes on the ready face. */
  ownerId?: string | null;
  /** "Create next version": makes the draft (never published by the tap); the owner stays in the room. */
  onMake: () => void;
}) {
  const { busy, note } = owner;
  // Under the evening's heading the card's own title is subordinate: smaller and a lighter weight, a level lower.
  const Title = heading ? 'h3' : 'h2';
  // From the tap until the draft opens the card already says it is working (no silent greyed button).
  const working = face === 'creating' || (face === 'make' && busy);
  // The owner's own draft opens plain, never in Compare; the way back to the table stays, and (P1686) its Publish returns to the table.
  const draftState = tablePublishReturnState(linkState);
  const ready = face === 'ready';
  const changes = useNextVersionChanges({ ownerId: ready ? ownerId : null, canvasName: ready ? owner.draft?.canvasName ?? null : null, versionName: ready ? owner.draft?.versionName ?? null : null, onSettled: () => void owner.reread() });
  // The way to the draft is never missing: the link when its address is known, else (after the bounded retries) Try again.
  const draftLink = tweakHref ? (
    <Button asChild className={face === 'ready' ? PRIMARY : 'min-h-11 px-6'} variant={face === 'ready' ? 'default' : 'outline'}>
      <Link to={tweakHref} state={draftState} data-testid="mastermind-tweak">Open your draft</Link>
    </Button>
  ) : owner.draftFailed && (
    <Button type="button" variant="outline" className="min-h-11 px-6" onClick={owner.retryDraft} data-testid="mastermind-draft-retry">Try again</Button>
  );
  return (
    <section className="rounded-xl border border-blue-200 bg-card p-5 shadow-sm" data-testid="mastermind-task" data-face={face}>
      {/* [FOUNDER DECISION: copy] every sentence on this card */}
      {heading && <h2 className="mb-3 text-xl font-semibold" data-testid="mastermind-over-heading">{heading}</h2>}
      {face === 'make' && !busy && (
        <>
          <Title className={heading ? 'text-base font-medium' : 'text-xl font-semibold'} data-testid="mastermind-task-title">{taskTitle(roundName, partner)}</Title>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="mastermind-task-body">{TASK_MAKE_BODY}</p>
          <div className={CENTRED}>
            <Button type="button" className={PRIMARY} onClick={onMake} data-testid="mastermind-make">
              Create next version
            </Button>
          </div>
        </>
      )}

      {face === 'pending' && <p className="text-sm" role="status" data-testid="mastermind-task-pending">{wordsPreparing(roundName, partner)}</p>}

      {face === 'missing' && <p className="text-sm" data-testid="mastermind-task-missing">{wordsMissing(roundName)}</p>}

      {working && (
        <div role="status" data-testid="mastermind-task-creating">
          <Skeleton className="h-4 w-2/3" />
          <p className="mt-2 text-sm text-muted-foreground">{TASK_WORKING}</p>
          {face === 'creating' && <div className={CENTRED}>{draftLink}</div>}
        </div>
      )}

      {face === 'ready' && (
        <>
          {/* With the draft's address unreadable there is nothing to read the changes from: only the card's Try again below (never a spinner beside it). */}
          {!(!owner.draft && owner.draftFailed) && <NextVersionChanges changes={changes} fullHref={tweakHref} fullState={draftState} />}
          {!tweakHref && owner.draftFailed && (
            <div className={CENTRED}>
              {draftLink}
              <p className="mt-2 text-sm text-muted-foreground" data-testid="mastermind-draft-unreadable">Could not open your draft yet.</p>
            </div>
          )}
        </>
      )}

      {face === 'failed' && (
        <>
          <p className="text-sm" data-testid="mastermind-task-failed">{TASK_FAILED}</p>
          <div className={CENTRED}>
            <Button type="button" variant="outline" className="min-h-11 px-6" onClick={() => void owner.retry()} disabled={busy} data-testid="mastermind-retry">
              Try again
            </Button>
          </div>
        </>
      )}

      {face === 'published' && (
        <p className="inline-flex flex-wrap items-center gap-x-1.5 text-sm" data-testid="mastermind-task-published">
          <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> {publishedLine(null)}
          {openHref && <Link to={openHref} state={plainCanvasState(linkState)} className="font-medium text-blue-600" data-testid="mastermind-task-open">Open it</Link>}
        </p>
      )}

      {face === 'no_recording' && <p className="text-sm" data-testid="mastermind-task-no-recording">No recording from this round</p>}
      {face === 'not_understood' && <p className="text-sm" data-testid="mastermind-task-not-understood">{WORDS_NOT_UNDERSTOOD}</p>}

      {face === 'no_canvas' && (
        <p className="text-sm" data-testid="mastermind-task-no-canvas">
          You have no Clarity Canvas shared with this event, so there is nothing to update.
        </p>
      )}

      {face === 'draft_open' && (
        <>
          <p className="text-sm" data-testid="mastermind-task-draft-open">You already have a draft open. Publish it or discard it first.</p>
          <Link to={ARTIFACTS_CANVASES_DRAFTS} className={LINK}>Open your drafts</Link>
        </>
      )}

      {canvasHref && face !== 'published' && face !== 'no_canvas' && <OpenYourCanvas href={canvasHref} linkState={linkState} testId="mastermind-task-canvas" />}

      {note && note.face !== face && (
        <p
          className={note.kind === 'error' && face !== 'ready' ? 'mt-2 text-sm text-destructive' : 'mt-2 text-sm text-muted-foreground'}
          role="status"
          data-testid="mastermind-task-note"
        >
          {note.text}
        </p>
      )}
    </section>
  );
}
