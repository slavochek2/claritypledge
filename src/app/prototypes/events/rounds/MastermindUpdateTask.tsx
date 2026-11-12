/**
 * @file MastermindUpdateTask.tsx
 * @description P1529 §6 (D6, D23, reversed 2026-11-11; redesigned UAT 2026-11-11): the card the Clarity Canvas owner sees BETWEEN rounds
 * (and on the Feedback tab once the evening ends), one per round they owned. ONE message per state: the transcript is on its way; the round
 * is in (primary "Create next version", centred "Preview first" under it); making it; published (with "Open it"); nothing to add (calm grey
 * text, no Try again: an unchanged canvas is an outcome, never a failure); and, only for a real failure, "Could not make your next version"
 * with a secondary Try again. Never shown during a running round (the card decides that). Stances are never asked for here (D7).
 */
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ARTIFACTS_CANVASES_DRAFTS } from '@/lib/canvas-hrefs';
import type { OwnerUpdate } from './use-mastermind-round';
import {
  nothingToAdd, publishedLine, taskTitle, TASK_FAILED, TASK_MAKE_BODY, TASK_WORKING, wordsMissing, wordsPreparing, type TaskFace,
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
  chatHref = null,
  linkState,
  onPreview,
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
  /** The round's chat with the transcript, when one is known: "Open the transcript" under "nothing to add". */
  chatHref?: string | null;
  /** Router state that makes the canvas page offer "Back to your table". */
  linkState: unknown;
  /** "Preview first" before a draft exists: makes the draft (no auto publish), then opens it. */
  onPreview: () => void;
}) {
  const { busy, note } = owner;
  // A finished draft that changes nothing: a calm outcome with no button (the draft's publish was refused as "no changes").
  // (publishFailed is bound to the draft's revision: an edited draft is ready again, so this clears.)
  const nothingNew = face === 'ready' && owner.publishFailed && note?.kind === 'nothing_new';
  const preview = tweakHref && (
    <Link to={tweakHref} state={linkState} className={`${LINK} self-center`} data-testid="mastermind-tweak">Preview first</Link>
  );
  return (
    <section className="rounded-xl border border-blue-200 bg-card p-5 shadow-sm" data-testid="mastermind-task" data-face={nothingNew ? 'nothing_new' : face}>
      {/* [FOUNDER DECISION: copy] every sentence on this card */}
      {face === 'make' && (
        <>
          <h2 className="text-xl font-semibold" data-testid="mastermind-task-title">{taskTitle(roundName, partner)}</h2>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="mastermind-task-body">{TASK_MAKE_BODY}</p>
          <div className={CENTRED}>
            <Button type="button" className={PRIMARY} onClick={() => void owner.make()} disabled={busy} aria-busy={busy} data-testid="mastermind-make">
              Create next version
            </Button>
            <button type="button" className={`${LINK} mt-1 disabled:opacity-50`} onClick={onPreview} disabled={busy} data-testid="mastermind-preview">
              Preview first
            </button>
          </div>
        </>
      )}

      {face === 'pending' && <p className="text-sm" role="status" data-testid="mastermind-task-pending">{wordsPreparing(roundName, partner)}</p>}

      {face === 'missing' && <p className="text-sm" data-testid="mastermind-task-missing">{wordsMissing(roundName)}</p>}

      {face === 'creating' && (
        <div role="status" data-testid="mastermind-task-creating">
          <Skeleton className="h-4 w-2/3" />
          <p className="mt-2 text-sm text-muted-foreground">{TASK_WORKING}</p>
          <div className="mt-1 flex flex-col">{preview}</div>
        </div>
      )}

      {nothingNew && (
        <div data-testid="mastermind-task-nothing-new">
          <p className="text-sm text-muted-foreground">{nothingToAdd(roundName, partner)}</p>
          {owner.discardFailed && (
            <button type="button" className={`${LINK} mt-1 block`} onClick={() => void owner.closeDraft()} disabled={busy} data-testid="mastermind-task-close">Close this</button>
          )}
          {chatHref && <Link to={chatHref} className={`${LINK} mt-1`} data-testid="mastermind-task-transcript">Open the transcript</Link>}
        </div>
      )}

      {face === 'ready' && !nothingNew && (
        <>
          <p className="text-sm" data-testid="mastermind-task-ready">{owner.publishFailed ? TASK_FAILED : 'Your next version is ready to publish.'}</p>
          <div className={CENTRED}>
            <Button
              type="button"
              variant={owner.publishFailed ? 'outline' : 'default'}
              className={owner.publishFailed ? 'min-h-11 px-6' : PRIMARY}
              onClick={() => void owner.publish()}
              disabled={busy}
              data-testid="mastermind-publish"
            >
              {owner.publishFailed ? 'Try again' : 'Publish'}
            </Button>
            {preview}
          </div>
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
          <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> {publishedLine(owner.publishedSeq)}
          {openHref && <Link to={openHref} state={linkState} className="font-medium text-blue-600" data-testid="mastermind-task-open">Open it</Link>}
        </p>
      )}

      {face === 'no_recording' && <p className="text-sm" data-testid="mastermind-task-no-recording">No recording from this round</p>}

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

      {note && !(nothingNew && note.kind === 'nothing_new') && note.face !== face && (
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
