/**
 * @file MastermindUpdateTask.tsx
 * @description P1529 §6 (D6, D23): the Clarity Canvas owner's one task after a round, "Make my next version", then
 * publish the draft as it is (or look and tweak first). Stances are never asked for here (D7). While the person is seated in a
 * round it shrinks to one quiet line (the event room never stands between two people talking). Wording is a draft:
 * [FOUNDER DECISION: copy].
 */
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ARTIFACTS_CANVASES_DRAFTS } from '@/lib/canvas-hrefs';
import type { OwnerUpdate } from './use-mastermind-round';
import { COLLAPSED_LINE, WORDS_PREPARING, taskSource, taskTitle, type TaskFace } from './mastermind-round-helpers';

const PRIMARY = 'mt-3 h-auto w-full min-h-12 whitespace-normal py-3 text-base bg-blue-500 hover:bg-blue-700 text-white';
const LINK = 'inline-flex min-h-10 items-center text-sm font-medium text-blue-600';
/** Faces with nothing to tap: in a round they stay a plain line, with no toggle. */
const STATIC: ReadonlySet<TaskFace> = new Set(['no_recording', 'no_canvas', 'published']);
/** Faces where the round is known to be the offer's. get_my_update_state carries no round (state, draftId, revision, runId), so an open draft may come from an earlier round: those faces name none. */
const SOURCED: ReadonlySet<TaskFace> = new Set(['make', 'pending']);

export function MastermindUpdateTask({
  face,
  owner,
  inStep,
  collapsed,
  roundName,
  tweakHref,
  open,
  setOpen,
}: {
  face: TaskFace;
  owner: OwnerUpdate;
  /** The host started the canvas-update step: the task is the screen. */
  inStep: boolean;
  /** Seated in a round: one quiet line. */
  collapsed: boolean;
  /** The Clarity Canvas owner's round the version is made from, named by roundLabel. */
  roundName: string | null;
  /** The owner's draft workspace, or null while it is not known. */
  tweakHref: string | null;
  /** Held by the card: the task moves in the card's tree when the room's view changes, which would reset state held here. */
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const { busy, note } = owner;

  if (collapsed && !open) {
    return STATIC.has(face) ? (
      <p className="px-1 text-sm text-muted-foreground" data-testid="mastermind-task-line">{COLLAPSED_LINE[face]}</p>
    ) : (
      <button
        type="button"
        className="flex min-h-10 w-full items-center justify-between gap-2 px-1 text-left text-sm text-muted-foreground"
        aria-expanded={false}
        onClick={() => setOpen(true)}
        data-testid="mastermind-task-line"
      >
        {COLLAPSED_LINE[face]}
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
    );
  }

  const Heading = inStep ? 'h2' : 'h3';
  return (
    <section
      className={inStep ? 'rounded-xl border border-blue-200 bg-card p-5 shadow-sm' : 'rounded-xl border border-border bg-card p-4'}
      data-testid="mastermind-task"
      data-face={face}
    >
      <Heading className={inStep ? 'text-xl font-semibold' : 'text-base font-medium'} data-testid="mastermind-task-title">{taskTitle(SOURCED.has(face) ? roundName : null)}</Heading>
      {roundName && SOURCED.has(face) && <p className="mt-1 text-sm text-muted-foreground" data-testid="mastermind-task-source">{taskSource(roundName)}</p>}

      {face === 'pending' && (
        // The round's words are still being cleaned: the wait, and no button until they are ready (the offer is re-read while pending).
        <p className="mt-2 text-sm" role="status" data-testid="mastermind-task-pending">{WORDS_PREPARING}</p>
      )}

      {face === 'make' && (
        <Button type="button" className={PRIMARY} onClick={() => void owner.make()} disabled={busy} aria-busy={busy} data-testid="mastermind-make">
          {busy ? 'Starting…' : 'Make my next version'}
        </Button>
      )}

      {face === 'drafting' && (
        <p className="mt-2 text-sm" role="status" data-testid="mastermind-task-drafting">Your mirror is drafting your next version.</p>
      )}

      {face === 'ready' && (
        <>
          <p className="mt-2 text-sm" data-testid="mastermind-task-ready">Your next version is ready.</p>
          <Button type="button" className={PRIMARY} onClick={() => void owner.publish()} disabled={busy} data-testid="mastermind-publish">
            {busy ? 'Publishing…' : 'Publish'}
          </Button>
          {tweakHref && <Link to={tweakHref} className={`${LINK} mt-1`} data-testid="mastermind-tweak">Look at it and tweak first</Link>}
        </>
      )}

      {face === 'failed' && (
        <>
          <p className="mt-2 text-sm" data-testid="mastermind-task-failed">The draft did not work. Tap Try again to have your mirror draft it once more.</p>
          <Button type="button" className={PRIMARY} onClick={() => void owner.retry()} disabled={busy} data-testid="mastermind-retry">
            {busy ? 'Trying again…' : 'Try again'}
          </Button>
        </>
      )}

      {face === 'published' && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm" data-testid="mastermind-task-published">
          <Check className="h-4 w-4 text-green-600" aria-hidden="true" /> Your next version is published.
        </p>
      )}

      {face === 'no_recording' && <p className="mt-2 text-sm" data-testid="mastermind-task-no-recording">No recording from this round</p>}

      {face === 'no_canvas' && (
        <p className="mt-2 text-sm" data-testid="mastermind-task-no-canvas">
          You have no Clarity Canvas shared with this event, so there is nothing to update.
        </p>
      )}

      {face === 'draft_open' && (
        <>
          <p className="mt-2 text-sm" data-testid="mastermind-task-draft-open">You already have a draft open. Publish it or discard it first.</p>
          <Link to={ARTIFACTS_CANVASES_DRAFTS} className={LINK}>Open your drafts</Link>
        </>
      )}

      {note && note.face !== face && (
        <p
          className={note.kind === 'error' ? 'mt-2 text-sm text-destructive' : 'mt-2 text-sm text-muted-foreground'}
          role="status"
          data-testid="mastermind-task-note"
        >
          {note.text}
        </p>
      )}
    </section>
  );
}
