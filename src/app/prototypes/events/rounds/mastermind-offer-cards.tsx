/**
 * @file mastermind-offer-cards.tsx
 * @description P1529: the owner's next-version card (and the "could not read it" card) that the round card shows between rounds, built
 * from the round state apart from the round poll. The card lives in the Table tab, before and after the evening ends (UAT 2026-11-13 (d), H3); Feedback only links to it. Wording is a draft: [FOUNDER DECISION: copy].
 */
import type { NavigateFunction } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { EventRoundsState } from '@/app/data/event-rounds-service';
import { canvasPageHref } from '@/app/pages/chat/canvas-links';
import { plainCanvasState, workspaceHref } from '@/lib/canvas-hrefs';
import { discussionRoundLabel } from './mastermind-host-helpers';
import type { EventRoomMember, EventRoomSelf } from '@/app/types';
import { firstName } from './use-event-rounds';
import type { OwnerUpdate } from './use-mastermind-round';
import { MastermindUpdateTask } from './MastermindUpdateTask';
import { EVENING_OVER, taskFace } from './mastermind-round-helpers';

export function offerCards({ owner, ownCanvas, state, roster, self, live, over = false, linkState, navigate }: {
  owner: OwnerUpdate;
  /** The person's own canvas tag at this event (null: none known). */
  ownCanvas: string | null;
  state: EventRoundsState;
  roster: EventRoomMember[];
  self: EventRoomSelf;
  /** A round is running: the card is never shown then. */
  live: boolean;
  /** The evening is over: the cards carry the heading "The evening is over" themselves (H3). */
  over?: boolean;
  linkState: unknown;
  navigate: NavigateFunction;
}) {
  // The next-version card is shown only between rounds (after the host ends a round, before the next starts, and after the evening ends).
  const face = live ? null : taskFace(owner.offer);
  const offerRound = state.rounds.find(r => r.id === owner.offer?.roundId);
  const mySlug = roster.find(m => m.id === self.id)?.profileSlug ?? self.profileSlug;
  const draftHref = (d: { canvasName: string | null; versionName: string | null } | null) => (mySlug && d?.canvasName ? workspaceHref(mySlug, d.canvasName, d.versionName) : null);
  const partnerOf = (roundId: string): string | null => {
    const seats = state.seatsByRound.get(roundId) ?? [];
    const mineAt = seats.find(s => s.id === self.id && s.role === 'first');
    const partner = mineAt ? seats.find(s => s.table === mineAt.table && s.role === 'second') : undefined;
    return partner ? firstName(roster.find(m => m.id === partner.id)?.displayName ?? '') || null : null;
  };
  // P1529 G5: a person with a canvas at this event gets the way to it between rounds; one way only, so a card that already links the canvas ("Open it" once published) keeps it alone.
  const myCanvasHref = face === 'published' ? null : canvasPageHref(mySlug, owner.canvasName ?? ownCanvas ?? owner.draft?.canvasName ?? null);
  const taskCard = face && offerRound && (
    <MastermindUpdateTask
      face={face}
      owner={owner}
      roundName={discussionRoundLabel(state.rounds, offerRound)}
      partner={partnerOf(offerRound.id)}
      tweakHref={draftHref(owner.draft)}
      openHref={canvasPageHref(mySlug, owner.canvasName ?? ownCanvas ?? owner.draft?.canvasName ?? null)}
      canvasHref={myCanvasHref}
      heading={over ? EVENING_OVER : null}
      linkState={linkState}
      onMake={() => void owner.make(d => { const to = draftHref(d); if (to) navigate(to, { state: plainCanvasState(linkState) }); })}
    />
  );
  // A failed read of the offer is said, with Try again; what was shown before (if anything) may be out of date.
  const readFailedCard = !live && owner.readFailed && (
    <section className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm" role="alert" data-testid="mastermind-offer-failed">
      <p>Could not read your next version.</p>
      <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11" onClick={() => void owner.reread()} data-testid="mastermind-offer-retry">Try again</Button>
    </section>
  );
  return { task: taskCard, readFailedCard, myCanvasHref };
}
