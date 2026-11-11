/**
 * @file MastermindUpdateTask.tsx
 * @description P1529 §6 (D6, D23, reversed 2026-11-11): the round card the Clarity Canvas owner sees BETWEEN rounds, one per round they
 * owned: "{round} with {partner}: words ready", "Create next version" (drafts and publishes in one tap), "Preview first" (the draft, with
 * the back-to-table banner). It is never shown during a running round, in any role (the card decides that). Stances are never asked for
 * here (D7). Wording is a draft: [FOUNDER DECISION: copy, proposed].
 */
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ARTIFACTS_CANVASES_DRAFTS } from '@/lib/canvas-hrefs';
import type { OwnerUpdate } from './use-mastermind-round';
import { taskTitle, wordsMissing, wordsPreparing, type TaskFace } from './mastermind-round-helpers';

const PRIMARY = 'mt-3 h-auto w-full min-h-12 whitespace-normal py-3 text-base bg-blue-500 hover:bg-blue-700 text-white';
const LINK = 'inline-flex min-h-10 items-center text-sm font-medium text-blue-600';

export function MastermindUpdateTask({
  face,
  owner,
  roundName,
  partner,
  tweakHref,
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
  /** Router state that makes the canvas page offer "Back to your table". */
  linkState: unknown;
  /** "Preview first" before a draft exists: makes the draft (no auto publish), then opens it. */
  onPreview: () => void;
}) {
  const { busy, note } = owner;
  const preview = tweakHref && (
    <Link to={tweakHref} state={linkState} className={`${LINK} mt-1`} data-testid="mastermind-tweak">Preview first</Link>
  );
  return (
    <section className="rounded-xl border border-blue-200 bg-card p-5 shadow-sm" data-testid="mastermind-task" data-face={face}>
      <h2 className="text-xl font-semibold" data-testid="mastermind-task-title">{taskTitle(roundName, partner)}</h2>

      {face === 'make' && (
        <>
          <Button type="button" className={PRIMARY} onClick={() => void owner.make()} disabled={busy} aria-busy={busy} data-testid="mastermind-make">
            Create next version
          </Button>
          <Button type="button" variant="link" className="mt-1 h-auto min-h-10 px-0 text-sm" onClick={onPreview} disabled={busy} data-testid="mastermind-preview">
            Preview first
          </Button>
        </>
      )}

      {face === 'pending' && <p className="mt-2 text-sm" role="status" data-testid="mastermind-task-pending">{wordsPreparing(roundName)}</p>}

      {face === 'missing' && <p className="mt-2 text-sm" data-testid="mastermind-task-missing">{wordsMissing(roundName)}</p>}

      {face === 'creating' && (
        <div className="mt-3" role="status" data-testid="mastermind-task-creating">
          <Skeleton className="h-4 w-2/3" />
          <p className="mt-2 text-sm text-muted-foreground">Your next version is being created and published.</p>
          {preview}
        </div>
      )}

      {face === 'ready' && (
        <>
          <p className="mt-2 text-sm" data-testid="mastermind-task-ready">Your next version is ready.</p>
          <Button type="button" className={PRIMARY} onClick={() => void owner.publish()} disabled={busy} data-testid="mastermind-publish">
            {owner.publishFailed ? 'Try again' : 'Publish'}
          </Button>
          {preview}
        </>
      )}

      {face === 'failed' && (
        <>
          <p className="mt-2 text-sm" data-testid="mastermind-task-failed">The next version did not work. Your canvas stays as it is.</p>
          <Button type="button" className={PRIMARY} onClick={() => void owner.retry()} disabled={busy} data-testid="mastermind-retry">
            Try again
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
