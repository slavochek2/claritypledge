/**
 * @file mastermind-offer-cards.tsx
 * @description P1529: the owner's next-version card (and the "could not read it" card) that the round card shows between rounds, built
 * from the round state apart from the round poll. On the Feedback tab the card goes BELOW the feedback (order-last in the room's column),
 * under a small heading. Wording is a draft: [FOUNDER DECISION: copy].
 */
import { createPortal } from 'react-dom';
import type { NavigateFunction } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { EventRoundsState } from '@/app/data/event-rounds-service';
import { canvasPageHref } from '@/app/pages/chat/canvas-links';
import { workspaceHref } from '@/lib/canvas-hrefs';
import { roundLabel } from '@/lib/round-numbering';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';
import { firstName } from './use-event-rounds';
import type { OwnerUpdate } from './use-mastermind-round';
import { MastermindUpdateTask } from './MastermindUpdateTask';
import { nothingToAdd, taskFace } from './mastermind-round-helpers';

export function offerCards({ owner, state, roster, self, live, feedbackSlot, linkState, navigate }: {
  owner: OwnerUpdate;
  state: EventRoundsState;
  roster: EventRoomMember[];
  self: EventRoomSelf;
  /** A round is running: the card is never shown then. */
  live: boolean;
  /** The Feedback tab's slot AFTER the feedback block: the cards are portalled into it so DOM and focus order put feedback first. Null elsewhere. */
  feedbackSlot: HTMLElement | null;
  linkState: unknown;
  navigate: NavigateFunction;
}) {
  // The next-version card is shown only between rounds (after the host ends a round, before the next starts, and after the evening ends).
  const face = live ? null : taskFace(owner.offer, owner.publishFailed || owner.handEdited);
  const offerRound = state.rounds.find(r => r.id === owner.offer?.roundId);
  const mySlug = roster.find(m => m.id === self.id)?.profileSlug ?? self.profileSlug;
  const draftHref = (d: { canvasName: string | null; versionName: string | null } | null) => (mySlug && d?.canvasName ? workspaceHref(mySlug, d.canvasName, d.versionName) : null);
  const partnerOf = (roundId: string): string | null => {
    const seats = state.seatsByRound.get(roundId) ?? [];
    const mineAt = seats.find(s => s.id === self.id && s.role === 'first');
    const partner = mineAt ? seats.find(s => s.table === mineAt.table && s.role === 'second') : undefined;
    return partner ? firstName(roster.find(m => m.id === partner.id)?.displayName ?? '') || null : null;
  };
  const settled = !live && !face && owner.nothingRound ? state.rounds.find(r => r.id === owner.nothingRound) : undefined;
  const settledCard = settled && (
    <section className="rounded-xl border border-border bg-card p-5" data-testid="mastermind-task-nothing-new">
      <p className="text-sm text-muted-foreground">{nothingToAdd(roundLabel(state.rounds, settled), partnerOf(settled.id))}</p>
    </section>
  );
  const taskCard = settledCard || face && offerRound && (
    <MastermindUpdateTask
      face={face}
      owner={owner}
      roundName={roundLabel(state.rounds, offerRound)}
      partner={partnerOf(offerRound.id)}
      tweakHref={draftHref(owner.draft)}
      openHref={canvasPageHref(mySlug, owner.canvasName ?? owner.draft?.canvasName ?? null)}
      linkState={linkState}
      onPreview={() => void owner.preview(d => { const to = draftHref(d); if (to) navigate(to, { state: linkState }); })}
    />
  );
  // A failed read of the offer is said, with Try again; what was shown before (if anything) may be out of date.
  const readFailedCard = !live && owner.readFailed && (
    <section className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm" role="alert" data-testid="mastermind-offer-failed">
      <p>Could not read your next version.</p>
      <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => void owner.reread()} data-testid="mastermind-offer-retry">Try again</Button>
    </section>
  );
  // On the Feedback tab the feedback comes first, in DOM order too: both cards go into the slot after it, under a small heading.
  const after = (taskCard || readFailedCard) && feedbackSlot && createPortal(
    <div data-testid="mastermind-task-after-feedback">
      <h3 className="mb-2 text-sm font-medium text-muted-foreground">Before you go: your next version</h3>
      <div className="space-y-4">{readFailedCard}{taskCard}</div>
    </div>,
    feedbackSlot,
  );
  const task = feedbackSlot ? after : taskCard;
  return { task, readFailedCard: feedbackSlot ? null : readFailedCard };
}
